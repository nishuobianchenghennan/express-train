/**
 * 课程体系入口：汇总 30 课、56 类语境与精选题卡，派生运行时题卡并建立索引。
 *
 * 加载时以结构模式校验全部内容，任何不合法的数据都会让应用启动失败，
 * 避免带病内容进入训练；数量是否写全由测试与构建以完整模式检查。
 */
import { CHECKS } from "./checks.js";
import { CONTEXTS, LINES } from "./contexts.js";
import { PRESSURE_CHECK_ID } from "./ids.js";
import { STAGE1_PARADIGMS } from "./paradigms/stage1-open.js";
import { STAGE2_PARADIGMS } from "./paradigms/stage2-clear.js";
import { STAGE3_PARADIGMS } from "./paradigms/stage3-spar.js";
import { STAGE4_PARADIGMS } from "./paradigms/stage4-drive.js";
import { STAGE5_PARADIGMS } from "./paradigms/stage5-founder.js";
import { ACADEMIC_CARDS } from "./cards/academic.js";
import { LIFE_CARDS } from "./cards/life.js";
import { BRIDGE_CARDS } from "./cards/bridge.js";
import { FOUNDER_CARDS } from "./cards/founder.js";
import { INDUSTRIES } from "../arena/industries.js";
import { validateCurriculum, validateGeneratedCard } from "./validate.js";

/** 题库版本：内容有实质修改时递增，写入回合记录。 */
export const CURRICULUM_VERSION = "2026.10.05-1";

/** 范式步骤的检查键，与学习模式共用。 */
export function stepKey(index) {
  return `s${index}`;
}

