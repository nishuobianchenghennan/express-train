// test/practice.test.js
import assert from "node:assert/strict";
import test from "node:test";

import { LINE_WEIGHTS } from "../public/js/curriculum/contexts.js";
import { PARADIGM_IDS } from "../public/js/curriculum/ids.js";
import { PRACTICE_CARDS, PRACTICE_CARD_MAP } from "../public/js/curriculum/index.js";
import {
  advanceDrill, behaviorRates, createDrill, currentWeakness, drawSequence, drillOutcome, dueRevisits, phaseSequence,
  practiceStats, selectPracticeCard, structureRates, suggestFocus, validatePhase,
} from "../public/js/arena/engine.js";
import { seeded } from "./helpers/random.js";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-05T12:00:00").getTime();
const ALL_LEARNED = new Set(PARADIGM_IDS);

/** 构造一个已完成的新版回合；未给出 checks 时首轮全没做到、重讲全做到。 */
function completedDrill(cardId, { daysAgo = 1, first, second, revisitOf = null } = {}) {
  const card = PRACTICE_CARD_MAP.get(cardId);
  const drill = createDrill(card, { random: seeded(7), revisitOf, now: NOW - daysAgo * DAY_MS });
  const all = (value) => Object.fromEntries(card.checks.map((id) => [id, value]));
  return {
    ...drill,
    status: "completed",
    phase: "done",
    completedAt: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    checks: { first: first ?? all(false), second: second ?? all(true) },
    focusCheckId: card.checks[0],
  };
}

test("新回合记录：schemaVersion 2，带语境、范式与线；打断与追问来自语境且不同", () => {
  for (const card of PRACTICE_CARDS.slice(0, 40)) {
    const drill = createDrill(card, { random: seeded(11), now: NOW });
    assert.equal(drill.schemaVersion, 2);
    assert.deepEqual([drill.cardId, drill.contextId, drill.paradigmId, drill.line], [card.id, card.contextId, card.paradigmId, card.line]);
    assert.ok(card.interrupts.includes(drill.interruptId));
    assert.ok(card.followups.includes(drill.followupId));
    assert.notEqual(drill.interruptId, drill.followupId);
    assert.ok(drill.interruptAt >= card.speakSeconds * 0.4 - 1 && drill.interruptAt <= card.speakSeconds * 0.6 + 1);
  }
});

test("阶段顺序：先开口后补课，闪电回合跳过补课", () => {
  assert.deepEqual(phaseSequence("full"), ["brief", "prep1", "take1", "check1", "learn", "prep2", "take2", "check2", "done"]);
  assert.equal(phaseSequence("quick").includes("learn"), false);
});

test("检查阶段要求判断完整份清单（步骤 + 关键行为 + 接住打断）并选定唯一目标", () => {
  const card = PRACTICE_CARD_MAP.get("A08-01");
  let drill = { ...createDrill(card, { random: seeded(1), now: NOW }), phase: "check1" };
  assert.equal(validatePhase(drill, card).valid, false);
  const checks = Object.fromEntries(card.checks.map((id) => [id, true]));
  drill = { ...drill, checks: { ...drill.checks, first: checks } };
  assert.equal(validatePhase(drill, card).valid, false); // 还没选重讲目标
  drill = { ...drill, focusCheckId: suggestFocus(drill, card) };
  assert.equal(validatePhase(drill, card).valid, true);
});

test("重讲目标建议：先选没做到的范式步骤，全部做到时选接住打断", () => {
  const card = PRACTICE_CARD_MAP.get("A08-01");
  const base = createDrill(card, { random: seeded(1), now: NOW });
  const allYes = Object.fromEntries(card.checks.map((id) => [id, true]));
  assert.equal(suggestFocus({ ...base, checks: { first: allYes, second: {} } }, card), "handled_pressure");
  const keyMiss = { ...allYes, [card.keyChecks[0]]: false, s1: false };
  assert.equal(suggestFocus({ ...base, checks: { first: keyMiss, second: {} } }, card), "s1");
});

test("完成最后一个阶段时标记完成并给出结果摘要", () => {
  const card = PRACTICE_CARD_MAP.get("A01-01");
  const drill = { ...completedDrill("A01-01"), status: "in_progress", phase: "check2", completedAt: null };
  const done = advanceDrill(drill, NOW);
  assert.equal(done.status, "completed");
  const outcome = drillOutcome(done, card);
  assert.deepEqual([outcome.firstPassed, outcome.secondPassed, outcome.total], [0, card.checks.length, card.checks.length]);
});

