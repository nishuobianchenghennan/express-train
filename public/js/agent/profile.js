/**
 * 学习者画像（记忆）：结构、规范化、发送给模型的摘要。
 *
 * 画像只存用户说过的事和 AI 合成的摘要；“实测”水平不另存，
 * 由 arena/engine.js 从练习回合实时计算，与自评并排展示。
 */
import { CHECKS } from "../curriculum/checks.js";
import { CONTEXT_MAP } from "../curriculum/index.js";

export const PROFILE_SCHEMA_VERSION = 1;
export const MAX_FOCUS = 3;
export const MAX_SITUATIONS = 5;
export const MAX_FACTS = 12;
export const MAX_FOLLOWUPS = 3;
export const MAX_PENDING_FACTS = 6;
/** 记住最近忽略或删除的练习观察，提炼时告诉模型不要再提。 */
export const MAX_DISMISSED_FACTS = 12;
/** 记忆来源：问卷或手动添加、AI 整理画像、从练习中提炼（经用户确认）。 */
export const FACT_SOURCES = Object.freeze(["survey", "ai", "practice"]);

/** 想提高的方面：每项关联检查项与范式，供出题规划加权。 */
export const FOCUS_OPTIONS = Object.freeze([
  { id: "opening", label: "一开口就紧张，不知道先说什么", checks: ["conclusion_early"], paradigms: ["conclusion_first", "called_on"] },
  { id: "structure", label: "讲着讲着就乱，没有条理", checks: ["one_thread", "signpost"], paradigms: ["pyramid", "progress_report"] },
  { id: "pressure", label: "被追问、被质疑时接不住", checks: ["handled_pressure", "no_defensive"], paradigms: ["handle_challenge", "bridging"] },
  { id: "persuasion", label: "说服别人、争取资源", checks: ["counterpart_value", "ask_clear"], paradigms: ["ask_resources", "negotiate", "value_pitch"] },
  { id: "social", label: "闲聊社交、接话不冷场", checks: ["question_back"], paradigms: ["small_talk", "active_listening", "roundtable"] },
  { id: "explain", label: "把专业内容讲给外行听", checks: ["audience_fit", "concrete"], paradigms: ["explain_concept", "analogy"] },
  { id: "story", label: "讲故事、讲经历有感染力", checks: ["story_specific"], paradigms: ["story", "vision"] },
  { id: "boundary", label: "拒绝、批评、处理冲突", checks: ["alternative", "empathy_first"], paradigms: ["say_no", "feedback", "resolve_conflict"] },
].map((item) => Object.freeze({ ...item, checks: Object.freeze(item.checks), paradigms: Object.freeze(item.paradigms) })));

const FOCUS_MAP = new Map(FOCUS_OPTIONS.map((item) => [item.id, item]));

