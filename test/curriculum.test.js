import assert from "node:assert/strict";
import test from "node:test";

import { INDUSTRIES } from "../public/js/arena/industries.js";
import { ACADEMIC_CARDS } from "../public/js/curriculum/cards/academic.js";
import { BRIDGE_CARDS } from "../public/js/curriculum/cards/bridge.js";
import { FOUNDER_CARDS } from "../public/js/curriculum/cards/founder.js";
import { LIFE_CARDS } from "../public/js/curriculum/cards/life.js";
import { CHECKS, PRESSURES } from "../public/js/curriculum/checks.js";
import { CONTEXTS } from "../public/js/curriculum/contexts.js";
import { CAREER_STAGES, LINE_IDS, PARADIGM_IDS, STAGE_SIZES } from "../public/js/curriculum/ids.js";
import { curriculumErrors, PARADIGMS, PRACTICE_CARDS } from "../public/js/curriculum/index.js";
import { STAGE1_PARADIGMS } from "../public/js/curriculum/paradigms/stage1-open.js";
import { STAGE2_PARADIGMS } from "../public/js/curriculum/paradigms/stage2-clear.js";
import { STAGE3_PARADIGMS } from "../public/js/curriculum/paradigms/stage3-spar.js";
import { STAGE4_PARADIGMS } from "../public/js/curriculum/paradigms/stage4-drive.js";
import { STAGE5_PARADIGMS } from "../public/js/curriculum/paradigms/stage5-founder.js";
import { validateCurriculum } from "../public/js/curriculum/validate.js";

const INDUSTRY_IDS = INDUSTRIES.map((item) => item.id);

const LEGACY_PRESSURE_IDS = [
  "get_to_point", "time_cut", "data_source", "impatient", "jargon_check", "own_view", "competitor", "worst_case", "half_budget",
  "emotional", "silence", "why_you", "example", "so_what", "last_time", "lowball", "blame", "deadline",
];
const NEW_PRESSURE_IDS = [
  "novelty", "scope_creep", "sample_doubt", "lost_audience", "topic_shift", "personal_probe", "family_worry", "cross_talk",
  "loaded_question", "big_co", "why_now", "full_time", "valuation_push", "emotional_down", "cold_response", "time_up_host",
];

test("检查项保持 20 项且每项都有标签、问题和改进提示", () => {
  assert.equal(Object.keys(CHECKS).length, 20);
  for (const [id, check] of Object.entries(CHECKS)) {
    assert.ok(check.label && check.question && check.tip, id);
  }
});

test("压力事件保留全部旧 ID，并新增学术、生活、创业语境用的 16 条", () => {
  for (const id of [...LEGACY_PRESSURE_IDS, ...NEW_PRESSURE_IDS]) {
    assert.equal(typeof PRESSURES[id], "string", id);
    assert.ok(PRESSURES[id].length > 4, id);
  }
  assert.equal(Object.keys(PRESSURES).length, 34);
});