test("行为弱项只统计 CHECKS，结构弱项按范式统计步骤覆盖率，步骤不跨范式合并", () => {
  const cardA = PRACTICE_CARD_MAP.get("A01-01"); // progress_report
  const cardB = PRACTICE_CARD_MAP.get("A02-01"); // bad_news
  // 漏掉前两步：进展汇报共 4 步，覆盖率 50%，低于 70% 的弱项阈值
  const missTwoSteps = (card) => Object.fromEntries(card.checks.map((id) => [id, id !== "s0" && id !== "s1"]));
  const drills = [1, 2, 3].map((day) => completedDrill("A01-01", { daysAgo: day, first: missTwoSteps(cardA) }))
    .concat([completedDrill("A02-01", { daysAgo: 4, first: Object.fromEntries(cardB.checks.map((id) => [id, true])) })]);
  const behavior = behaviorRates(drills);
  assert.equal(Object.keys(behavior).some((id) => /^s\d+$/.test(id)), false);
  const structure = structureRates(drills);
  assert.equal(structure.progress_report.attempts, 3);
  assert.equal(structure.progress_report.coverage, Math.round(((cardA.steps.length - 2) / cardA.steps.length) * 100));
  assert.equal(structure.bad_news.coverage, 100);
  const weakness = currentWeakness(drills);
  assert.deepEqual([weakness.kind, weakness.id], ["structure", "progress_report"]);
});

test("旧回合（schemaVersion 1）不参与弱项、复练与统计", () => {
  const legacy = { schemaVersion: 1, cardId: "elevator--catering", status: "completed", completedAt: new Date(NOW - 5 * DAY_MS).toISOString(), checks: { first: { conclusion_early: false }, second: {} } };
  assert.equal(currentWeakness([legacy]), null);
  assert.deepEqual(dueRevisits([legacy], NOW), []);
  assert.equal(practiceStats([legacy], NOW).completed, 0);
});

test("没学任何范式时不出题；只出已学范式的题", () => {
  assert.equal(selectPracticeCard({ drills: [], learned: new Set(), careerStage: "phd", now: NOW, random: seeded(1) }), null);
  const learned = new Set(["conclusion_first"]);
  for (let index = 0; index < 50; index += 1) {
    const selection = selectPracticeCard({ drills: [], learned, careerStage: "phd", now: NOW, random: seeded(index + 1) });
    assert.equal(selection.card.paradigmId, "conclusion_first");
  }
});

test("线权重：三种当前阶段下 5000 次抽题的线占比与权重表偏差不超过 5 个百分点", () => {
  for (const careerStage of ["phd", "bridge", "founder"]) {
    const random = seeded(99);
    const counts = { academic: 0, life: 0, bridge: 0, founder: 0 };
    for (let index = 0; index < 5000; index += 1) {
      counts[selectPracticeCard({ drills: [], learned: ALL_LEARNED, careerStage, now: NOW, random }).card.line] += 1;
    }
    for (const [line, weight] of Object.entries(LINE_WEIGHTS[careerStage])) {
      assert.ok(Math.abs((counts[line] / 5000) * 100 - weight) <= 5, `${careerStage} ${line}: ${counts[line] / 50}% vs ${weight}%`);
    }
  }
});

test("某条线没有候选时，权重转给其他线", () => {
  const learned = new Set(["say_no"]); // A05、L05、F08、F19 有题，转化线没有
  for (let index = 0; index < 200; index += 1) {
    const selection = selectPracticeCard({ drills: [], learned, careerStage: "phd", now: NOW, random: seeded(index + 1) });
    assert.notEqual(selection.card.line, "bridge");
  }
});

test("去重：最近 30 个回合练过的题卡不再出现", () => {
  const learned = new Set(["conclusion_first", "pyramid"]);
  const recent = ["A01-02", "A10-01", "F01-01"].map((id, index) => completedDrill(id, { daysAgo: index + 1, first: Object.fromEntries(PRACTICE_CARD_MAP.get(id).checks.map((key) => [key, true])) }));
  for (let index = 0; index < 100; index += 1) {
    const selection = selectPracticeCard({ drills: recent, learned, careerStage: "phd", now: NOW, random: seeded(index + 1) });
    assert.equal(["A01-02", "A10-01", "F01-01"].includes(selection.card.id), false, selection.card.id);
  }
});