/** 自评维度：每项对应练习中可实测的检查项。 */
export const SELF_RATING_DIMENSIONS = Object.freeze([
  { id: "opening", label: "开口与结论先行", checks: ["conclusion_early"] },
  { id: "structure", label: "条理与层次", checks: ["one_thread", "signpost"] },
  { id: "pressure", label: "被打断、被质疑时的应变", checks: ["handled_pressure", "no_defensive"] },
  { id: "persuasion", label: "说服与推动", checks: ["counterpart_value", "ask_clear"] },
  { id: "social", label: "社交与倾听", checks: ["question_back", "empathy_first"] },
].map((item) => Object.freeze({ ...item, checks: Object.freeze(item.checks) })));

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random.replaceAll("-", "").slice(0, 10)}`;
}

function idOrNew(value, prefix) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : makeId(prefix);
}

function isoOrNow(value) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : new Date().toISOString();
}

/** 空白画像草稿，问卷从这里开始填。 */
export function emptyProfile() {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    identity: "",
    focus: [],
    focusChecks: [],
    situations: [],
    selfRating: {},
    depth: "deep",
    avoid: "",
    ifThen: "",
    summary: "",
    facts: [],
    followups: [],
    reflectedAt: null,
    pendingFacts: [],
    dismissedFacts: [],
  };
}

/**
 * 规范化画像：字段白名单、长度与数量上限、ID 引用必须存在于课程体系；非法项丢弃而不报错。
 *
 * @param {unknown} raw 存储或导入的画像
 * @returns {object|null} 规范化后的画像；不是画像时返回 null
 */
export function normalizeProfile(raw) {
  if (!isObject(raw) || raw.schemaVersion !== PROFILE_SCHEMA_VERSION) return null;
  const rating = isObject(raw.selfRating) ? raw.selfRating : {};
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    createdAt: isoOrNow(raw.createdAt),
    updatedAt: isoOrNow(raw.updatedAt),
    identity: str(raw.identity, 120),
    focus: [...new Set((Array.isArray(raw.focus) ? raw.focus : []).filter((id) => FOCUS_MAP.has(id)))].slice(0, MAX_FOCUS),
    focusChecks: [...new Set((Array.isArray(raw.focusChecks) ? raw.focusChecks : []).filter((id) => CHECKS[id]))].slice(0, MAX_FOCUS),
    situations: (Array.isArray(raw.situations) ? raw.situations : []).slice(0, MAX_SITUATIONS)
      .map((item) => ({
        id: idOrNew(item?.id, "s"),
        text: str(item?.text, 120),
        when: str(item?.when, 30),
        contextId: CONTEXT_MAP.has(item?.contextId) ? item.contextId : null,
      }))
      .filter((item) => item.text),
    selfRating: Object.fromEntries(SELF_RATING_DIMENSIONS
      .filter((dimension) => Number.isInteger(rating[dimension.id]) && rating[dimension.id] >= 1 && rating[dimension.id] <= 5)
      .map((dimension) => [dimension.id, rating[dimension.id]])),
    depth: raw.depth === "light" ? "light" : "deep",
    avoid: str(raw.avoid, 120),
    ifThen: str(raw.ifThen, 120),
    summary: str(raw.summary, 300),
    facts: (Array.isArray(raw.facts) ? raw.facts : []).slice(0, MAX_FACTS)
      .map((item) => ({ id: idOrNew(item?.id, "f"), text: str(item?.text, 120), source: FACT_SOURCES.includes(item?.source) ? item.source : "survey", createdAt: isoOrNow(item?.createdAt) }))
      .filter((item) => item.text),
    followups: (Array.isArray(raw.followups) ? raw.followups : []).slice(0, MAX_FOLLOWUPS)
      .map((item) => ({ question: str(item?.question, 120), answer: str(item?.answer, 400) }))
      .filter((item) => item.question),
    // 上次从练习中提炼观察的时间；之后再完成若干回合才会再次提炼
    reflectedAt: typeof raw.reflectedAt === "string" && !Number.isNaN(new Date(raw.reflectedAt).getTime()) ? new Date(raw.reflectedAt).toISOString() : null,
    // 从练习中提炼、等待用户确认的观察；确认后才进入 facts
    pendingFacts: (Array.isArray(raw.pendingFacts) ? raw.pendingFacts : []).slice(0, MAX_PENDING_FACTS)
      .map((item) => ({ id: idOrNew(item?.id, "p"), text: str(item?.text, 120), evidence: str(item?.evidence, 160), createdAt: isoOrNow(item?.createdAt) }))
      .filter((item) => item.text),
    // 用户忽略或删除过的练习观察（只保留最近的），提炼时不再提出
    dismissedFacts: (Array.isArray(raw.dismissedFacts) ? raw.dismissedFacts : []).slice(-MAX_DISMISSED_FACTS)
      .map((item) => ({ text: str(item?.text, 120), dismissedAt: isoOrNow(item?.dismissedAt) }))
      .filter((item) => item.text),
  };
}

/** 比较两条观察是否相同：忽略空白与标点，避免模型换个标点就重复提出。 */
export function sameObservation(left, right) {
  const key = (text) => text.replace(/[\s\p{P}]/gu, "");
  return key(left) === key(right);
}

/** 想提高的方面对应的检查项（含 AI 建议关注的检查项）。 */
export function profileFocusChecks(profile) {
  const checks = new Set(profile?.focusChecks ?? []);
  for (const id of profile?.focus ?? []) FOCUS_MAP.get(id)?.checks.forEach((check) => checks.add(check));
  return checks;
}

/** 想提高的方面对应的范式。 */
export function profileFocusParadigms(profile) {
  const paradigms = new Set();
  for (const id of profile?.focus ?? []) FOCUS_MAP.get(id)?.paradigms.forEach((paradigm) => paradigms.add(paradigm));
  return paradigms;
}

export function focusLabel(id) {
  return FOCUS_MAP.get(id)?.label ?? id;
}

/**
 * 发送给模型的画像摘要。画像页“将发送给模型的内容”预览也用它，保证所见即所发。
 *
 * 只含出题需要的信息：不含自评分数与录音；训练进度另由 training.js 的训练摘要提供；
 * 真实场合只在出题规格里按题附上一条。
 *
 * @param {object|null} profile 画像
 * @param {{ weakness?: string }} extra 当前弱项名称
 * @returns {string} 摘要文本
 */
export function profileDigest(profile, { weakness = "" } = {}) {
  if (!profile) return "";
  const lines = [
    profile.identity ? `- 身份：${profile.identity}` : "",
    profile.focus.length ? `- 想提高：${profile.focus.map(focusLabel).join("；")}` : "",
    profile.summary ? `- 画像摘要：${profile.summary}` : "",
    profile.facts.length ? `- 记住的事：${profile.facts.slice(0, 6).map((fact) => fact.text).join("；")}` : "",
    `- 题目深浅：${profile.depth === "light" ? "只借用学习者的领域，不必贴近真实细节" : "尽量贴近学习者真实的人和事"}`,
    profile.avoid ? `- 不想练的话题：${profile.avoid}` : "",
    weakness ? `- 练习中的当前弱项：${weakness}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