/** 构造一份最小但完全合法的夹具：1 课、2 个语境（不同线）、2 张题卡。 */
function fixture() {
  const steps = [
    { label: "结论", purpose: "先给结论", phrase: "结论是……" },
    { label: "理由", purpose: "给出理由", phrase: "因为……" },
    { label: "收尾", purpose: "回到结论", phrase: "所以……" },
  ];
  const paradigm = {
    id: "conclusion_first", order: 1, stage: 1, title: "结论先行", structure: "结论—理由—收尾",
    frameworks: [{ name: "PREP", source: "常见用法", mapping: "P 对应结论" }],
    whenToUse: "对方时间少、需要尽快判断时。",
    exampleContextId: "A01", example: { situation: "组会上导师突然问你怎么看。", speakSeconds: 40 },
    hard: "难点", listener: "对方心理", why: "为什么用这个结构",
    steps,
    model: [{ step: 0, text: "我的结论是可以做。", why: "先给结论" }, { step: 1, text: "因为数据已经够了。", why: "给理由" }, { step: 2, text: "所以下周开始。", why: "收尾" }],
    weak: { text: "嗯……我想想……", problems: ["没有结论", "没有理由"] },
    transfer: "换语境时保留顺序。", transferContextIds: ["F01"],
  };
  const context = (id, line) => ({
    id, line, label: `语境${id}`, difficulty: 1, role: "你是博一学生", counterpart: "导师", mindset: "想尽快知道结论", tension: "时间紧",
    paradigmIds: ["conclusion_first"], keyChecks: ["conclusion_early", "concrete"],
    interrupts: ["get_to_point", "time_cut", "impatient"], followups: ["so_what", "worst_case", "example"],
    prepSeconds: 10, speakSeconds: 45,
  });
  const card = (id, contextId) => ({
    id, contextId, paradigmId: "conclusion_first", industryId: null,
    title: "题目", situation: "情境", goal: "目标",
    prepGuide: { questions: { who: "导师", wants: "结论", outcome: "同意" }, whyStructure: "对方忙", stepHints: ["结论方向", "理由方向", "收尾方向"] },
    bestAnswer: [{ step: 0, text: "结论是可以。", why: "先给结论" }, { step: 1, text: "因为样本够了。", why: "理由" }, { step: 2, text: "所以开始。", why: "收尾" }],
    badExample: { text: "这个嘛……", problems: ["没结论", "拖沓"] },
    study: ["什么是结论先行？", "你的结论是什么？"],
  });
  return {
    paradigms: [paradigm],
    contexts: [context("A01", "academic"), context("F01", "founder")],
    cards: [card("A01-01", "A01"), card("F01-01", "F01")],
  };
}

test("ID 常量：30 课、4 条线、5 个阶段 7/7/7/6/3、3 种当前阶段", () => {
  assert.equal(PARADIGM_IDS.length, 30);
  assert.equal(new Set(PARADIGM_IDS).size, 30);
  assert.deepEqual(LINE_IDS, ["academic", "life", "bridge", "founder"]);
  assert.deepEqual(STAGE_SIZES, [7, 7, 7, 6, 3]);
  assert.deepEqual(CAREER_STAGES, ["phd", "bridge", "founder"]);
});

test("校验器：合法夹具在结构模式下没有错误", () => {
  assert.deepEqual(validateCurriculum(fixture(), { complete: false }), []);
});

test("校验器：能发现引用错误、步骤覆盖错误与语速超限", () => {
  const broken = fixture();
  broken.cards[0].paradigmId = "pyramid"; // 不在语境的 paradigmIds 中
  broken.cards[1].bestAnswer = [{ step: 1, text: "跳过了第一步。", why: "x" }];
  broken.paradigms[0].example.speakSeconds = 1; // 示范每秒字数超限
  broken.contexts[0].keyChecks = ["handled_pressure", "concrete"]; // 关键行为不得包含固定项
  const errors = validateCurriculum(broken, { complete: false }).join("\n");
  assert.match(errors, /A01-01.*paradigmId/);
  assert.match(errors, /F01-01.*bestAnswer/);
  assert.match(errors, /conclusion_first.*语速/);
  assert.match(errors, /A01.*handled_pressure/);
});

test("校验器：完整模式要求数量与迁移题卡", () => {
  const errors = validateCurriculum(fixture(), { complete: true }).join("\n");
  assert.match(errors, /应有 30 课/);
  assert.match(errors, /应有 56 类语境/);
});

test("校验器：没有不同线的迁移题卡时报错", () => {
  const data = fixture();
  data.paradigms[0].transferContextIds = ["A01"]; // 与示范同线
  const errors = validateCurriculum(data, { complete: false }).join("\n");
  assert.match(errors, /conclusion_first.*迁移/);
});

test("56 类语境齐全：4 条线 15/11/10/20，且通过结构校验", () => {
  assert.equal(CONTEXTS.length, 56);
  const count = (line) => CONTEXTS.filter((context) => context.line === line).length;
  assert.deepEqual([count("academic"), count("life"), count("bridge"), count("founder")], [15, 11, 10, 20]);
  assert.deepEqual(validateCurriculum({ paradigms: [], contexts: CONTEXTS, cards: [] }, { complete: false }), []);
});