test("交错：不连续出与上一回合相同的语境或范式（有其他候选时）", () => {
  const last = completedDrill("A15-01", { daysAgo: 0.1, first: Object.fromEntries(PRACTICE_CARD_MAP.get("A15-01").checks.map((key) => [key, true])) });
  for (let index = 0; index < 100; index += 1) {
    const selection = selectPracticeCard({ drills: [last], learned: ALL_LEARNED, careerStage: "phd", now: NOW, random: seeded(index + 1) });
    assert.notEqual(selection.card.contextId, "A15");
    assert.notEqual(selection.card.paradigmId, "called_on");
  }
});

test("到期复练：3–30 天前首轮有未做到项的回合会以约 50% 概率回来，并换一组压力", () => {
  const failed = completedDrill("A01-01", { daysAgo: 5 });
  let revisits = 0;
  for (let index = 0; index < 200; index += 1) {
    const selection = selectPracticeCard({ drills: [failed], learned: ALL_LEARNED, careerStage: "phd", now: NOW, random: seeded(index + 1) });
    if (selection.revisitOf) {
      revisits += 1;
      assert.equal(selection.card.id, "A01-01");
      assert.deepEqual(selection.avoidPressures, [failed.interruptId, failed.followupId]);
    }
  }
  // 相邻种子的首个随机数相关性较强，区间放宽，只检验“大约一半”
  assert.ok(revisits > 50 && revisits < 150, `复练次数 ${revisits}`);
});

test("行为弱项会引导选题，并写进选题原因", () => {
  // 三个回合首轮都没做到“具体可感”（行为弱项，做到率 0%）；超过 30 天，不触发复练
  const failConcrete = (id) => Object.fromEntries(PRACTICE_CARD_MAP.get(id).checks.map((key) => [key, key !== "concrete"]));
  // 按完成时间排序，31 天前的 A04-01 是“上一回合”，交错过滤会排除 A04 与 ask_resources
  const drills = [["A12-01", 33], ["A11-01", 32], ["A04-01", 31]].map(([id, day]) => completedDrill(id, { daysAgo: day, first: failConcrete(id) }));
  assert.deepEqual(currentWeakness(drills), { kind: "behavior", id: "concrete", rate: 0 });
  let targeted = 0;
  for (let index = 0; index < 100; index += 1) {
    const selection = selectPracticeCard({ drills, learned: ALL_LEARNED, careerStage: "phd", now: NOW, random: seeded(index + 1) });
    assert.ok(["学术线", "生活社交线", "转化线", "创业线"].some((label) => selection.reason.startsWith(label)), selection.reason);
    if (selection.reason.includes("强化弱项「具体可感」")) {
      targeted += 1;
      assert.ok(selection.card.checks.includes("concrete"), selection.card.id);
    }
  }
  assert.ok(targeted > 20, `强化弱项出现 ${targeted} 次`);
});

test("刚学的范式加权并写进选题原因", () => {
  const reasons = new Set();
  for (let index = 0; index < 100; index += 1) {
    reasons.add(selectPracticeCard({ drills: [], learned: ALL_LEARNED, recent: new Set(["self_intro"]), careerStage: "phd", now: NOW, random: seeded(index + 1) }).reason);
  }
  assert.ok([...reasons].some((reason) => reason.includes("刚学的范式")));
});

test("软过滤会清空候选时被跳过：只剩同语境题卡时仍然出题", () => {
  const all = (id) => Object.fromEntries(PRACTICE_CARD_MAP.get(id).checks.map((key) => [key, true]));
  const last = completedDrill("A15-01", { daysAgo: 0.1, first: all("A15-01") });
  const learned = new Set(["called_on"]); // 题卡只有 A15-01、A15-02、L10-02
  const seen = new Set();
  for (let index = 0; index < 100; index += 1) {
    seen.add(selectPracticeCard({ drills: [last], learned, careerStage: "phd", now: NOW, random: seeded(index + 1) }).card.id);
  }
  assert.ok(seen.has("A15-02"), "学术线只剩同语境的 A15-02，交错过滤应被跳过");
  assert.equal(seen.has("A15-01"), false, "A15-01 刚练过，应被去重排除");
});

test("去重逐级放宽：已学范式的题全部练过时仍然出题", () => {
  const ids = ["L08-01", "L08-02", "F09-03"]; // toast 的全部题卡
  const all = (id) => Object.fromEntries(PRACTICE_CARD_MAP.get(id).checks.map((key) => [key, true]));
  const drills = ids.map((id, index) => completedDrill(id, { daysAgo: index + 1, first: all(id) }));
  const selection = selectPracticeCard({ drills, learned: new Set(["toast"]), careerStage: "phd", now: NOW, random: seeded(1) });
  assert.ok(ids.includes(selection.card.id));
});

