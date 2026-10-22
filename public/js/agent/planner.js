/**
 * 出题规划（纯函数）：决定下一张 AI 题卡练哪个语境、哪种结构、重点考哪几步，以及何时停止生成。
 *
 * 代码决定“练什么”，模型只负责“写什么情境”：
 * - 只为已学范式出题；难度不超过当前目标（有弱项时放宽一级），与抽题规则一致；
 * - 语境按当前阶段的线权重分配，映射到真实场合的语境 ×3，命中关注方向或行为弱项 ×2，
 *   含最近 3 天刚学的范式 ×1.5，再按已有生成题数摊薄，避免扎堆；
 * - 有弱项时优先能考核弱项的语境与范式；
 * - 缓冲：保持 2 张“没练过、且考核当前弱项”的新题；弱项变化后不再对口的旧备题不计入缓冲，
 *   但没练过的新题总数到 5 张就停，避免弱项频繁变化时无限生成。
 * - 课程示范与迁移题：示范换成按画像生成的场景（结构固定），迁移题与示范分在不同的线。
 */
import { CONTEXTS, LINE_WEIGHTS } from "../curriculum/contexts.js";
import { PRESSURE_CHECK_ID } from "../curriculum/ids.js";
import { CONTEXT_MAP, isGeneratedCard } from "../curriculum/index.js";
import { cardTargetsWeakness, targetDifficulty } from "../arena/engine.js";
import { profileFocusChecks, profileFocusParadigms } from "./profile.js";
import { focusStepIndexes } from "./training.js";

export const GENERATION_BUFFER = 2;
export const MAX_FRESH_CARDS = 5;
export const MAX_GENERATED_CARDS = 500;
const SITUATION_BOOST = 3;
const CHECK_BOOST = 2;
const RECENT_BOOST = 1.5;
const FOCUS_PARADIGM_BOOST = 2;
const AVOID_TITLES = 12;
// 示范是用来模仿的，场合不宜太难
const EXAMPLE_MAX_DIFFICULTY = 2;

