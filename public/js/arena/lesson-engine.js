/**
 * 学习模式引擎（纯函数）。
 *
 * 一课的顺序遵循“示范 → 逐步撤除提示 → 迁移”：
 *   intro（场景与结构）→ model（示范拆解 + 反例对比）
 *   → retell1（完整提示：步骤 + 句式）→ check1
 *   → retell2（减少提示：只剩步骤名）→ check2
 *   → transfer（换一个行业，只给步骤名）→ check3 → done
 */
import { ARENA_CARD_MAP, ARENA_CARDS, SCENARIO_MAP } from "./scenarios.js";
import { LESSON_MAP, LESSONS } from "./lessons.js";

export const LESSON_PHASES = Object.freeze(["intro", "model", "retell1", "check1", "retell2", "check2", "transfer", "check3", "done"]);
export const LESSON_TAKES = Object.freeze(["retell1", "retell2", "transfer"]);
export const LESSON_STATUSES = Object.freeze(["in_progress", "completed", "abandoned"]);
// 复述没有硬性时限；超过建议时长两倍再加 30 秒时自动结束，避免忘记停止
export const LESSON_TAKE_GRACE_SECONDS = 30;

const CHECK_PHASE_TAKE = Object.freeze({ check1: "retell1", check2: "retell2", check3: "transfer" });

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `lesson-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function stepKey(index) {
  return `s${index}`;
}

/** 课程推荐顺序：先易后难，同难度按场景库顺序。 */
export const LESSON_ORDER = Object.freeze(
  [...LESSONS].sort((left, right) => SCENARIO_MAP.get(left.scenarioId).difficulty - SCENARIO_MAP.get(right.scenarioId).difficulty),
);

export function exampleCard(lesson) {
  return ARENA_CARD_MAP.get(`${lesson.scenarioId}--${lesson.exampleIndustry}`);
}

/** 当前阶段对应的表达（take）槽位；非表达或检查阶段返回 null。 */
export function lessonTakeSlot(phase) {
  if (LESSON_TAKES.includes(phase)) return phase;
  return CHECK_PHASE_TAKE[phase] ?? null;
}

/** 迁移卡：同一场景、不同于示范的行业，优先选这一课以前没迁移过的行业。 */
export function pickTransferCard(lesson, { runs = [], random = Math.random } = {}) {
  const used = new Set(runs.filter((run) => run.scenarioId === lesson.scenarioId).map((run) => run.transferCardId));
  const pool = ARENA_CARDS.filter((card) => card.scenarioId === lesson.scenarioId && card.industryId !== lesson.exampleIndustry);
  const fresh = pool.filter((card) => !used.has(card.id));
  const candidates = fresh.length ? fresh : pool;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

function emptyTake() {
  return { recordingId: null, durationSeconds: null, noRecording: false };
}

export function createLessonRun(lesson, { runs = [], random = Math.random, now = Date.now() } = {}) {
  return {
    runId: randomId(),
    schemaVersion: 1,
    scenarioId: lesson.scenarioId,
    exampleCardId: exampleCard(lesson).id,
    transferCardId: pickTransferCard(lesson, { runs, random }).id,
    phase: "intro",
    status: "in_progress",
    startedAt: new Date(now).toISOString(),
    completedAt: null,
    takes: { retell1: emptyTake(), retell2: emptyTake(), transfer: emptyTake() },
    checks: { retell1: {}, retell2: {}, transfer: {} },
    lesson: "",
  };
}

/** 某次检查需要判断的全部键：结构步骤，迁移检查还要加上该场景的关键行为。 */
export function checkKeys(run, phase) {
  const lesson = LESSON_MAP.get(run.scenarioId);
  const keys = lesson.steps.map((_, index) => stepKey(index));
  if (phase === "check3") {
    keys.push(...ARENA_CARD_MAP.get(run.transferCardId).checks);
  }
  return keys;
}

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
    if (missing.length) {
      return { valid: false, message: `还有 ${missing.length} 项没有判断。` };
    }
  }
  return { valid: true, message: "" };
}

export function advanceLesson(run, now = Date.now()) {
  const index = LESSON_PHASES.indexOf(run.phase);
  if (index < 0 || index >= LESSON_PHASES.length - 1) return run;
  const phase = LESSON_PHASES[index + 1];
  return {
    ...run,
    phase,
    status: phase === "done" ? "completed" : run.status,
    completedAt: phase === "done" ? new Date(now).toISOString() : run.completedAt,
  };
}

/** 每次表达讲到了几个结构步骤。 */
export function stepCoverage(run, slot) {
  const lesson = LESSON_MAP.get(run.scenarioId);
  const hit = lesson.steps.filter((_, index) => run.checks[slot]?.[stepKey(index)] === true).length;
  return { hit, total: lesson.steps.length };
}

/** 上一次检查中没讲到的步骤，用于下一次表达时重点提示。 */
export function missedSteps(run, slot) {
  const lesson = LESSON_MAP.get(run.scenarioId);
  return lesson.steps.map((item, index) => ({ ...item, index })).filter((item) => run.checks[slot]?.[stepKey(item.index)] === false);
}

/** 各课的学习进度：完成次数与最近完成时间。 */
export function lessonProgress(runs) {
  const progress = {};
  for (const run of runs) {
    if (run.status !== "completed") continue;
    const entry = (progress[run.scenarioId] ??= { completed: 0, lastCompletedAt: null });
    entry.completed += 1;
    if (!entry.lastCompletedAt || run.completedAt > entry.lastCompletedAt) entry.lastCompletedAt = run.completedAt;
  }
  return progress;
}

export function learnedScenarios(runs) {
  return new Set(Object.keys(lessonProgress(runs)));
}

/** 推荐下一课：按推荐顺序第一课没学过的；全部学过后推荐最久没复习的一课。 */
export function recommendedLesson(runs) {
  const progress = lessonProgress(runs);
  const unlearned = LESSON_ORDER.find((item) => !progress[item.scenarioId]);
  if (unlearned) return unlearned;
  return [...LESSON_ORDER].sort((left, right) => progress[left.scenarioId].lastCompletedAt.localeCompare(progress[right.scenarioId].lastCompletedAt))[0];
}
