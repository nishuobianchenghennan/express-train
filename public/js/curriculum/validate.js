/**
 * 课程体系内容校验（纯函数）。
 *
 * 结构模式（complete: false）：检查每条已有数据的字段、引用、步骤覆盖和语速；
 *   模块加载时运行，保证任何时候已写入的内容都是合法的。
 * 完整模式（complete: true）：在结构模式基础上再检查数量、覆盖与迁移题卡；
 *   在测试与构建中运行，用于确认第 1 期内容已经写全。
 */
import { CHECKS, PRESSURES } from "./checks.js";
import {
  FRAMEWORK_OPTIONAL, LINE_CONTEXT_COUNTS, LINE_IDS, LINE_PREFIX, MAX_CHARS_PER_SECOND, MIN_CARDS_PER_CONTEXT,
  MIN_CARDS_PER_PARADIGM, MIN_TOTAL_CARDS, PARADIGM_IDS, PRESSURE_CHECK_ID, STAGE_SIZES,
} from "./ids.js";

const PLACEHOLDER_PATTERN = /TODO|TBD|undefined|\$\{|\{\{/;
// 各阶段最后一课的课序：7、14、21、27、30
const STAGE_BOUNDARIES = STAGE_SIZES.map((_, index) => STAGE_SIZES.slice(0, index + 1).reduce((sum, value) => sum + value, 0));

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 逐句列表必须从第 0 步开始、步号不倒退、覆盖全部步骤。 */
function coversStepsInOrder(lines, stepCount) {
  if (!Array.isArray(lines) || !lines.length) return false;
  let previous = -1;
  const seen = new Set();
  for (const line of lines) {
    if (!Number.isInteger(line.step) || line.step < previous || line.step >= stepCount || !isText(line.text) || !isText(line.why)) return false;
    if (line.step > previous + 1) return false;
    previous = line.step;
    seen.add(line.step);
  }
  return seen.size === stepCount;
}

function charsPerSecond(lines, seconds) {
  const characters = lines.map((line) => line.text).join("").length;
  return characters / seconds;
}

function checkParadigm(paradigm, contextMap, errors) {
  const where = paradigm.id ?? "未知课";
  if (!PARADIGM_IDS.includes(paradigm.id)) errors.push(`${where}：课 ID 不在课表中`);
  if (PARADIGM_IDS.indexOf(paradigm.id) + 1 !== paradigm.order) errors.push(`${where}：order 应为 ${PARADIGM_IDS.indexOf(paradigm.id) + 1}`);
  const expectedStage = STAGE_BOUNDARIES.findIndex((boundary) => paradigm.order <= boundary) + 1;
  if (paradigm.stage !== expectedStage) errors.push(`${where}：stage 应为 ${expectedStage}`);
  for (const key of ["title", "structure", "whenToUse", "hard", "listener", "why", "transfer"]) {
    if (!isText(paradigm[key])) errors.push(`${where}：缺少 ${key}`);
  }
  const steps = paradigm.steps ?? [];
  if (steps.length < 3 || steps.length > 6 || !steps.every((step) => isText(step.label) && isText(step.purpose) && isText(step.phrase))) {
    errors.push(`${where}：steps 必须为 3–6 步且每步含 label/purpose/phrase`);
  }
  const frameworks = paradigm.frameworks ?? [];
  if (!FRAMEWORK_OPTIONAL.includes(paradigm.id) && !frameworks.length) errors.push(`${where}：缺少经典框架 frameworks`);
  if (!frameworks.every((item) => isText(item.name) && isText(item.mapping))) errors.push(`${where}：frameworks 每项需要 name 与 mapping`);
  const example = paradigm.example ?? {};
  if (!isText(example.situation) || !Number.isInteger(example.speakSeconds) || example.speakSeconds < 20 || example.speakSeconds > 180) {
    errors.push(`${where}：example 需要 situation 与 20–180 的整数 speakSeconds`);
  }
  if (!coversStepsInOrder(paradigm.model, steps.length)) errors.push(`${where}：model 必须按顺序覆盖全部步骤`);
  else if (example.speakSeconds && charsPerSecond(paradigm.model, example.speakSeconds) > MAX_CHARS_PER_SECOND) {
    errors.push(`${where}：示范语速超过每秒 ${MAX_CHARS_PER_SECOND} 字`);
  }
  if (!isText(paradigm.weak?.text) || !(paradigm.weak?.problems?.length >= 2)) errors.push(`${where}：weak 需要 text 与至少 2 条 problems`);
  const exampleContext = contextMap.get(paradigm.exampleContextId);
  if (!exampleContext) errors.push(`${where}：exampleContextId 不存在`);
  else if (!exampleContext.paradigmIds.includes(paradigm.id)) errors.push(`${where}：示范语境 ${exampleContext.id} 的 paradigmIds 未包含本课`);
  const transfers = paradigm.transferContextIds ?? [];
  if (!transfers.length || !transfers.every((id) => contextMap.has(id))) errors.push(`${where}：transferContextIds 为空或引用了不存在的语境`);
}

function checkContext(context, errors) {
  const where = context.id ?? "未知语境";
  if (!/^[ALBF]\d{2}$/.test(context.id ?? "") || LINE_PREFIX[context.id[0]] !== context.line) errors.push(`${where}：ID 前缀与 line 不匹配`);
  for (const key of ["label", "role", "counterpart", "mindset", "tension"]) {
    if (!isText(context[key])) errors.push(`${where}：缺少 ${key}`);
  }
  if (![1, 2, 3].includes(context.difficulty)) errors.push(`${where}：difficulty 必须为 1–3`);
  if (!context.paradigmIds?.length || !context.paradigmIds.every((id) => PARADIGM_IDS.includes(id))) errors.push(`${where}：paradigmIds 无效`);
  const keyChecks = context.keyChecks ?? [];
  if (keyChecks.length < 2 || keyChecks.length > 3 || !keyChecks.every((id) => CHECKS[id])) errors.push(`${where}：keyChecks 必须为 2–3 项已知检查项`);
  if (keyChecks.includes(PRESSURE_CHECK_ID)) errors.push(`${where}：keyChecks 不得包含 ${PRESSURE_CHECK_ID}（它会自动追加）`);
  const interrupts = context.interrupts ?? [];
  const followups = context.followups ?? [];
  const all = [...interrupts, ...followups];
  if (interrupts.length < 3 || followups.length < 3) errors.push(`${where}：打断与追问各至少 3 条`);
  if (!all.every((id) => PRESSURES[id])) errors.push(`${where}：引用了不存在的压力事件`);
  if (new Set(all).size !== all.length) errors.push(`${where}：打断与追问在同一语境内不得重复`);
  if (!Number.isInteger(context.prepSeconds) || context.prepSeconds < 5 || context.prepSeconds > 30) errors.push(`${where}：prepSeconds 必须为 5–30`);
  if (!Number.isInteger(context.speakSeconds) || context.speakSeconds < 30 || context.speakSeconds > 180) errors.push(`${where}：speakSeconds 必须为 30–180`);
}

function checkCard(card, contextMap, paradigmMap, industryIds, errors) {
  const where = card.id ?? "未知题卡";
  const context = contextMap.get(card.contextId);
  const paradigm = paradigmMap.get(card.paradigmId);
  if (!context) {
    errors.push(`${where}：contextId 不存在`);
    return;
  }
  if (!new RegExp(`^${context.id}-\\d{2}$`).test(card.id ?? "")) errors.push(`${where}：ID 必须形如 ${context.id}-01`);
  if (!paradigm) errors.push(`${where}：paradigmId 指向的课尚未定义`);
  if (!context.paradigmIds.includes(card.paradigmId)) errors.push(`${where}：paradigmId 不在语境 ${context.id} 的 paradigmIds 中`);
  for (const key of ["title", "situation", "goal"]) {
    if (!isText(card[key])) errors.push(`${where}：缺少 ${key}`);
  }
  if (card.industryId != null && !industryIds.has(card.industryId)) errors.push(`${where}：industryId 不存在`);
  const guide = card.prepGuide ?? {};
  if (!isText(guide.questions?.who) || !isText(guide.questions?.wants) || !isText(guide.questions?.outcome) || !isText(guide.whyStructure)) {
    errors.push(`${where}：prepGuide 需要三问与 whyStructure`);
  }
  if (paradigm) {
    if (guide.stepHints?.length !== paradigm.steps.length || !guide.stepHints.every(isText)) errors.push(`${where}：stepHints 数量必须等于 ${paradigm.steps.length}`);
    if (!coversStepsInOrder(card.bestAnswer, paradigm.steps.length)) errors.push(`${where}：bestAnswer 必须按顺序覆盖全部步骤`);
    else if (charsPerSecond(card.bestAnswer, context.speakSeconds) > MAX_CHARS_PER_SECOND) errors.push(`${where}：最优方案语速超过每秒 ${MAX_CHARS_PER_SECOND} 字`);
  }
  if (!isText(card.badExample?.text) || !(card.badExample?.problems?.length >= 2)) errors.push(`${where}：badExample 需要 text 与至少 2 条 problems`);
  if (!Array.isArray(card.study) || card.study.length < 2 || card.study.length > 4 || !card.study.every(isText)) errors.push(`${where}：study 必须为 2–4 条`);
  if (PLACEHOLDER_PATTERN.test(JSON.stringify(card))) errors.push(`${where}：含有占位符`);
}

function checkCompleteness({ paradigms, contexts, cards }, contextMap, errors) {
  if (paradigms.length !== PARADIGM_IDS.length) errors.push(`应有 30 课，当前 ${paradigms.length}`);
  if (contexts.length !== 56) errors.push(`应有 56 类语境，当前 ${contexts.length}`);
  for (const line of LINE_IDS) {
    const count = contexts.filter((context) => context.line === line).length;
    if (count !== LINE_CONTEXT_COUNTS[line]) errors.push(`${line} 线应有 ${LINE_CONTEXT_COUNTS[line]} 类语境，当前 ${count}`);
    const easy = cards.some((card) => contextMap.get(card.contextId)?.line === line && contextMap.get(card.contextId)?.difficulty === 1);
    if (!easy) errors.push(`${line} 线没有难度 1 的题卡`);
  }
  if (cards.length < MIN_TOTAL_CARDS) errors.push(`题卡应不少于 ${MIN_TOTAL_CARDS} 张，当前 ${cards.length}`);
  for (const context of contexts) {
    const count = cards.filter((card) => card.contextId === context.id).length;
    if (count < MIN_CARDS_PER_CONTEXT) errors.push(`${context.id}：题卡少于 ${MIN_CARDS_PER_CONTEXT} 张`);
  }
  for (const paradigm of paradigms) {
    const count = cards.filter((card) => card.paradigmId === paradigm.id).length;
    if (count < MIN_CARDS_PER_PARADIGM) errors.push(`${paradigm.id}：作为主范式的题卡少于 ${MIN_CARDS_PER_PARADIGM} 张`);
  }
}

/** 每课至少 1 张与示范语境不同线的迁移题卡（结构模式也检查，只要课和题卡都已写入）。 */
function checkTransfer(paradigm, cards, contextMap, errors, { complete }) {
  const exampleLine = contextMap.get(paradigm.exampleContextId)?.line;
  const candidates = cards.filter((card) => card.paradigmId === paradigm.id && paradigm.transferContextIds?.includes(card.contextId));
  const crossLine = candidates.filter((card) => contextMap.get(card.contextId)?.line !== exampleLine);
  if (paradigm.transferContextIds?.every((id) => contextMap.get(id)?.line === exampleLine)) {
    errors.push(`${paradigm.id}：迁移语境必须至少有一个与示范语境不同线`);
  } else if (complete && !crossLine.length) {
    errors.push(`${paradigm.id}：缺少不同线的迁移题卡`);
  }
}

/**
 * 校验课程体系内容。
 *
 * @param {{ paradigms: object[], contexts: object[], cards: object[], industryIds?: Iterable<string> }} data 原始数据
 * @param {{ complete?: boolean }} options complete 为 true 时额外检查数量与覆盖
 * @returns {string[]} 错误描述；为空表示通过
 */
export function validateCurriculum({ paradigms, contexts, cards, industryIds = [] }, { complete = false } = {}) {
  const errors = [];
  const contextMap = new Map(contexts.map((context) => [context.id, context]));
  const paradigmMap = new Map(paradigms.map((paradigm) => [paradigm.id, paradigm]));
  const industries = new Set(industryIds);
  for (const [label, items] of [["课", paradigms], ["语境", contexts], ["题卡", cards]]) {
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) errors.push(`${label} ID 重复`);
  }
  contexts.forEach((context) => checkContext(context, errors));
  paradigms.forEach((paradigm) => checkParadigm(paradigm, contextMap, errors));
  cards.forEach((card) => checkCard(card, contextMap, paradigmMap, industries, errors));
  paradigms.forEach((paradigm) => checkTransfer(paradigm, cards, contextMap, errors, { complete }));
  if (complete) checkCompleteness({ paradigms, contexts, cards }, contextMap, errors);
  return errors;
}