function pick(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
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

/** 软过滤：过滤后为空就保留原候选。 */
function softFilter(items, predicate) {
  const filtered = items.filter(predicate);
  return filtered.length ? filtered : items;
}

/** 题卡是否已被用过：开过练习回合，或被课程选作迁移题、示范。 */
function usedCardIds(drills, lessonRuns) {
  return new Set([
    ...drills.map((drill) => drill.cardId),
    ...lessonRuns.flatMap((run) => [run.transferCardId, run.exampleCardId]).filter(Boolean),
  ]);
}

/** 还没练过、也没用作迁移题的 AI 生成题。 */
export function freshGeneratedCards({ cards, drills = [], lessonRuns = [] }) {
  const used = usedCardIds(drills, lessonRuns);
  return cards.filter((card) => isGeneratedCard(card) && !used.has(card.id));
}

/** 在这个语境里出题，能否考核当前弱项（行为弱项看关键检查项，“接住打断”每题都考；结构弱项看可用范式）。 */
function contextTargetsWeakness(context, weakness, learned) {
  if (!weakness) return false;
  if (weakness.kind === "structure") return context.paradigmIds.includes(weakness.id) && learned.has(weakness.id);
  return weakness.id === PRESSURE_CHECK_ID || context.keyChecks.includes(weakness.id);
}

/** 出题规格：语境、范式、重点考查的步骤、本题要贴近的真实场合、要回避的已有标题。 */
function buildSpec(context, paradigmId, { profile, cards, drills, random }) {
  const matched = (profile?.situations ?? []).filter((item) => item.contextId === context.id);
  const situation = matched.length ? pick(matched, random) : null;
  return {
    contextId: context.id,
    paradigmId,
    focusSteps: focusStepIndexes(drills, paradigmId),
    situation: situation ? `${situation.text}${situation.when ? `（${situation.when}）` : ""}` : "",
    avoidTitles: cards.filter((card) => card.contextId === context.id).map((card) => card.title).slice(-AVOID_TITLES),
  };
}

/**
 * 规划下一张练习题。
 *
 * @param {object} input profile / learned（已学范式）/ recent（最近 3 天学完的范式）/ cards（全部题卡）
 *   / drills / lessonRuns / careerStage / weakness / random
 * @returns {object|null} 出题规格；不需要生成时返回 null
 */
export function planPracticeGeneration({
  profile = null, learned, recent = new Set(), cards, drills = [], lessonRuns = [], careerStage = "phd", weakness = null, random = Math.random,
}) {
  if (!learned?.size) return null;
  const fresh = freshGeneratedCards({ cards, drills, lessonRuns });
  if (fresh.length >= MAX_FRESH_CARDS) return null;
  const relevant = weakness ? fresh.filter((card) => cardTargetsWeakness(card, weakness)) : fresh;
  if (relevant.length >= GENERATION_BUFFER) return null;

  let candidates = CONTEXTS.filter((context) => context.paradigmIds.some((id) => learned.has(id)));
  if (!candidates.length) return null;
  // 难度与抽题规则一致：不超过目标难度，有弱项时放宽一级
  const maxDifficulty = targetDifficulty(drills) + (weakness ? 1 : 0);
  candidates = softFilter(candidates, (context) => context.difficulty <= maxDifficulty);
  if (weakness) candidates = softFilter(candidates, (context) => contextTargetsWeakness(context, weakness, learned));

  const lineWeights = LINE_WEIGHTS[careerStage] ?? LINE_WEIGHTS.phd;
  const perLine = {};
  for (const context of candidates) perLine[context.line] = (perLine[context.line] ?? 0) + 1;
  const generatedPerContext = {};
  for (const card of cards) {
    if (isGeneratedCard(card)) generatedPerContext[card.contextId] = (generatedPerContext[card.contextId] ?? 0) + 1;
  }
  const situationContexts = new Set((profile?.situations ?? []).map((item) => item.contextId).filter(Boolean));
  const focusChecks = profileFocusChecks(profile);
  if (weakness?.kind === "behavior") focusChecks.add(weakness.id);
  const weightOf = (context) => {
    // 线权重按该线候选语境数摊开，保证四条线的出题比例与当前阶段一致；权重为 0 的线给一个很小的底数
    const lineShare = (lineWeights[context.line] || 1) / perLine[context.line];
    const situationBoost = situationContexts.has(context.id) ? SITUATION_BOOST : 1;
    const checkBoost = context.keyChecks.some((id) => focusChecks.has(id)) ? CHECK_BOOST : 1;
    const recentBoost = context.paradigmIds.some((id) => recent.has(id)) ? RECENT_BOOST : 1;
    return (lineShare * situationBoost * checkBoost * recentBoost) / (1 + (generatedPerContext[context.id] ?? 0));
  };
  const context = weightedPick(candidates, weightOf, random);

  const paradigms = context.paradigmIds.filter((id) => learned.has(id));
  let paradigmId;
  if (weakness?.kind === "structure" && paradigms.includes(weakness.id)) {
    paradigmId = weakness.id;
  } else {
    const focusParadigms = profileFocusParadigms(profile);
    paradigmId = weightedPick(paradigms, (id) => (focusParadigms.has(id) ? FOCUS_PARADIGM_BOOST : 1) * (recent.has(id) ? RECENT_BOOST : 1), random);
  }
  return buildSpec(context, paradigmId, { profile, cards, drills, random });
}

/**
 * 规划一课的示范：在含本课结构的语境中选一个（避开本课的迁移语境，且保证迁移语境里有不同的线，
 * 留给迁移步骤换场合），难度优先不超过 2；按当前阶段的线权重分配，映射到真实场合的语境 ×3，再按已有生成题数摊薄。
 *
 * @param {object} input paradigm / profile / cards / drills / careerStage / random
 * @returns {object|null} 出题规格（purpose = example）
 */
export function planExampleGeneration({ paradigm, profile = null, cards, drills = [], careerStage = "phd", random = Math.random }) {
  let candidates = CONTEXTS.filter((context) => context.paradigmIds.includes(paradigm.id));
  if (!candidates.length) return null;
  candidates = softFilter(candidates, (context) => !paradigm.transferContextIds.includes(context.id));
  // 有 13 课的迁移语境全在同一条线上：示范要落在别的线，迁移步骤才换得了线
  const transferLines = new Set(paradigm.transferContextIds.map((id) => CONTEXT_MAP.get(id)?.line));
  candidates = softFilter(candidates, (context) => [...transferLines].some((line) => line !== context.line));
  candidates = softFilter(candidates, (context) => context.difficulty <= EXAMPLE_MAX_DIFFICULTY);
  const lineWeights = LINE_WEIGHTS[careerStage] ?? LINE_WEIGHTS.phd;
  const perLine = {};
  for (const context of candidates) perLine[context.line] = (perLine[context.line] ?? 0) + 1;
  const situationContexts = new Set((profile?.situations ?? []).map((item) => item.contextId).filter(Boolean));
  const generatedPerContext = {};
  for (const card of cards) {
    if (isGeneratedCard(card)) generatedPerContext[card.contextId] = (generatedPerContext[card.contextId] ?? 0) + 1;
  }
  const context = weightedPick(candidates, (item) => {
    const lineShare = (lineWeights[item.line] || 1) / perLine[item.line];
    return (lineShare * (situationContexts.has(item.id) ? SITUATION_BOOST : 1)) / (1 + (generatedPerContext[item.id] ?? 0));
  }, random);
  return { ...buildSpec(context, paradigm.id, { profile, cards, drills, random }), purpose: "example" };
}

/**
 * 规划课程迁移题：在本课的迁移语境中，优先与示范不同线、且映射到真实场合的语境。
 *
 * @param {object} input paradigm / profile / cards / drills / exampleLine（本次示范所在的线，缺省取课内精选示范）/ random
 * @returns {object|null} 出题规格
 */
export function planTransferGeneration({ paradigm, profile = null, cards, drills = [], exampleLine = CONTEXT_MAP.get(paradigm.exampleContextId)?.line, random = Math.random }) {
  const contexts = paradigm.transferContextIds.map((id) => CONTEXT_MAP.get(id)).filter((context) => context?.paradigmIds.includes(paradigm.id));
  if (!contexts.length) return null;
  const crossLine = contexts.filter((context) => context.line !== exampleLine);
  const pool = crossLine.length ? crossLine : contexts;
  const situational = pool.filter((context) => (profile?.situations ?? []).some((item) => item.contextId === context.id));
  return buildSpec(pick(situational.length ? situational : pool, random), paradigm.id, { profile, cards, drills, random });
}

/**
 * 生成题卡超出上限时，删除最旧且没被任何回合或课程引用的题卡；被引用的永远保留。
 *
 * @param {object[]} rawCards 按生成先后排列的原始题卡
 * @param {{ drills: object[], lessonRuns: object[], cap?: number }} options 引用来源与上限
 * @returns {{ keep: object[], removedIds: string[] }} 保留的题卡与被删除的 ID
 */
export function pruneGeneratedCards(rawCards, { drills = [], lessonRuns = [], cap = MAX_GENERATED_CARDS }) {
  const overflow = rawCards.length - cap;
  if (overflow <= 0) return { keep: rawCards, removedIds: [] };
  const referenced = usedCardIds(drills, lessonRuns);
  const removable = rawCards.filter((card) => !referenced.has(card.id)).slice(0, overflow).map((card) => card.id);
  const removed = new Set(removable);
  return { keep: rawCards.filter((card) => !removed.has(card.id)), removedIds: removable };
}