test("第一阶段 7 课齐全，顺序正确且通过结构校验", () => {
  assert.deepEqual(STAGE1_PARADIGMS.map((item) => item.id), PARADIGM_IDS.slice(0, 7));
  const errors = validateCurriculum({ paradigms: STAGE1_PARADIGMS, contexts: CONTEXTS, cards: [] }, { complete: false });
  assert.deepEqual(errors, []);
});

test("第二阶段 7 课齐全，顺序正确且通过结构校验", () => {
  assert.deepEqual(STAGE2_PARADIGMS.map((item) => item.id), PARADIGM_IDS.slice(7, 14));
  const errors = validateCurriculum({ paradigms: STAGE2_PARADIGMS, contexts: CONTEXTS, cards: [] }, { complete: false });
  assert.deepEqual(errors, []);
});

test("第三阶段 7 课齐全，顺序正确且通过结构校验", () => {
  assert.deepEqual(STAGE3_PARADIGMS.map((item) => item.id), PARADIGM_IDS.slice(14, 21));
  const errors = validateCurriculum({ paradigms: STAGE3_PARADIGMS, contexts: CONTEXTS, cards: [] }, { complete: false });
  assert.deepEqual(errors, []);
});

test("第四阶段 6 课齐全，顺序正确且通过结构校验", () => {
  assert.deepEqual(STAGE4_PARADIGMS.map((item) => item.id), PARADIGM_IDS.slice(21, 27));
  const errors = validateCurriculum({ paradigms: STAGE4_PARADIGMS, contexts: CONTEXTS, cards: [] }, { complete: false });
  assert.deepEqual(errors, []);
});

test("第五阶段 3 课齐全，顺序正确且通过结构校验", () => {
  assert.deepEqual(STAGE5_PARADIGMS.map((item) => item.id), PARADIGM_IDS.slice(27, 30));
  const errors = validateCurriculum({ paradigms: STAGE5_PARADIGMS, contexts: CONTEXTS, cards: [] }, { complete: false });
  assert.deepEqual(errors, []);
});

const ACADEMIC_MATRIX = {
  A01: ["progress_report", "conclusion_first"], A02: ["bad_news", "bad_news"], A03: ["argument", "resolve_conflict"],
  A04: ["ask_resources", "ask_resources"], A05: ["say_no", "say_no"], A06: ["pyramid", "negotiate"],
  A07: ["research_narrative", "research_narrative"], A08: ["handle_challenge", "bridging"], A09: ["research_narrative", "handle_challenge"],
  A10: ["conclusion_first", "concrete"], A11: ["explain_concept", "analogy"], A12: ["teach_method", "teach_method"],
  A13: ["feedback", "ask_resources"], A14: ["story", "story"], A15: ["called_on", "called_on"],
};

/** 题卡矩阵断言：ID、所属语境和主范式与计划完全一致。 */
function assertMatrix(cards, matrix) {
  const expected = Object.entries(matrix).flatMap(([contextId, paradigmIds]) =>
    paradigmIds.map((paradigmId, index) => ({ id: `${contextId}-${String(index + 1).padStart(2, "0")}`, contextId, paradigmId })),
  );
  assert.deepEqual(cards.map(({ id, contextId, paradigmId }) => ({ id, contextId, paradigmId })), expected);
}

test("学术线 30 张题卡与矩阵一致，并通过结构校验", () => {
  assertMatrix(ACADEMIC_CARDS, ACADEMIC_MATRIX);
  const errors = validateCurriculum({ paradigms: PARADIGMS, contexts: CONTEXTS, cards: ACADEMIC_CARDS, industryIds: INDUSTRY_IDS }, { complete: false });
  assert.deepEqual(errors, []);
});

const LIFE_MATRIX = {
  L01: ["self_intro", "self_intro"], L02: ["small_talk", "argument"], L03: ["self_intro", "small_talk"],
  L04: ["active_listening", "active_listening"], L05: ["say_no", "say_no"], L06: ["concrete", "concrete"],
  L07: ["resolve_conflict", "feedback"], L08: ["toast", "toast"], L09: ["argument", "roundtable"],
  L10: ["roundtable", "called_on"], L11: ["facilitate", "facilitate"],
};