test("抽题动画序列落在选中的题卡上", () => {
  const winner = PRACTICE_CARD_MAP.get("F02-01");
  const sequence = drawSequence({ cards: PRACTICE_CARDS, winner, length: 12, random: seeded(4) });
  assert.equal(sequence.cards.length, 12);
  assert.equal(sequence.cards[sequence.winnerIndex].id, "F02-01");
});

test("抽题动画序列边界：只有中奖卡或长度不足 3 时不出现 undefined，中奖位置合法", () => {
  const winner = PRACTICE_CARD_MAP.get("F02-01");
  for (const cards of [[winner], []]) {
    const sequence = drawSequence({ cards, winner, length: 2, random: seeded(3) });
    assert.equal(sequence.cards.length, 2);
    assert.ok(sequence.cards.every((card) => card && card.id));
    assert.ok(sequence.winnerIndex >= 0);
    assert.equal(sequence.cards[sequence.winnerIndex].id, winner.id);
  }
  const single = drawSequence({ cards: PRACTICE_CARDS, winner, length: 1, random: seeded(3) });
  assert.deepEqual(single.cards.map((card) => card.id), ["F02-01"]);
  assert.equal(single.winnerIndex, 0);
});

test("并列弱项：行为与结构做到率相等时取行为弱项（即使结构样本更多）", () => {
  const card = PRACTICE_CARD_MAP.get("A01-01");
  const stepsOnly = Object.fromEntries(card.steps.map((_, index) => [`s${index}`, false]));
  // 三个回合全部没做到：行为 0%（3 次）、结构 0%（3 次）；再加一个只判断了步骤的回合，使结构样本多于行为样本
  const drills = [1, 2, 3].map((day) => completedDrill("A01-01", { daysAgo: day + 40 }))
    .concat([completedDrill("A01-01", { daysAgo: 40, first: stepsOnly })]);
  assert.equal(structureRates(drills).progress_report.attempts, 4);
  const weakness = currentWeakness(drills);
  assert.equal(weakness.kind, "behavior");
  assert.equal(weakness.rate, 0);
});

test("难度软过滤：无历史时只出难度 1；出现弱项后上限放宽到 +1", () => {
  for (const careerStage of ["phd", "bridge", "founder"]) {
    for (let index = 0; index < 150; index += 1) {
      const { card } = selectPracticeCard({ drills: [], learned: ALL_LEARNED, careerStage, now: NOW, random: seeded(index + 1) });
      assert.equal(card.difficulty, 1, `${careerStage} ${card.id}`);
    }
  }
  const failConcrete = (id) => Object.fromEntries(PRACTICE_CARD_MAP.get(id).checks.map((key) => [key, key !== "concrete"]));
  const drills = [["A12-01", 33], ["A11-01", 32], ["A04-01", 31]].map(([id, day]) => completedDrill(id, { daysAgo: day, first: failConcrete(id) }));
  assert.equal(currentWeakness(drills).id, "concrete");
  const difficulties = new Set();
  for (let index = 0; index < 300; index += 1) {
    const { card } = selectPracticeCard({ drills, learned: ALL_LEARNED, careerStage: "phd", now: NOW, random: seeded(index + 1) });
    assert.ok(card.difficulty <= 2, card.id);
    difficulties.add(card.difficulty);
  }
  assert.ok(difficulties.has(2), "有弱项时应能出现难度 2 的题卡");
});

test("刚学范式 ×1.5 加权：同一组种子下，刚学范式的占比高于没有刚学范式时", () => {
  const countRecent = (recent) => {
    let hits = 0;
    for (let index = 0; index < 1500; index += 1) {
      const { card } = selectPracticeCard({ drills: [], learned: ALL_LEARNED, recent, careerStage: "phd", now: NOW, random: seeded(index + 1) });
      if (card.paradigmId === "self_intro") hits += 1;
    }
    return hits;
  };
  const baseline = countRecent(new Set());
  const boosted = countRecent(new Set(["self_intro"]));
  assert.ok(boosted > baseline, `加权 ${boosted} 次 vs 基线 ${baseline} 次`);
});

test("统计：连续天数、线覆盖、接住打断率与到期复练", () => {
  const drills = [completedDrill("A01-01", { daysAgo: 0 }), completedDrill("L01-01", { daysAgo: 1 }), completedDrill("F01-01", { daysAgo: 5 })];
  const stats = practiceStats(drills, NOW);
  assert.equal(stats.completed, 3);
  assert.equal(stats.streak, 2);
  assert.deepEqual(stats.lineCounts, { academic: 1, life: 1, founder: 1 });
  assert.equal(stats.pressureRate, 0);
  assert.equal(stats.revisitsDue, 1);
});
