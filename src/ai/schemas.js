/**
 * 模型结构化输出的 JSON Schema。
 *
 * 只用两家都支持的子集：每个对象 additionalProperties: false 且字段全部 required，
 * 不写长度、数量与数值范围约束（Claude 结构化输出不支持），这些约束由服务端校验器检查。
 */
import { CHECKS } from "../../public/js/curriculum/checks.js";
import { CONTEXTS } from "../../public/js/curriculum/contexts.js";
import { CAREER_STAGES } from "../../public/js/curriculum/ids.js";

const text = Object.freeze({ type: "string" });
const textList = Object.freeze({ type: "array", items: text });

function object(properties) {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

/** 一张题卡中由模型填写的部分；ID、语境、范式、用途等由服务端补齐。 */
export const CARD_SCHEMA = Object.freeze(object({
  title: text,
  situation: text,
  goal: text,
  sceneLabel: text,
  role: text,
  counterpart: text,
  tension: text,
  mindset: text,
  personalNote: text,
  prepGuide: object({
    questions: object({ who: text, wants: text, outcome: text }),
    whyStructure: text,
    stepHints: textList,
  }),
  bestAnswer: { type: "array", items: object({ step: { type: "integer" }, text, why: text }) },
  badExample: object({ text, problems: textList }),
  study: textList,
}));

/** 调研追问：最多 3 个问题。 */
export const FOLLOWUP_SCHEMA = Object.freeze(object({
  questions: { type: "array", items: object({ question: text, why: text }) },
}));

/** 练习观察：最多 3 条，每条附记录依据；没有可靠观察时返回空数组。 */
export const REFLECTION_SCHEMA = Object.freeze(object({
  observations: { type: "array", items: object({ text, evidence: text }) },
}));

/** 画像合成：语境、检查项与阶段用枚举限定在课程体系内。 */
export const PROFILE_SCHEMA = Object.freeze(object({
  careerStage: { type: "string", enum: [...CAREER_STAGES] },
  summary: text,
  facts: textList,
  situationContexts: {
    type: "array",
    items: object({ index: { type: "integer" }, contextId: { type: "string", enum: CONTEXTS.map((context) => context.id) } }),
  },
  focusChecks: { type: "array", items: { type: "string", enum: Object.keys(CHECKS) } },
  ifThen: text,
}));