export function isStepKey(id) {
  return /^s\d+$/.test(id);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export const PARADIGMS = Object.freeze(
  [...STAGE1_PARADIGMS, ...STAGE2_PARADIGMS, ...STAGE3_PARADIGMS, ...STAGE4_PARADIGMS, ...STAGE5_PARADIGMS].sort((left, right) => left.order - right.order),
);
export const PARADIGM_MAP = new Map(PARADIGMS.map((item) => [item.id, item]));
export const CONTEXT_MAP = new Map(CONTEXTS.map((item) => [item.id, item]));
const RAW_CARDS = Object.freeze([...ACADEMIC_CARDS, ...LIFE_CARDS, ...BRIDGE_CARDS, ...FOUNDER_CARDS]);

const loadErrors = validateCurriculum({ paradigms: PARADIGMS, contexts: CONTEXTS, cards: RAW_CARDS, industryIds: INDUSTRIES.map((item) => item.id) }, { complete: false });
if (loadErrors.length) {
  throw new Error(`课程体系内容无效：\n${loadErrors.join("\n")}`);
}

/**
 * 派生运行时题卡：把语境与范式的字段展开到题卡上，界面与引擎只需读题卡。
 *
 * checks = 范式步骤（s0…sn）+ 语境关键行为 + 固定的“接住打断”。
 */
function buildPracticeCard(raw) {
  const context = CONTEXT_MAP.get(raw.contextId);
  const paradigm = PARADIGM_MAP.get(raw.paradigmId);
  return deepFreeze({
    ...structuredClone(raw),
    version: CURRICULUM_VERSION,
    status: "active",
    line: context.line,
    lineLabel: LINES[context.line].label,
    // AI 生成题卡显示按画像改写的场合名（如“周会进展汇报”），语境本身不变
    contextLabel: raw.origin === "generated" && raw.sceneLabel ? raw.sceneLabel : context.label,
    paradigmTitle: paradigm.title,
    structure: paradigm.structure,
    steps: paradigm.steps,
    difficulty: context.difficulty,
    prepSeconds: context.prepSeconds,
    speakSeconds: context.speakSeconds,
    // AI 生成题卡按学习者画像改写了身份、对象、难点与对方心态；精选题卡（和缺这几项的早期生成题卡）沿用语境
    role: raw.origin === "generated" && raw.role ? raw.role : context.role,
    counterpart: raw.origin === "generated" && raw.counterpart ? raw.counterpart : context.counterpart,
    tension: raw.origin === "generated" && raw.tension ? raw.tension : context.tension,
    mindset: raw.origin === "generated" && raw.mindset ? raw.mindset : context.mindset,
    alternativeParadigmIds: context.paradigmIds.filter((id) => id !== raw.paradigmId),
    keyChecks: [...context.keyChecks],
    interrupts: [...context.interrupts],
    followups: [...context.followups],
    checks: [...paradigm.steps.map((_, index) => stepKey(index)), ...context.keyChecks, PRESSURE_CHECK_ID],
  });
}

export const PRACTICE_CARDS = Object.freeze(RAW_CARDS.map(buildPracticeCard));
export const PRACTICE_CARD_MAP = new Map(PRACTICE_CARDS.map((card) => [card.id, card]));

// AI 生成题卡的注册表：与精选题卡共用 PRACTICE_CARD_MAP，引擎与存储按 ID 查卡时不区分来源。
// 示范题卡（purpose = example）也登记在这里，供课程记录按 ID 引用，但不进入练习题池
const GENERATED_CARDS = new Map();

/** AI 生成题卡的校验错误；为空表示可以注册。 */
export function generatedCardErrors(raw) {
  return validateGeneratedCard(raw, { paradigms: PARADIGMS, contexts: CONTEXTS, industryIds: INDUSTRIES.map((item) => item.id) });
}

/**
 * 注册 AI 生成题卡：逐张校验，合法的派生为运行时题卡并加入索引；已注册的 ID 跳过。
 *
 * @param {object[]} rawCards 原始生成题卡
 * @returns {object[]} 本次新注册的运行时题卡
 */
export function registerGeneratedCards(rawCards) {
  const added = [];
  for (const raw of rawCards ?? []) {
    if (!raw?.id || PRACTICE_CARD_MAP.has(raw.id) || generatedCardErrors(raw).length) continue;
    const card = buildPracticeCard(raw);
    GENERATED_CARDS.set(card.id, card);
    PRACTICE_CARD_MAP.set(card.id, card);
    added.push(card);
  }
  return added;
}

/** 移除已注册的生成题卡（用于清理超出上限且没被引用的旧题）。 */
export function unregisterGeneratedCards(ids) {
  for (const id of ids) {
    if (GENERATED_CARDS.delete(id)) PRACTICE_CARD_MAP.delete(id);
  }
}

/** 全部可练题卡：精选题卡在前，生成的练习题卡按注册顺序在后；示范题卡不在其中。 */
export function allPracticeCards() {
  return GENERATED_CARDS.size ? [...PRACTICE_CARDS, ...[...GENERATED_CARDS.values()].filter((card) => !isExampleCard(card))] : PRACTICE_CARDS;
}

/** 已注册的 AI 示范题卡（按注册顺序）。 */
export function generatedExampleCards() {
  return [...GENERATED_CARDS.values()].filter(isExampleCard);
}

export function isGeneratedCard(card) {
  return card?.origin === "generated";
}

/** 一课的示范题卡：学习模式用它替换课内固定的示范场景。 */
export function isExampleCard(card) {
  return isGeneratedCard(card) && card.purpose === "example";
}

/** 检查项在界面上的名称：范式步骤显示步骤名，其余显示检查项名。 */
export function checkLabel(card, id) {
  if (isStepKey(id)) return `第 ${Number(id.slice(1)) + 1} 步：${card.steps[Number(id.slice(1))]?.label ?? ""}`;
  return CHECKS[id]?.label ?? id;
}

/** 检查项的判断问题与改进提示。 */
export function checkDetail(card, id) {
  if (isStepKey(id)) {
    const step = card.steps[Number(id.slice(1))];
    return { question: `讲出了“${step?.label ?? ""}”：${step?.purpose ?? ""}`, tip: step?.phrase ?? "" };
  }
  return { question: CHECKS[id]?.question ?? "", tip: CHECKS[id]?.tip ?? "" };
}

/** 供测试与构建做完整模式校验。 */
export function curriculumErrors({ complete = true } = {}) {
  return validateCurriculum({ paradigms: PARADIGMS, contexts: CONTEXTS, cards: RAW_CARDS, industryIds: INDUSTRIES.map((item) => item.id) }, { complete });
}
