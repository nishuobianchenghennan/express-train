/**
 * 训练记忆（纯函数）：每次出题前从练习与课程记录现算，不另存，所以永远是最新的。
 *
 * - trainingDigest：发给模型的训练摘要（30 课进度、难度目标、本题结构各步覆盖率、
 *   行为弱项、最近练过的题、最近“带走的一句话”）。
 * - focusStepIndexes：本结构首轮最常漏掉的步骤，作为出题时“重点考查的步骤”。
 * - recentTrainingLog：给“练习观察”提炼用的最近回合记录。
 */
import { CHECKS } from "../curriculum/checks.js";
import { LINES } from "../curriculum/contexts.js";
import { STAGE_NAMES } from "../curriculum/ids.js";
import { PARADIGM_MAP, PRACTICE_CARD_MAP, checkLabel, stepKey } from "../curriculum/index.js";
import { behaviorRates, targetDifficulty } from "../arena/engine.js";
import { learnedParadigms, recommendedLesson } from "../arena/lesson-engine.js";

const RECENT_LESSONS = 3;
const RECENT_DRILLS = 5;
const RECENT_TAKEAWAYS = 3;
const STEP_MIN_ATTEMPTS = 2;
const FOCUS_STEP_THRESHOLD = 70;
const MAX_FOCUS_STEPS = 2;
const WEAK_MIN_ATTEMPTS = 3;
const WEAK_THRESHOLD = 70;
const MAX_WEAK_BEHAVIORS = 2;
const TAKEAWAY_CHARS = 60;

/** 每完成这么多个新回合，提炼一次练习观察。 */
export const REFLECTION_INTERVAL = 5;

function byCompletedDesc(left, right) {
  return (right.completedAt ?? "").localeCompare(left.completedAt ?? "");
}

/** 新版、已完成、题卡仍存在的练习回合。 */
function completedDrills(drills) {
  return drills.filter((drill) => drill.schemaVersion === 2 && drill.status === "completed" && PRACTICE_CARD_MAP.has(drill.cardId));
}

/** 新版、已完成的课程记录。 */
function completedLessons(runs) {
  return runs.filter((run) => run.schemaVersion === 2 && run.status === "completed" && PARADIGM_MAP.has(run.paradigmId));
}

/**
 * 某个结构在练习中各步的首轮讲出率。
 *
 * @returns {{ index: number, label: string, attempts: number, rate: number }[]} 每一步的统计
 */
export function stepRates(drills, paradigmId) {
  const paradigm = PARADIGM_MAP.get(paradigmId);
  if (!paradigm) return [];
  const runs = completedDrills(drills).filter((drill) => drill.paradigmId === paradigmId);
  return paradigm.steps.map((step, index) => {
    const values = runs.map((drill) => drill.checks.first?.[stepKey(index)]).filter((value) => typeof value === "boolean");
    const passed = values.filter(Boolean).length;
    return { index, label: step.label, attempts: values.length, rate: values.length ? Math.round((passed / values.length) * 100) : 0 };
  });
}

