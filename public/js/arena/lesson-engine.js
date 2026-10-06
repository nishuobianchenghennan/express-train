// public/js/arena/lesson-engine.js
/**
 * 学习模式引擎（纯函数）。
 *
 * 一课的顺序遵循“示范 → 逐步撤除提示 → 迁移”：
 *   intro（场景、结构与经典框架）→ model（示范拆解 + 反例对比）
 *   → retell1（完整提示：步骤 + 句式）→ check1
 *   → retell2（减少提示：只剩步骤名）→ check2
 *   → transfer（换到另一条线的语境，只给步骤名）→ check3 → done
 */
import { CONTEXT_MAP, PARADIGMS, PARADIGM_MAP, PRACTICE_CARDS, PRACTICE_CARD_MAP, stepKey } from "../curriculum/index.js";

export { stepKey };

export const LESSON_PHASES = Object.freeze(["intro", "model", "retell1", "check1", "retell2", "check2", "transfer", "check3", "done"]);
export const LESSON_TAKES = Object.freeze(["retell1", "retell2", "transfer"]);
export const LESSON_STATUSES = Object.freeze(["in_progress", "completed", "abandoned"]);
// 复述没有硬性时限；超过建议时长两倍再加 30 秒时自动结束，避免忘记停止
export const LESSON_TAKE_GRACE_SECONDS = 30;
export const LESSON_SCHEMA_VERSION = 2;
const RECENT_DAYS = 3;
const DAY_MS = 86_400_000;