test("生活社交线 22 张题卡与矩阵一致，并通过结构校验", () => {
  assertMatrix(LIFE_CARDS, LIFE_MATRIX);
  const errors = validateCurriculum({ paradigms: PARADIGMS, contexts: CONTEXTS, cards: LIFE_CARDS, industryIds: INDUSTRY_IDS }, { complete: false });
  assert.deepEqual(errors, []);
  assert.ok(LIFE_CARDS.every((card) => card.industryId === null));
});

const BRIDGE_MATRIX = {
  B01: ["inquiry", "inquiry"], B02: ["inquiry", "small_talk"], B03: ["value_pitch", "negotiate"],
  B04: ["investor_pitch", "research_narrative"], B05: ["tradeoff", "ask_resources"], B06: ["vision", "story"],
  B07: ["ask_resources", "self_intro"], B08: ["negotiate", "negotiate"], B09: ["analogy", "explain_concept"],
  B10: ["story", "self_intro"],
};

test("转化线 20 张题卡与矩阵一致，并通过结构校验", () => {
  assertMatrix(BRIDGE_CARDS, BRIDGE_MATRIX);
  const errors = validateCurriculum({ paradigms: PARADIGMS, contexts: CONTEXTS, cards: BRIDGE_CARDS, industryIds: INDUSTRY_IDS }, { complete: false });
  assert.deepEqual(errors, []);
});

test("转化线只有 B03、B08、B09 关联行业，且行业 ID 有效", () => {
  for (const card of BRIDGE_CARDS) {
    if (["B03", "B08", "B09"].includes(card.contextId)) assert.ok(INDUSTRY_IDS.includes(card.industryId), card.id);
    else assert.equal(card.industryId, null, card.id);
  }
});

const FOUNDER_MATRIX = {
  F01: ["conclusion_first", "analogy"], F02: ["investor_pitch", "investor_pitch"], F03: ["handle_challenge", "bridging"],
  F04: ["negotiate", "negotiate"], F05: ["vision", "vision"], F06: ["value_pitch", "inquiry"],
  F07: ["value_pitch", "teach_method"], F08: ["negotiate", "say_no"], F09: ["vision", "facilitate", "toast"],
  F10: ["bad_news", "bad_news"], F11: ["resolve_conflict", "tradeoff"], F12: ["feedback", "feedback"],
  F13: ["active_listening", "handle_challenge"], F14: ["bridging", "story"], F15: ["roundtable", "argument"],
  F16: ["pyramid", "handle_challenge"], F17: ["progress_report", "bad_news"], F18: ["resolve_conflict", "ask_resources"],
  F19: ["say_no", "say_no"], F20: ["pyramid", "argument"],
};

test("创业线 41 张题卡与矩阵一致，并通过结构校验", () => {
  assertMatrix(FOUNDER_CARDS, FOUNDER_MATRIX);
  const errors = validateCurriculum({ paradigms: PARADIGMS, contexts: CONTEXTS, cards: FOUNDER_CARDS, industryIds: INDUSTRY_IDS }, { complete: false });
  assert.deepEqual(errors, []);
});

test("创业线题卡全部关联行业，且覆盖至少 12 个行业", () => {
  assert.ok(FOUNDER_CARDS.every((card) => INDUSTRY_IDS.includes(card.industryId)));
  assert.ok(new Set(FOUNDER_CARDS.map((card) => card.industryId)).size >= 12);
});

test("第 1 期内容写全：完整模式校验通过", () => {
  assert.deepEqual(curriculumErrors({ complete: true }), []);
  assert.equal(PRACTICE_CARDS.length, 113);
});

test("运行时题卡展开了语境与范式字段，检查清单 = 步骤 + 关键行为 + 接住打断", () => {
  for (const card of PRACTICE_CARDS) {
    assert.equal(card.checks.at(-1), "handled_pressure", card.id);
    assert.equal(card.checks.length, card.steps.length + card.keyChecks.length + 1, card.id);
    assert.ok(card.lineLabel && card.contextLabel && card.paradigmTitle, card.id);
  }
});
