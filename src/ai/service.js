/**
 * AI 服务：题卡与课程示范生成（校验 + 带错误重试）、调研追问、画像合成、练习观察。
 *
 * 浏览器传来的内容一律按白名单整理并限制长度；模型输出一律经校验后才返回。
 */
import { randomUUID } from "node:crypto";

import { CHECKS } from "../../public/js/curriculum/checks.js";
import { CONTEXT_MAP, PARADIGM_MAP, generatedCardErrors } from "../../public/js/curriculum/index.js";
import { CAREER_STAGES } from "../../public/js/curriculum/ids.js";
import { GENERATED_PURPOSES } from "../../public/js/curriculum/validate.js";
import { resolveProvider } from "./config.js";
import { AiServiceError } from "./errors.js";
import {
  CARD_SYSTEM_PROMPT, FACETS, FOLLOWUP_SYSTEM_PROMPT, PROFILE_SYSTEM_PROMPT, REFLECTION_SYSTEM_PROMPT,
  buildCardPrompt, buildFollowupPrompt, buildProfilePrompt, buildReflectionPrompt,
} from "./prompts.js";
import { generateJsonWithClaude } from "./providers/anthropic.js";
import { generateJsonWithOpenAiCompatible } from "./providers/openai-compatible.js";
import { CARD_SCHEMA, FOLLOWUP_SCHEMA, PROFILE_SCHEMA, REFLECTION_SCHEMA } from "./schemas.js";

