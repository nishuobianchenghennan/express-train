// public/js/legacy/engines.js
/**
 * 冻结的旧版引擎函数。
 *
 * 只服务 schemaVersion 1 的旧回合与旧课程：导入校验、历史只读展示、能力页旧版统计。
 * 新代码不得引用本模块；新版逻辑见 arena/engine.js 与 arena/lesson-engine.js。
 */
import { ARENA_CARD_MAP } from "./scenarios.js";
import { LESSON_MAP } from "./lessons.js";

export const LEGACY_DRILL_PHASES = Object.freeze(["brief", "prep1", "take1", "check1", "learn", "prep2", "take2", "check2", "done"]);
export const LEGACY_DRILL_MODES = Object.freeze(["full", "quick"]);
export const LEGACY_DRILL_STATUSES = Object.freeze(["in_progress", "completed", "abandoned"]);
export const LEGACY_LESSON_PHASES = Object.freeze(["intro", "model", "retell1", "check1", "retell2", "check2", "transfer", "check3", "done"]);
export const LEGACY_LESSON_TAKES = Object.freeze(["retell1", "retell2", "transfer"]);
export const LEGACY_LESSON_STATUSES = Object.freeze(["in_progress", "completed", "abandoned"]);

const WEAKNESS_WINDOW = 20;

function legacyStepKey(index) {
  return `s${index}`;
}

/** 旧课程某次检查需要判断的全部键（复制自旧 lesson-engine.checkKeys）。 */
export function legacyLessonCheckKeys(run, phase) {
  const lesson = LESSON_MAP.get(run.scenarioId);
  const keys = lesson.steps.map((_, index) => legacyStepKey(index));
  if (phase === "check3") keys.push(...ARENA_CARD_MAP.get(run.transferCardId).checks);
  return keys;
}

function drillTime(drill) {
  return new Date(drill.completedAt ?? drill.startedAt ?? 0).getTime();
}

/** 旧回合中已完成的部分，按时间升序。 */
export function legacyCompletedDrills(drills) {
  return drills
    .filter((drill) => drill.schemaVersion !== 2 && drill.status === "completed")
    .sort((left, right) => drillTime(left) - drillTime(right));
}

/** 旧回合的结果摘要（复制自旧 engine.drillOutcome）。 */
export function legacyDrillOutcome(drill) {
  const card = ARENA_CARD_MAP.get(drill.cardId);
  if (!card) return null;
  const passed = (slot) => card.checks.filter((id) => drill.checks[slot]?.[id] === true).length;
  const focus = drill.focusCheckId;
  const focusFixed = Boolean(focus && drill.checks.first[focus] === false && drill.checks.second[focus] === true);
  const firstPassed = passed("first");
  const secondPassed = passed("second");
  return { firstPassed, secondPassed, total: card.checks.length, focusFixed, improved: focusFixed || secondPassed > firstPassed };
}

/** 旧回合各检查项的首轮/重讲做到率（复制自旧 engine.checkRates）。 */
export function legacyCheckRates(drills, window = WEAKNESS_WINDOW) {
  const rates = {};
  for (const drill of legacyCompletedDrills(drills).slice(-window)) {
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
