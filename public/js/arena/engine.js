/**
 * 实战回合引擎（纯函数，无 DOM 依赖）。
 *
 * 一个回合的顺序刻意设计为“先开口、后补课”：
 *   brief → prep1 → take1（中途插入打断）→ check1（可观察清单）
 *   → learn（限时补课，仅完整回合）→ prep2（揭晓追问）→ take2 → check2 → done
 * 依据：先尝试后学习（productive failure / pretesting）、压力下练习才能迁移到压力场景、
 * 任务层面的具体反馈优于笼统自评。
 */
import { ARENA_CARD_MAP, ARENA_CARDS, CHECKS, PRESSURES } from "./scenarios.js";
import { INDUSTRIES } from "./industries.js";

const DAY_MS = 86_400_000;
export const DRILL_PHASES = Object.freeze(["brief", "prep1", "take1", "check1", "learn", "prep2", "take2", "check2", "done"]);
export const DRILL_MODES = Object.freeze(["full", "quick"]);
export const DRILL_STATUSES = Object.freeze(["in_progress", "completed", "abandoned"]);
export const LEARN_SECONDS = 300;
export const RETAKE_PREP_SECONDS = 20;
// 讲到时间上限后允许的收尾宽限，超出则自动停止录音
export const OVERTIME_GRACE_SECONDS = 10;
// 间隔复练：完成后至少隔 3 天、最多 30 天内再练同一张卡
const REVISIT_MIN_DAYS = 3;
const REVISIT_MAX_DAYS = 30;
const WEAKNESS_MIN_ATTEMPTS = 3;
const WEAKNESS_WINDOW = 20;
const LEARNED_PREFERENCE = 0.7;

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `drill-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pick(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function drillTime(drill) {
  return new Date(drill.completedAt ?? drill.startedAt ?? 0).getTime();
}

function completedDrills(drills) {
  return drills.filter((drill) => drill.status === "completed").sort((left, right) => drillTime(left) - drillTime(right));
}

function localDayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 打断出现在首次表达的中段（约 40%–60%），让人已经进入状态再被打乱。 */
export function interruptSecond(card, random = Math.random) {
  const ratio = 0.4 + random() * 0.2;
  return Math.max(5, Math.round(card.speakSeconds * ratio));
}

/**
 * 创建一个实战回合。
 *
 * @param {object} card 实战卡
 * @param {object} options mode / selectionReason / revisitOf / avoidPressures / random
 * @returns {object} 回合对象
 */
export function createDrill(card, options = {}) {
  const random = options.random ?? Math.random;
  const avoid = new Set(options.avoidPressures ?? []);
  const interrupts = card.interrupts.filter((id) => !avoid.has(id));
  const followups = card.followups.filter((id) => !avoid.has(id));
  const interruptId = pick(interrupts.length ? interrupts : card.interrupts, random);
  const followupPool = (followups.length ? followups : card.followups).filter((id) => id !== interruptId);
  return {
    drillId: randomId(),
    schemaVersion: 1,
    cardId: card.id,
    cardVersion: card.version,
    scenarioId: card.scenarioId,
    industryId: card.industryId,
    family: card.family,
    title: card.title,
    mode: options.mode === "quick" ? "quick" : "full",
    status: "in_progress",
    phase: "brief",
    phaseStartedAt: null,
    startedAt: new Date(options.now ?? Date.now()).toISOString(),
    completedAt: null,
    selectionReason: options.selectionReason ?? "手动选择",
    revisitOf: typeof options.revisitOf === "string" ? options.revisitOf : null,
    interruptId,
    interruptAt: interruptSecond(card, random),
    followupId: pick(followupPool.length ? followupPool : card.followups, random),
    takes: {
      first: { recordingId: null, durationSeconds: null, noRecording: false },
      second: { recordingId: null, durationSeconds: null, noRecording: false },
    },
    checks: { first: {}, second: {} },
    focusCheckId: null,
    notes: {},
    lesson: "",
  };
}

export function phaseSequence(mode) {
  return mode === "quick" ? DRILL_PHASES.filter((phase) => phase !== "learn") : [...DRILL_PHASES];
}

/** 每个阶段的倒计时秒数；无倒计时的阶段返回 0。 */
export function phaseSeconds(drill, card) {
  if (drill.phase === "prep1") return card.prepSeconds;
  if (drill.phase === "prep2") return RETAKE_PREP_SECONDS;
  if (drill.phase === "learn") return LEARN_SECONDS;
  if (drill.phase === "take1" || drill.phase === "take2") return card.speakSeconds;
  return 0;
}

export function takeSlot(phase) {
  if (phase === "take1" || phase === "check1") return "first";
  if (phase === "take2" || phase === "check2") return "second";
  return null;
}

/**
 * 校验当前阶段能否进入下一阶段。
 *
 * @returns {{ valid: boolean, message: string }}
 */
export function validatePhase(drill, card) {
  const slot = takeSlot(drill.phase);
  if (drill.phase === "take1" || drill.phase === "take2") {
    const take = drill.takes[slot];
    if (!take.recordingId && !take.noRecording) {
      return { valid: false, message: "请先完成这次表达（录音，或选择只计时不录音）。" };
    }
  }
  if (drill.phase === "check1" || drill.phase === "check2") {
    const missing = card.checks.filter((id) => typeof drill.checks[slot][id] !== "boolean");
    if (missing.length) {
      return { valid: false, message: `还有 ${missing.length} 项没有判断“做到 / 没做到”。` };
    }
    if (drill.phase === "check1" && !drill.focusCheckId) {
      return { valid: false, message: "请选定重讲时唯一要改的一项。" };
    }
  }
  return { valid: true, message: "" };
}

/** 进入下一阶段；到 done 时标记完成。 */
export function advanceDrill(drill, now = Date.now()) {
  const sequence = phaseSequence(drill.mode);
  const index = sequence.indexOf(drill.phase);
  if (index < 0 || index >= sequence.length - 1) return drill;
  const nextPhase = sequence[index + 1];
  return {
    ...drill,
    phase: nextPhase,
    phaseStartedAt: now,
    status: nextPhase === "done" ? "completed" : drill.status,
    completedAt: nextPhase === "done" ? new Date(now).toISOString() : drill.completedAt,
  };
}

/** 首轮全部做到时，自动建议“结论先行”以外的下一个高价值项，否则选第一个没做到的。 */
export function suggestFocus(drill, card) {
  const failed = card.checks.filter((id) => drill.checks.first[id] === false);
  if (failed.length) return failed[0];
  return card.checks.includes("handled_pressure") ? "handled_pressure" : card.checks[card.checks.length - 1];
}

export function passCount(drill, slot, card) {
  return card.checks.filter((id) => drill.checks[slot]?.[id] === true).length;
}

/**
 * 回合结果摘要。
 *
 * @returns {{ firstPassed: number, secondPassed: number, total: number, focusFixed: boolean, improved: boolean }}
 */
export function drillOutcome(drill, card) {
  const total = card.checks.length;
  const firstPassed = passCount(drill, "first", card);
  const secondPassed = passCount(drill, "second", card);
  const focus = drill.focusCheckId;
  const focusFixed = Boolean(focus && drill.checks.first[focus] === false && drill.checks.second[focus] === true);
  return { firstPassed, secondPassed, total, focusFixed, improved: focusFixed || secondPassed > firstPassed };
}

/** 各检查项的首轮/重讲做到率（只统计最近 WEAKNESS_WINDOW 个完成回合）。 */
export function checkRates(drills, window = WEAKNESS_WINDOW) {
  const rates = {};
  for (const drill of completedDrills(drills).slice(-window)) {
    const card = ARENA_CARD_MAP.get(drill.cardId);
    if (!card) continue;
    for (const id of card.checks) {
      const entry = (rates[id] ??= { attempts: 0, firstPassed: 0, secondPassed: 0 });
      if (typeof drill.checks.first?.[id] !== "boolean") continue;
      entry.attempts += 1;
      if (drill.checks.first[id]) entry.firstPassed += 1;
      if (drill.checks.second?.[id]) entry.secondPassed += 1;
    }
  }
  for (const entry of Object.values(rates)) {
    entry.firstRate = entry.attempts ? Math.round((entry.firstPassed / entry.attempts) * 100) : 0;
    entry.secondRate = entry.attempts ? Math.round((entry.secondPassed / entry.attempts) * 100) : 0;
  }
  return rates;
}

/** 弱项 = 首轮（冷启动）做到率最低、且观察次数足够的检查项。冷启动才反映真实临场水平。 */
export function weakestCheck(drills) {
  const candidates = Object.entries(checkRates(drills))
    .filter(([, entry]) => entry.attempts >= WEAKNESS_MIN_ATTEMPTS && entry.firstRate < 70)
    .sort((left, right) => left[1].firstRate - right[1].firstRate || right[1].attempts - left[1].attempts);
  return candidates[0]?.[0] ?? null;
}

/** 到期复练：完成 3–30 天、首轮有没做到的项、且还没被复练过的回合。 */
export function dueRevisits(drills, now = Date.now()) {
  const done = completedDrills(drills);
  const revisited = new Set(done.map((drill) => drill.revisitOf).filter(Boolean));
  return done.filter((drill) => {
    const age = (now - drillTime(drill)) / DAY_MS;
    if (drill.revisitOf || revisited.has(drill.drillId) || age < REVISIT_MIN_DAYS || age > REVISIT_MAX_DAYS) return false;
    const card = ARENA_CARD_MAP.get(drill.cardId);
    return card ? card.checks.some((id) => drill.checks.first?.[id] === false) : false;
  });
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return counts;
}

function minimumBy(items, score) {
  const lowest = Math.min(...items.map(score));
  return items.filter((item) => score(item) === lowest);
}

/** 目标难度随完成量逐步提高：前 6 回合以 L1–L2 为主，之后逐步纳入 L3。 */
export function targetDifficulty(drills) {
  const completed = completedDrills(drills).length;
  return completed < 6 ? 1 : completed < 18 ? 2 : 3;
}

/**
 * 自适应选卡。
 *
 * 优先级：到期复练（间隔重复）> 已学结构的场景 > 弱项场景 > 行业覆盖最少 > 场景家族交错（避免连续同类）。
 *
 * @returns {{ card: object, reason: string, revisitOf: string|null, avoidPressures: string[] }}
 */
export function selectArenaCard({ cards = ARENA_CARDS, drills = [], family = "", learned = new Set(), now = Date.now(), random = Math.random } = {}) {
  const pool = cards.filter((card) => card.status === "active" && (!family || card.family === family));
  if (!pool.length) throw new Error("当前范围没有可用的实战卡");
  const done = completedDrills(drills);
  const revisit = dueRevisits(drills, now).find((drill) => !family || drill.family === family);
  if (revisit && random() < 0.5) {
    const card = ARENA_CARD_MAP.get(revisit.cardId);
    if (card && pool.includes(card)) {
      return { card, reason: `间隔复练 · ${Math.round((now - drillTime(revisit)) / DAY_MS)} 天前练过`, revisitOf: revisit.drillId, avoidPressures: [revisit.interruptId, revisit.followupId] };
    }
  }
  const last = done[done.length - 1];
  const recentIds = new Set(done.slice(-30).map((drill) => drill.cardId));
  let candidates = pool.filter((card) => !recentIds.has(card.id));
  if (!candidates.length) candidates = pool;
  const reasons = [];
  // 学过的场景以 70% 概率优先出现，把学习模式里的结构用到新行业上
  if (learned.size) {
    const applied = candidates.filter((card) => learned.has(card.scenarioId));
    if (applied.length && random() < LEARNED_PREFERENCE) {
      candidates = applied;
      reasons.push("应用已学结构");
    }
  }
  const weak = weakestCheck(drills);
  if (weak) {
    const targeted = candidates.filter((card) => card.checks.includes(weak));
    if (targeted.length) {
      candidates = targeted;
      reasons.push(`强化弱项「${CHECKS[weak].label}」`);
    }
  }
  if (last && !family) {
    const interleaved = candidates.filter((card) => card.family !== last.family && card.scenarioId !== last.scenarioId);
    if (interleaved.length) candidates = interleaved;
  }
  // 针对弱项时放宽一级难度，否则入门阶段考核同一行为的场景太少，会反复出现同一类
  const maxDifficulty = targetDifficulty(drills) + (weak ? 1 : 0);
  const suitable = candidates.filter((card) => card.difficulty <= maxDifficulty);
  if (suitable.length) candidates = suitable;
  const industryCounts = countBy(done.filter((drill) => now - drillTime(drill) <= 30 * DAY_MS), "industryId");
  candidates = minimumBy(candidates, (card) => industryCounts[card.industryId] ?? 0);
  if (!(industryCounts[candidates[0].industryId] > 0)) reasons.push("拓展新行业");
  const card = pick(candidates, random);
  return { card, reason: reasons.length ? reasons.join(" · ") : "均衡轮换", revisitOf: null, avoidPressures: [] };
}

function streakDays(done, now) {
  const days = new Set(done.map((drill) => localDayKey(drill.completedAt)));
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 实战训练统计。 */
export function arenaStats(drills, now = Date.now()) {
  const done = completedDrills(drills);
  const today = localDayKey(now);
  const rates = checkRates(drills);
  const outcomes = done.map((drill) => {
    const card = ARENA_CARD_MAP.get(drill.cardId);
    return card ? drillOutcome(drill, card) : null;
  }).filter(Boolean);
  const pressure = rates.handled_pressure;
  const industryCounts = countBy(done, "industryId");
  const weak = weakestCheck(drills);
  return {
    completed: done.length,
    today: done.filter((drill) => localDayKey(drill.completedAt) === today).length,
    last7: done.filter((drill) => now - drillTime(drill) <= 7 * DAY_MS).length,
    streak: streakDays(done, now),
    rates,
    weakest: weak,
    improvementRate: outcomes.length ? Math.round((outcomes.filter((item) => item.improved).length / outcomes.length) * 100) : 0,
    pressureRate: pressure?.attempts ? pressure.firstRate : null,
    industryCounts,
    industriesCovered: Object.keys(industryCounts).length,
    industriesTotal: INDUSTRIES.length,
    familyCounts: countBy(done, "family"),
    revisitsDue: dueRevisits(drills, now).length,
  };
}

export function pressureText(id) {
  return PRESSURES[id] ?? "";
}