// 生成题卡最多尝试 3 次：第一次不合格时把校验错误回给模型重写
const MAX_CARD_ATTEMPTS = 3;
const MAX_FOLLOWUPS = 3;
const MAX_FACTS = 8;
const MAX_FOCUS_CHECKS = 3;
const MAX_FOCUS_STEPS = 2;
const MAX_OBSERVATIONS = 3;
const MAX_LOG_ITEMS = 10;
// 已记住的 12 条加待确认的 6 条
const MAX_KNOWN_FACTS = 18;
const MAX_DISMISSED_FACTS = 12;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 文本字段：非字符串视为空，去掉首尾空白并截断。 */
function str(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strList(value, count, max) {
  return (Array.isArray(value) ? value : []).map((item) => str(item, max)).filter(Boolean).slice(0, count);
}

function requireProvider(config, requested) {
  const provider = resolveProvider(config, requested);
  if (!provider) throw new AiServiceError("还没有配置任何模型服务，请在设置页的 AI 助手中填写，或在 .env 中配置后重启。", 503);
  return provider;
}

function callModel(provider, request) {
  return provider.id === "anthropic" ? generateJsonWithClaude(provider, request) : generateJsonWithOpenAiCompatible(provider, request);
}

/** 把模型输出整理为题卡：只保留题卡字段，ID、语境、范式、用途与来源由服务端填写。 */
function assembleCard(raw, { context, paradigm, purpose, provider }) {
  const guide = isObject(raw.prepGuide) ? raw.prepGuide : {};
  const questions = isObject(guide.questions) ? guide.questions : {};
  const bad = isObject(raw.badExample) ? raw.badExample : {};
  return {
    id: `${context.id}-G${randomUUID().replaceAll("-", "").slice(0, 8)}`,
    contextId: context.id,
    paradigmId: paradigm.id,
    industryId: null,
    origin: "generated",
    purpose,
    generatedAt: new Date().toISOString(),
    generator: `${provider.id}:${provider.model}`,
    title: str(raw.title, 200),
    situation: str(raw.situation, 1000),
    goal: str(raw.goal, 400),
    // 场合名可缺省（显示语境名），空串不写入
    sceneLabel: str(raw.sceneLabel, 40) || undefined,
    role: str(raw.role, 400),
    counterpart: str(raw.counterpart, 400),
    tension: str(raw.tension, 600),
    mindset: str(raw.mindset, 600),
    personalNote: str(raw.personalNote, 400),
    prepGuide: {
      questions: { who: str(questions.who, 600), wants: str(questions.wants, 600), outcome: str(questions.outcome, 600) },
      whyStructure: str(guide.whyStructure, 600),
      stepHints: strList(guide.stepHints, 12, 600),
    },
    bestAnswer: (Array.isArray(raw.bestAnswer) ? raw.bestAnswer : []).slice(0, 20).map((line) => ({
      step: Number.isInteger(line?.step) ? line.step : -1,
      text: str(line?.text, 600),
      why: str(line?.why, 600),
    })),
    badExample: { text: str(bad.text, 600), problems: strList(bad.problems, 8, 600) },
    study: strList(raw.study, 6, 600),
  };
}

/**
 * 生成一张题卡。
 *
 * @param {object} input config / providerId / spec（contextId、paradigmId、purpose、focusSteps、situation、avoidTitles）
 *   / profile（画像摘要文本）/ training（训练摘要文本）
 * @returns {Promise<object>} 通过校验的原始题卡
 */
export async function generateCard({ config, providerId, spec, profile, training }) {
  const request = isObject(spec) ? spec : {};
  const context = CONTEXT_MAP.get(request.contextId);
  const paradigm = PARADIGM_MAP.get(request.paradigmId);
  if (!context || !paradigm || !context.paradigmIds.includes(paradigm.id)) {
    throw new AiServiceError("出题规格无效：语境或表达结构不存在，或二者不匹配。", 400);
  }
  const purpose = request.purpose ?? "practice";
  if (!GENERATED_PURPOSES.includes(purpose)) throw new AiServiceError("出题规格无效：用途只能是练习题或示范。", 400);
  const provider = requireProvider(config, providerId);
  const input = {
    context,
    paradigm,
    purpose,
    profile: str(profile, 2000),
    training: str(training, 2000),
    // 重点步骤必须是本结构内的步骤序号
    focusSteps: [...new Set((Array.isArray(request.focusSteps) ? request.focusSteps : [])
      .filter((index) => Number.isInteger(index) && index >= 0 && index < paradigm.steps.length))].slice(0, MAX_FOCUS_STEPS),
    situation: str(request.situation, 200),
    avoidTitles: strList(request.avoidTitles, 12, 80),
    // 变化方向只用于练习题；示范要清楚好懂，不额外加干扰
    facet: purpose === "practice" ? FACETS[Math.floor(Math.random() * FACETS.length)] : "",
  };
  let previousErrors = [];
  for (let attempt = 1; attempt <= MAX_CARD_ATTEMPTS; attempt += 1) {
    const raw = await callModel(provider, {
      system: CARD_SYSTEM_PROMPT,
      prompt: buildCardPrompt({ ...input, previousErrors }),
      schema: CARD_SCHEMA,
      schemaName: "practice_card",
      effort: "high",
    });
    const card = assembleCard(raw, { context, paradigm, purpose, provider });
    const errors = generatedCardErrors(card);
    if (!errors.length) return card;
    // 错误信息里的题卡 ID 每次都会变，去掉后再回给模型
    previousErrors = errors.map((error) => error.replace(/^[^：]+：/, ""));
    console.warn(`[ai] 生成题卡第 ${attempt} 次未通过校验：`, previousErrors.join("；"));
  }
  throw new AiServiceError("模型连续几次生成的题目都没有通过质量校验，已放弃这道题。", 502);
}

/** 整理浏览器传来的问卷：字段白名单 + 长度限制。 */
function normalizeSurvey(raw) {
  const value = isObject(raw) ? raw : {};
  return {
    identity: str(value.identity, 120),
    focus: strList(value.focus, 3, 40),
    situations: (Array.isArray(value.situations) ? value.situations : []).slice(0, 5)
      .map((item) => ({ text: str(item?.text, 120), when: str(item?.when, 30) }))
      .filter((item) => item.text),
    selfRating: (Array.isArray(value.selfRating) ? value.selfRating : []).slice(0, 8)
      .map((item) => ({ label: str(item?.label, 30), value: Number.isInteger(item?.value) && item.value >= 1 && item.value <= 5 ? item.value : 0 }))
      .filter((item) => item.label && item.value),
    depth: value.depth === "light" ? "light" : "deep",
    avoid: str(value.avoid, 120),
    ifThen: str(value.ifThen, 120),
  };
}

/** 调研追问：最多 3 个问题。 */
export async function suggestFollowups({ config, providerId, survey }) {
  const provider = requireProvider(config, providerId);
  const raw = await callModel(provider, {
    system: FOLLOWUP_SYSTEM_PROMPT,
    prompt: buildFollowupPrompt(normalizeSurvey(survey)),
    schema: FOLLOWUP_SCHEMA,
    schemaName: "interview_followups",
    effort: "medium",
  });
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((item) => ({ question: str(item?.question, 120), why: str(item?.why, 120) }))
    .filter((item) => item.question)
    .slice(0, MAX_FOLLOWUPS);
  return { questions };
}

/** 整理浏览器传来的最近练习记录：字段白名单 + 长度与数量限制。 */
function normalizeLog(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_LOG_ITEMS).map((item) => ({
    date: str(item?.date, 10),
    title: str(item?.title, 80),
    context: str(item?.context, 40),
    structure: str(item?.structure, 20),
    missedFirst: strList(item?.missedFirst, 8, 30),
    missedSecond: strList(item?.missedSecond, 8, 30),
    focus: str(item?.focus, 30),
    takeaway: str(item?.takeaway, 80),
  })).filter((item) => item.title);
}