/** 首轮最常漏掉的步骤（至少观察 2 次、讲出率低于 70%），最多 2 步。 */
export function focusStepIndexes(drills, paradigmId) {
  return stepRates(drills, paradigmId)
    .filter((item) => item.attempts >= STEP_MIN_ATTEMPTS && item.rate < FOCUS_STEP_THRESHOLD)
    .sort((left, right) => left.rate - right.rate || left.index - right.index)
    .slice(0, MAX_FOCUS_STEPS)
    .map((item) => item.index);
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 30 课进度：已学几课、正在哪个阶段、最近学的课。 */
function lessonLine(lessonRuns) {
  const learned = learnedParadigms(lessonRuns);
  if (!learned.size) return "- 30 课：还没学完任何一课";
  const recent = [...new Set(completedLessons(lessonRuns).sort(byCompletedDesc).map((run) => run.paradigmId))]
    .slice(0, RECENT_LESSONS)
    .map((id) => PARADIGM_MAP.get(id).title);
  const next = recommendedLesson(lessonRuns);
  const stage = learned.size >= PARADIGM_MAP.size
    ? "30 课已全部学完"
    : `正在第 ${next.stage} 阶段「${STAGE_NAMES[next.stage - 1]}」，下一课是「${next.title}」`;
  return `- 30 课：已学 ${learned.size} / 30，${stage}；最近学的：${recent.join("、")}`;
}

function weakBehaviorLine(drills) {
  const weak = Object.entries(behaviorRates(drills))
    .filter(([, entry]) => entry.attempts >= WEAK_MIN_ATTEMPTS && entry.firstRate < WEAK_THRESHOLD)
    .sort((left, right) => left[1].firstRate - right[1].firstRate)
    .slice(0, MAX_WEAK_BEHAVIORS);
  if (!weak.length) return "";
  return `- 行为弱项：${weak.map(([id, entry]) => `${CHECKS[id]?.label ?? id}（首轮做到 ${entry.firstRate}%，${entry.attempts} 次）`).join("；")}`;
}

function paradigmLine(drills, paradigmId) {
  const paradigm = PARADIGM_MAP.get(paradigmId);
  if (!paradigm) return "";
  const rates = stepRates(drills, paradigmId);
  if (!rates.some((item) => item.attempts)) return `- 本题结构「${paradigm.title}」：还没在练习中用过`;
  const attempts = Math.max(...rates.map((item) => item.attempts));
  const focus = focusStepIndexes(drills, paradigmId).map((index) => rates[index].label);
  return `- 本题结构「${paradigm.title}」：练过 ${attempts} 次；各步首轮讲出率：${rates.map((item) => `${item.label} ${item.attempts ? `${item.rate}%` : "—"}`).join("、")}${focus.length ? `；最常漏：${focus.join("、")}` : ""}`;
}

function recentDrillsLine(drills) {
  const items = completedDrills(drills).sort(byCompletedDesc).slice(0, RECENT_DRILLS).map((drill) => {
    const card = PRACTICE_CARD_MAP.get(drill.cardId);
    return `${card.title}（${LINES[card.line].label} · ${card.contextLabel}）`;
  });
  return items.length ? `- 最近练过：${items.join("；")}` : "";
}

function takeawaysLine(drills, lessonRuns) {
  const items = [...completedDrills(drills), ...completedLessons(lessonRuns)]
    .filter((record) => record.lesson?.trim())
    .sort(byCompletedDesc)
    .slice(0, RECENT_TAKEAWAYS)
    .map((record) => `“${truncate(record.lesson.trim(), TAKEAWAY_CHARS)}”`);
  return items.length ? `- 最近写下的“带走的一句话”：${items.join("；")}` : "";
}

/**
 * 发给模型的训练摘要。画像页“将发送给模型的内容”也用它（不带 paradigmId），保证所见即所发。
 *
 * @param {{ drills: object[], lessonRuns: object[], paradigmId?: string|null }} input 训练记录与本题结构
 * @returns {string} 摘要文本
 */
export function trainingDigest({ drills, lessonRuns, paradigmId = null }) {
  const done = completedDrills(drills).length;
  const lines = [
    lessonLine(lessonRuns),
    `- 练习：已完成 ${done} 个回合，当前难度目标 L${targetDifficulty(drills)}（1–3）`,
    paradigmId ? paradigmLine(drills, paradigmId) : "",
    weakBehaviorLine(drills),
    recentDrillsLine(drills),
    takeawaysLine(drills, lessonRuns),
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * 最近的练习记录，给“练习观察”提炼用：每回合只带题目、结构、没做到的项与带走的话。
 *
 * @returns {object[]} 按完成时间从新到旧
 */
export function recentTrainingLog(drills, limit = 10) {
  return completedDrills(drills).sort(byCompletedDesc).slice(0, limit).map((drill) => {
    const card = PRACTICE_CARD_MAP.get(drill.cardId);
    const missed = (slot) => card.checks.filter((id) => drill.checks[slot]?.[id] === false).map((id) => checkLabel(card, id));
    return {
      // 按本地日期，与界面上看到的日期一致
      date: new Date(drill.completedAt).toLocaleDateString("sv-SE"),
      title: card.title,
      context: `${LINES[card.line].label} · ${card.contextLabel}`,
      structure: card.paradigmTitle,
      missedFirst: missed("first"),
      missedSecond: missed("second"),
      focus: drill.focusCheckId ? checkLabel(card, drill.focusCheckId) : "",
      takeaway: truncate(drill.lesson?.trim() ?? "", TAKEAWAY_CHARS),
    };
  });
}

/** 某个时间之后完成的新回合数；没有时间时统计全部。 */
export function drillsCompletedSince(drills, iso) {
  return completedDrills(drills).filter((drill) => !iso || (drill.completedAt ?? "") > iso).length;
}