const CHECK_PHASE_TAKE = Object.freeze({ check1: "retell1", check2: "retell2", check3: "transfer" });

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `lesson-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pick(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

/** 课程推荐顺序：就是课序。 */
export const LESSON_ORDER = PARADIGMS;

/** 只认新版课程记录；旧课程（schemaVersion 1）一律不参与新版进度。 */
function currentRuns(runs) {
  return runs.filter((run) => run.schemaVersion === LESSON_SCHEMA_VERSION && PARADIGM_MAP.has(run.paradigmId));
}

/** 当前阶段对应的表达（take）槽位；非表达或检查阶段返回 null。 */
export function lessonTakeSlot(phase) {
  if (LESSON_TAKES.includes(phase)) return phase;
  return CHECK_PHASE_TAKE[phase] ?? null;
}

/**
 * 迁移题卡：本课为主范式、语境在 transferContextIds 中。
 * 优先与示范语境不同线；其中优先没用作过本课迁移题的，都用过时选最久未用的。
 */
export function pickTransferCard(paradigm, { runs = [], random = Math.random } = {}) {
  const exampleLine = CONTEXT_MAP.get(paradigm.exampleContextId).line;
  const pool = PRACTICE_CARDS.filter((card) => card.paradigmId === paradigm.id && paradigm.transferContextIds.includes(card.contextId));
  const crossLine = pool.filter((card) => card.line !== exampleLine);
  const candidates = crossLine.length ? crossLine : pool;
  const lastUsed = new Map();
  for (const run of currentRuns(runs).filter((item) => item.paradigmId === paradigm.id)) {
    // 没有日期的记录取空串，视为最久远；ISO 时间戳直接用 < / > 比较
    const time = run.completedAt ?? run.startedAt ?? "";
    if (!lastUsed.has(run.transferCardId) || time > lastUsed.get(run.transferCardId)) lastUsed.set(run.transferCardId, time);
  }
  const fresh = candidates.filter((card) => !lastUsed.has(card.id));
  if (fresh.length) return pick(fresh, random);
  const usedAt = (card) => lastUsed.get(card.id) ?? "";
  return [...candidates].sort((left, right) => (usedAt(left) < usedAt(right) ? -1 : usedAt(left) > usedAt(right) ? 1 : 0))[0];
}

function emptyTake() {
  return { recordingId: null, durationSeconds: null, noRecording: false };
}

/** 创建一次新版课程记录，并选定本课的迁移题卡。 */
export function createLessonRun(paradigm, { runs = [], random = Math.random, now = Date.now() } = {}) {
  return {
    runId: randomId(),
    schemaVersion: LESSON_SCHEMA_VERSION,
    paradigmId: paradigm.id,
    transferCardId: pickTransferCard(paradigm, { runs, random }).id,
    phase: "intro",
    status: "in_progress",
    phaseStartedAt: null,
    startedAt: new Date(now).toISOString(),
    completedAt: null,
    takes: { retell1: emptyTake(), retell2: emptyTake(), transfer: emptyTake() },
    checks: { retell1: {}, retell2: {}, transfer: {} },
    lesson: "",
  };
}

/** 某次检查需要判断的全部键：范式步骤；迁移检查再加迁移题卡所属语境的关键行为。 */
export function checkKeys(run, phase) {
  const paradigm = PARADIGM_MAP.get(run.paradigmId);
  const keys = paradigm.steps.map((_, index) => stepKey(index));
  if (phase === "check3") keys.push(...PRACTICE_CARD_MAP.get(run.transferCardId).keyChecks);
  return keys;
}

/** 校验当前阶段能否进入下一阶段（表达是否完成、检查是否判断完整）。 */
export function validateLessonPhase(run) {
  if (LESSON_TAKES.includes(run.phase)) {
    const take = run.takes[run.phase];
    if (!take.recordingId && !take.noRecording) {
      return { valid: false, message: "请先完成这次表达（录音，或选择只计时不录音）。" };
    }
  }
  const slot = CHECK_PHASE_TAKE[run.phase];
  if (slot) {
    const missing = checkKeys(run, run.phase).filter((key) => typeof run.checks[slot][key] !== "boolean");
    if (missing.length) return { valid: false, message: `还有 ${missing.length} 项没有判断。` };
  }
  return { valid: true, message: "" };
}

/** 进入下一阶段；到 done 时标记完成。 */
export function advanceLesson(run, now = Date.now()) {
  const index = LESSON_PHASES.indexOf(run.phase);
  if (index < 0 || index >= LESSON_PHASES.length - 1) return run;
  const phase = LESSON_PHASES[index + 1];
  return {
    ...run,
    phase,
    phaseStartedAt: now,
    status: phase === "done" ? "completed" : run.status,
    completedAt: phase === "done" ? new Date(now).toISOString() : run.completedAt,
  };
}

/** 每次表达讲到了几个结构步骤。 */
export function stepCoverage(run, slot) {
  const paradigm = PARADIGM_MAP.get(run.paradigmId);
  const hit = paradigm.steps.filter((_, index) => run.checks[slot]?.[stepKey(index)] === true).length;
  return { hit, total: paradigm.steps.length };
}

/** 上一次检查中没讲到的步骤，用于下一次表达时重点提示。 */
export function missedSteps(run, slot) {
  const paradigm = PARADIGM_MAP.get(run.paradigmId);
  return paradigm.steps.map((item, index) => ({ ...item, index })).filter((item) => run.checks[slot]?.[stepKey(item.index)] === false);
}

/** 各课的学习进度：完成次数与最近完成时间（只统计新版记录）。 */
export function lessonProgress(runs) {
  const progress = {};
  for (const run of currentRuns(runs)) {
    if (run.status !== "completed") continue;
    const entry = (progress[run.paradigmId] ??= { completed: 0, lastCompletedAt: null });
    entry.completed += 1;
    if (!entry.lastCompletedAt || run.completedAt > entry.lastCompletedAt) entry.lastCompletedAt = run.completedAt;
  }
  return progress;
}

/** 已学范式：至少完成过一次新版课程。练习回合只从这些范式出题。 */
export function learnedParadigms(runs) {
  return new Set(Object.keys(lessonProgress(runs)));
}

/** 最近 3 天内学完的范式，选题时加权。 */
export function recentlyLearned(runs, now = Date.now()) {
  const progress = lessonProgress(runs);
  return new Set(Object.entries(progress).filter(([, entry]) => now - new Date(entry.lastCompletedAt).getTime() <= RECENT_DAYS * DAY_MS).map(([id]) => id));
}

/** 推荐下一课：按课序第一课没学过的；全部学过后推荐最久没复习的一课。 */
export function recommendedLesson(runs) {
  const progress = lessonProgress(runs);
  const unlearned = LESSON_ORDER.find((item) => !progress[item.id]);
  if (unlearned) return unlearned;
  // 没有完成时间的记录按最久远处理
  const lastAt = (item) => progress[item.id].lastCompletedAt ?? "";
  return [...LESSON_ORDER].sort((left, right) => (lastAt(left) < lastAt(right) ? -1 : lastAt(left) > lastAt(right) ? 1 : 0))[0];
}