/** 练习观察：从最近的练习记录中提炼最多 3 条，交给用户确认后才写入记忆；用户忽略过的观察不再提出。 */
export async function reflectOnTraining({ config, providerId, profile, training, log, facts, dismissed }) {
  const provider = requireProvider(config, providerId);
  const records = normalizeLog(log);
  if (!records.length) return { observations: [] };
  const raw = await callModel(provider, {
    system: REFLECTION_SYSTEM_PROMPT,
    prompt: buildReflectionPrompt({
      profile: str(profile, 2000),
      training: str(training, 2000),
      log: records,
      facts: strList(facts, MAX_KNOWN_FACTS, 120),
      dismissed: strList(dismissed, MAX_DISMISSED_FACTS, 120),
    }),
    schema: REFLECTION_SCHEMA,
    schemaName: "training_observations",
    effort: "high",
  });
  const observations = (Array.isArray(raw.observations) ? raw.observations : [])
    .map((item) => ({ text: str(item?.text, 120), evidence: str(item?.evidence, 160) }))
    .filter((item) => item.text && item.evidence)
    .slice(0, MAX_OBSERVATIONS);
  return { observations };
}

/** 画像合成：语境、检查项与阶段不在课程体系内的一律丢弃。 */
export async function synthesizeProfile({ config, providerId, survey, followups }) {
  const provider = requireProvider(config, providerId);
  const normalized = normalizeSurvey(survey);
  const answers = (Array.isArray(followups) ? followups : []).slice(0, MAX_FOLLOWUPS)
    .map((item) => ({ question: str(item?.question, 120), answer: str(item?.answer, 400) }));
  const raw = await callModel(provider, {
    system: PROFILE_SYSTEM_PROMPT,
    prompt: buildProfilePrompt(normalized, answers),
    schema: PROFILE_SCHEMA,
    schemaName: "learner_profile",
    effort: "high",
  });
  const seen = new Set();
  const situationContexts = (Array.isArray(raw.situationContexts) ? raw.situationContexts : [])
    .filter((item) => Number.isInteger(item?.index) && item.index >= 0 && item.index < normalized.situations.length && CONTEXT_MAP.has(item.contextId))
    .filter((item) => !seen.has(item.index) && seen.add(item.index))
    .map((item) => ({ index: item.index, contextId: item.contextId }));
  return {
    careerStage: CAREER_STAGES.includes(raw.careerStage) ? raw.careerStage : null,
    summary: str(raw.summary, 300),
    facts: strList(raw.facts, MAX_FACTS, 120),
    situationContexts,
    focusChecks: [...new Set(strList(raw.focusChecks, 10, 40))].filter((id) => CHECKS[id]).slice(0, MAX_FOCUS_CHECKS),
    ifThen: str(raw.ifThen, 120),
  };
}
