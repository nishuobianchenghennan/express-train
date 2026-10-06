// public/js/arena/engine.js
/**
 * 练习回合引擎（纯函数，无 DOM 依赖）。
 *
 * 一个回合的顺序刻意设计为“先开口、后补课”：
 *   brief → prep1（选结构引导）→ take1（中途插入打断）→ check1（可观察清单）
 *   → learn（揭晓本题最优方案，仅完整回合）→ prep2（揭晓追问）→ take2 → check2 → done
 * 依据：先尝试后学习、压力下练习才能迁移到压力场景、任务层面的具体反馈优于笼统自评。
 *
 * 只处理 schemaVersion 2 的新版回合；旧回合的统计见 legacy/engines.js。
 */
import { LINES, LINE_WEIGHTS } from "../curriculum/contexts.js";
import { CHECKS, PRESSURES } from "../curriculum/checks.js";
import { PRESSURE_CHECK_ID } from "../curriculum/ids.js";
import { PARADIGM_MAP, PRACTICE_CARDS, PRACTICE_CARD_MAP, isStepKey } from "../curriculum/index.js";

const DAY_MS = 86_400_000;
export const DRILL_SCHEMA_VERSION = 2;
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
const REVISIT_PROBABILITY = 0.5;
const WEAKNESS_MIN_ATTEMPTS = 3;
const WEAKNESS_WINDOW = 20;
const WEAKNESS_THRESHOLD = 70;
const WEAKNESS_PROBABILITY = 0.6;
const RECENT_LEARNED_WEIGHT = 1.5;
const DEDUPE_WINDOWS = [30, 10, 0];

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `drill-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pick(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function drillTime(drill) {
  return new Date(drill.completedAt ?? drill.startedAt ?? 0).getTime();
}

/** 新版、已完成、题卡仍存在的回合，按时间升序。 */
function completedDrills(drills) {
  return drills
    .filter((drill) => drill.schemaVersion === DRILL_SCHEMA_VERSION && drill.status === "completed" && PRACTICE_CARD_MAP.has(drill.cardId))
    .sort((left, right) => (drillTime(left) || 0) - (drillTime(right) || 0));
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
 * 创建一个练习回合。
 *
 * @param {object} card 运行时题卡
 * @param {object} options mode / selectionReason / revisitOf / avoidPressures / random / now
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
    schemaVersion: DRILL_SCHEMA_VERSION,
    cardId: card.id,
    cardVersion: card.version,
    contextId: card.contextId,
    paradigmId: card.paradigmId,
    line: card.line,
    industryId: card.industryId ?? null,
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

/** 回合的阶段顺序；闪电回合跳过“学习”阶段。 */
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

/** 当前阶段对应的表达槽位（first / second）；其他阶段返回 null。 */
export function takeSlot(phase) {
  if (phase === "take1" || phase === "check1") return "first";
  if (phase === "take2" || phase === "check2") return "second";
  return null;
}

/** 校验当前阶段能否进入下一阶段。 */
export function validatePhase(drill, card) {
  const slot = takeSlot(drill.phase);
  if (drill.phase === "take1" || drill.phase === "take2") {
    const take = drill.takes[slot];
    if (!take.recordingId && !take.noRecording) return { valid: false, message: "请先完成这次表达（录音，或选择只计时不录音）。" };
  }
  if (drill.phase === "check1" || drill.phase === "check2") {
    const missing = card.checks.filter((id) => typeof drill.checks[slot][id] !== "boolean");
    if (missing.length) return { valid: false, message: `还有 ${missing.length} 项没有判断“做到 / 没做到”。` };
    if (drill.phase === "check1" && (!drill.focusCheckId || !card.checks.includes(drill.focusCheckId))) return { valid: false, message: "请选定重讲时唯一要改的一项。" };
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

/** 重讲目标建议：第一个首轮没做到的项（范式步骤排在前面）；全部做到时选“接住打断”。 */
export function suggestFocus(drill, card) {
  const failed = card.checks.filter((id) => drill.checks.first[id] === false);
  return failed[0] ?? PRESSURE_CHECK_ID;
}

/** 某一轮表达中做到的检查项数量。 */
export function passCount(drill, slot, card) {
  return card.checks.filter((id) => drill.checks[slot]?.[id] === true).length;
}

/** 回合结果摘要。 */
export function drillOutcome(drill, card) {
  const total = card.checks.length;
  const firstPassed = passCount(drill, "first", card);
  const secondPassed = passCount(drill, "second", card);
  const focus = drill.focusCheckId;
  const focusFixed = Boolean(focus && drill.checks.first[focus] === false && drill.checks.second[focus] === true);
  return { firstPassed, secondPassed, total, focusFixed, improved: focusFixed || secondPassed > firstPassed };
}

/** 首轮漏掉的范式步骤序号，用于在最优方案中高亮对应句子。 */
export function missedStepIndexes(drill, card) {
  return card.steps.map((_, index) => index).filter((index) => drill.checks.first?.[`s${index}`] === false);
}

/** 行为做到率：只统计 CHECKS 中的检查项（含接住打断），最近 20 个完成回合的首轮与重讲。 */
export function behaviorRates(drills, window = WEAKNESS_WINDOW) {
  // 统计按当前题卡定义计算：旧版本题卡中已移除的键，其作答记录会被忽略
  const rates = {};
  for (const drill of completedDrills(drills).slice(-window)) {
    const card = PRACTICE_CARD_MAP.get(drill.cardId);
    for (const id of card.checks.filter((key) => !isStepKey(key))) {
      if (typeof drill.checks.first?.[id] !== "boolean") continue;
      const entry = (rates[id] ??= { attempts: 0, firstPassed: 0, secondPassed: 0 });
      entry.attempts += 1;
      if (drill.checks.first[id]) entry.firstPassed += 1;
      if (drill.checks.second?.[id]) entry.secondPassed += 1;
    }
  }
  for (const entry of Object.values(rates)) {
    entry.firstRate = Math.round((entry.firstPassed / entry.attempts) * 100);
    entry.secondRate = Math.round((entry.secondPassed / entry.attempts) * 100);
  }
  return rates;
}

/** 结构覆盖率：按范式统计首轮讲出的步骤比例（在该范式的回合上取平均），步骤不跨范式合并。 */
export function structureRates(drills, window = WEAKNESS_WINDOW) {
  // 统计按当前题卡定义计算：旧版本题卡中已移除的键，其作答记录会被忽略
  const totals = {};
  for (const drill of completedDrills(drills).slice(-window)) {
    const card = PRACTICE_CARD_MAP.get(drill.cardId);
    const hit = card.steps.filter((_, index) => drill.checks.first?.[`s${index}`] === true).length;
    const entry = (totals[card.paradigmId] ??= { attempts: 0, sum: 0 });
    entry.attempts += 1;
    entry.sum += hit / card.steps.length;
  }
  return Object.fromEntries(Object.entries(totals).map(([id, entry]) => [id, { attempts: entry.attempts, coverage: Math.round((entry.sum / entry.attempts) * 100) }]));
}

/**
 * 当前弱项：行为弱项与结构弱项中较低的一个；相等时取行为弱项。
 *
 * @returns {{ kind: "behavior"|"structure", id: string, rate: number }|null}
 */
export function currentWeakness(drills) {
  const behavior = Object.entries(behaviorRates(drills))
    .filter(([, entry]) => entry.attempts >= WEAKNESS_MIN_ATTEMPTS && entry.firstRate < WEAKNESS_THRESHOLD)
    .map(([id, entry]) => ({ kind: "behavior", id, rate: entry.firstRate, attempts: entry.attempts }));
  const structure = Object.entries(structureRates(drills))
    .filter(([, entry]) => entry.attempts >= WEAKNESS_MIN_ATTEMPTS && entry.coverage < WEAKNESS_THRESHOLD)
    .map(([id, entry]) => ({ kind: "structure", id, rate: entry.coverage, attempts: entry.attempts }));
  const kindRank = { behavior: 0, structure: 1 };
  const sorted = [...behavior, ...structure].sort((left, right) => left.rate - right.rate || kindRank[left.kind] - kindRank[right.kind] || right.attempts - left.attempts);
  return sorted[0] ? { kind: sorted[0].kind, id: sorted[0].id, rate: sorted[0].rate } : null;
}

/** 题卡是否考核这个弱项。 */
export function cardTargetsWeakness(card, weakness) {
  if (weakness.kind === "structure") return card.paradigmId === weakness.id;
  return card.checks.includes(weakness.id);
}

/** 弱项的展示名称；没有弱项时返回空串。 */
export function weaknessLabel(weakness) {
  if (!weakness) return "";
  return weakness.kind === "structure" ? `${PARADIGM_MAP.get(weakness.id)?.title ?? weakness.id}的结构` : CHECKS[weakness.id]?.label ?? weakness.id;
}

/** 到期复练：完成 3–30 天、首轮有没做到的项、且还没被复练过的回合。 */
export function dueRevisits(drills, now = Date.now()) {
  const done = completedDrills(drills);
  const revisited = new Set(done.map((drill) => drill.revisitOf).filter(Boolean));
  return done.filter((drill) => {
    const age = (now - drillTime(drill)) / DAY_MS;
    // 日期无效（NaN）的回合不参与复练
    if (!Number.isFinite(age)) return false;
    if (drill.revisitOf || revisited.has(drill.drillId) || age < REVISIT_MIN_DAYS || age > REVISIT_MAX_DAYS) return false;
    const card = PRACTICE_CARD_MAP.get(drill.cardId);
    return card.checks.some((id) => drill.checks.first?.[id] === false);
  });
}

/** 复练选择结果：沿用原卡并避开上次的打断与追问。 */
export function revisitSelection(revisit, card = PRACTICE_CARD_MAP.get(revisit.cardId), now = Date.now()) {
  return {
    card,
    reason: `间隔复练 · ${Math.round((now - drillTime(revisit)) / DAY_MS)} 天前练过`,
    revisitOf: revisit.drillId,
    avoidPressures: [revisit.interruptId, revisit.followupId],
  };
}

/** 目标难度随完成量逐步提高：0–5 个回合为 1，6–17 个为 2，18 个以上为 3。 */
export function targetDifficulty(drills) {
  const completed = completedDrills(drills).length;
  return completed < 6 ? 1 : completed < 18 ? 2 : 3;
}

/** 软过滤：过滤后为空就保留原候选，保证不会清空候选、不会推翻选中的线。 */
function softFilter(candidates, predicate) {
  const filtered = candidates.filter(predicate);
  return filtered.length ? filtered : candidates;
}

function weightedPick(items, weightOf, random) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= weightOf(item);
    if (cursor < 0) return item;
  }
  return items.at(-1);
}

/**
 * 练习选题（设计 §7.5）。
 *
 * 顺序：已学范式候选 → 到期复练（50%）→ 去重（30 → 10 → 不排除）→ 按线权重选线
 *   → 交错 / 难度 / 弱项（软过滤）→ 刚学范式 ×1.5 加权抽取。
 *
 * @param {object} options cards / drills / learned（已学范式）/ recent（刚学范式）/ careerStage / now / random
 * @returns {{ card: object, reason: string, revisitOf: string|null, avoidPressures: string[] }|null} 没学任何范式时返回 null
 */
export function selectPracticeCard({ cards = PRACTICE_CARDS, drills = [], learned = new Set(), recent = new Set(), careerStage = "phd", now = Date.now(), random = Math.random } = {}) {
  const pool = cards.filter((card) => card.status === "active" && learned.has(card.paradigmId));
  if (!pool.length) return null;
  const done = completedDrills(drills);
  const revisit = dueRevisits(drills, now).find((drill) => pool.some((card) => card.id === drill.cardId));
  // 复练使用注入的题卡集合（pool）中的卡，而不是全局题卡表
  if (revisit && random() < REVISIT_PROBABILITY) return revisitSelection(revisit, pool.find((card) => card.id === revisit.cardId), now);

  let candidates = pool;
  for (const windowSize of DEDUPE_WINDOWS) {
    const recentIds = new Set(windowSize ? done.slice(-windowSize).map((drill) => drill.cardId) : []);
    candidates = pool.filter((card) => !recentIds.has(card.id));
    if (candidates.length) break;
  }

  const weights = LINE_WEIGHTS[careerStage] ?? LINE_WEIGHTS.phd;
  const lines = Object.keys(weights).filter((line) => weights[line] > 0 && candidates.some((card) => card.line === line));
  const availableLines = lines.length ? lines : [...new Set(candidates.map((card) => card.line))];
  const line = weightedPick(availableLines, (item) => weights[item] || 1, random);
  candidates = candidates.filter((card) => card.line === line);
  const reasons = [LINES[line].label];

  const last = done.at(-1);
  if (last) candidates = softFilter(candidates, (card) => card.contextId !== last.contextId && card.paradigmId !== last.paradigmId);

  // 已知取舍：结构弱项往往来自上一回合的范式，交错过滤会先把它排除，
  // 因此结构弱项常在隔一回合后才被强化；行为弱项不受影响
  const weakness = currentWeakness(drills);
  const maxDifficulty = targetDifficulty(drills) + (weakness ? 1 : 0);
  candidates = softFilter(candidates, (card) => card.difficulty <= maxDifficulty);

  if (weakness && random() < WEAKNESS_PROBABILITY) {
    const targeted = candidates.filter((card) => cardTargetsWeakness(card, weakness));
    if (targeted.length) {
      candidates = targeted;
      reasons.push(`强化弱项「${weaknessLabel(weakness)}」`);
    }
  }

  const card = weightedPick(candidates, (item) => (recent.has(item.paradigmId) ? RECENT_LEARNED_WEIGHT : 1), random);
  if (recent.has(card.paradigmId)) reasons.push("刚学的范式");
  return { card, reason: reasons.join(" · "), revisitOf: null, avoidPressures: [] };
}

/** 首页抽题动画：在候选卡中插入选中卡，返回卡序列与中奖位置。 */
export function drawSequence({ cards = PRACTICE_CARDS, winner, length = 12, random = Math.random } = {}) {
  const others = cards.filter((card) => card.id !== winner.id);
  // 没有其他候选卡时用中奖卡自己填充，避免出现 undefined
  const filler = others.length ? others : [winner];
  const size = Math.max(1, length);
  // 中奖卡停在倒数第 3 张；序列过短时退到开头
  const winnerIndex = Math.max(0, size - 3);
  const sequence = Array.from({ length: size - 1 }, () => pick(filler, random));
  sequence.splice(winnerIndex, 0, winner);
  return { cards: sequence, winnerIndex };
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

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return counts;
}

/** 练习统计（只统计新版回合）。 */
export function practiceStats(drills, now = Date.now()) {
  const done = completedDrills(drills);
  const today = localDayKey(now);
  const rates = behaviorRates(drills);
  const outcomes = done.map((drill) => drillOutcome(drill, PRACTICE_CARD_MAP.get(drill.cardId)));
  const pressure = rates[PRESSURE_CHECK_ID];
  return {
    completed: done.length,
    today: done.filter((drill) => localDayKey(drill.completedAt) === today).length,
    last7: done.filter((drill) => now - drillTime(drill) <= 7 * DAY_MS).length,
    streak: streakDays(done, now),
    rates,
    structure: structureRates(drills),
    weakness: currentWeakness(drills),
    improvementRate: outcomes.length ? Math.round((outcomes.filter((item) => item.improved).length / outcomes.length) * 100) : 0,
    pressureRate: pressure?.attempts ? pressure.firstRate : null,
    lineCounts: countBy(done, "line"),
    contextsCovered: new Set(done.map((drill) => drill.contextId)).size,
    revisitsDue: dueRevisits(drills, now).length,
  };
}

/** 打断或追问的展示文案；未知 id 返回空串。 */
export function pressureText(id) {
  return PRESSURES[id] ?? "";
}
