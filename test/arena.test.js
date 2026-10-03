import assert from "node:assert/strict";
import test from "node:test";

import { INDUSTRIES } from "../public/js/arena/industries.js";
import { ARENA_CARDS, ARENA_CARD_MAP, CHECKS, FAMILIES, PRESSURES, SCENARIOS } from "../public/js/arena/scenarios.js";
import {
  advanceDrill,
  arenaStats,
  checkRates,
  createDrill,
  drillOutcome,
  dueRevisits,
  phaseSequence,
  selectArenaCard,
  suggestFocus,
  validatePhase,
  weakestCheck,
} from "../public/js/arena/engine.js";
import { createSeededRandom } from "../public/js/core/selection.js";

const DAY_MS = 86_400_000;

/** 线性同余生成器的前几个输出对相邻种子几乎相同，空转几次以获得分散的序列。 */
function seeded(seed) {
  const random = createSeededRandom(seed);
  for (let index = 0; index < 4; index += 1) random();
  return random;
}
const NOW = new Date("2026-10-03T12:00:00").getTime();

/** 构造一个已完成的回合；checks 未给出时默认首轮全没做到、重讲全做到。 */
function completedDrill(cardId, { daysAgo = 1, first, second, revisitOf = null } = {}) {
  const card = ARENA_CARD_MAP.get(cardId);
  const drill = createDrill(card, { random: createSeededRandom(7), revisitOf, now: NOW - daysAgo * DAY_MS });
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

test("arena card bank crosses every scenario with every industry without gaps", () => {
  assert.equal(ARENA_CARDS.length, SCENARIOS.length * INDUSTRIES.length);
  assert.equal(new Set(ARENA_CARDS.map((card) => card.id)).size, ARENA_CARDS.length);
  for (const card of ARENA_CARDS) {
    const serialized = JSON.stringify(card);
    assert.doesNotMatch(serialized, /undefined|null|\$\{/, card.id);
    assert.ok(FAMILIES[card.family], card.id);
    assert.ok(card.checks.length >= 4 && card.checks.length <= 5, card.id);
    assert.ok(card.checks.every((id) => CHECKS[id]), card.id);
    assert.ok([...card.interrupts, ...card.followups].every((id) => PRESSURES[id]), card.id);
    assert.ok(card.cognitionPrompts.length >= 3, card.id);
    assert.equal(new Set(card.cognitionPrompts).size, card.cognitionPrompts.length, `${card.id} 补课问题重复`);
    assert.ok(card.prepSeconds <= 30, `${card.id} 准备时间应保持冷启动`);
  }
});

test("every family offers scenarios at the entry difficulty", () => {
  for (const family of Object.keys(FAMILIES)) {
    assert.ok(SCENARIOS.some((scenario) => scenario.family === family), family);
  }
  assert.ok(SCENARIOS.filter((scenario) => scenario.difficulty === 1).length >= 4);
});

test("drill phases speak first, learn after the first attempt, and skip learning in quick mode", () => {
  assert.deepEqual(phaseSequence("full"), ["brief", "prep1", "take1", "check1", "learn", "prep2", "take2", "check2", "done"]);
  assert.ok(!phaseSequence("quick").includes("learn"));
  assert.ok(phaseSequence("full").indexOf("take1") < phaseSequence("full").indexOf("learn"));
});

test("a drill uses distinct interrupt and follow-up pressure and lands the interrupt mid-take", () => {
  const card = ARENA_CARD_MAP.get("bad_news--catering");
  for (let seed = 1; seed < 30; seed += 1) {
    const drill = createDrill(card, { random: seeded(seed) });
    assert.ok(card.interrupts.includes(drill.interruptId));
    assert.ok(card.followups.includes(drill.followupId));
    assert.notEqual(drill.interruptId, drill.followupId);
    assert.ok(drill.interruptAt >= card.speakSeconds * 0.4 - 1 && drill.interruptAt <= card.speakSeconds * 0.6 + 1);
  }
});

test("phase validation requires a take, a full checklist and one focus before moving on", () => {
  const card = ARENA_CARD_MAP.get("elevator--bank");
  let drill = createDrill(card, { random: createSeededRandom(3), mode: "quick" });
  drill = advanceDrill(advanceDrill(drill));
  assert.equal(drill.phase, "take1");
  assert.equal(validatePhase(drill, card).valid, false);
  drill = advanceDrill({ ...drill, takes: { ...drill.takes, first: { recordingId: null, durationSeconds: 28, noRecording: true } } });
  assert.equal(drill.phase, "check1");
  assert.match(validatePhase(drill, card).message, /还有 4 项/);
  const judged = { ...drill, checks: { ...drill.checks, first: { conclusion_early: false, concrete: true, ask_clear: true, no_overrun: true } } };
  assert.match(validatePhase(judged, card).message, /唯一/);
  const focused = { ...judged, focusCheckId: suggestFocus(judged, card) };
  assert.equal(focused.focusCheckId, "conclusion_early");
  assert.equal(validatePhase(focused, card).valid, true);
  assert.equal(advanceDrill(focused).phase, "prep2", "闪电回合跳过补课");
});

test("completing the last phase marks the drill completed and reports the outcome", () => {
  const card = ARENA_CARD_MAP.get("pitch--hotel");
  const drill = completedDrill(card.id, {
    first: { counterpart_value: false, concrete: true, audience_fit: false, question_back: false },
    second: { counterpart_value: true, concrete: true, audience_fit: true, question_back: false },
  });
  const outcome = drillOutcome({ ...drill, focusCheckId: "counterpart_value" }, card);
  assert.deepEqual(outcome, { firstPassed: 1, secondPassed: 3, total: 4, focusFixed: true, improved: true });
  const finishing = { ...drill, status: "in_progress", phase: "check2", completedAt: null };
  const done = advanceDrill(finishing, NOW);
  assert.equal(done.phase, "done");
  assert.equal(done.status, "completed");
  assert.equal(done.completedAt, new Date(NOW).toISOString());
});

test("weakness is measured on cold first takes and steers selection toward that behaviour", () => {
  const drills = [
    completedDrill("elevator--catering", { first: { conclusion_early: false, concrete: true, ask_clear: true, no_overrun: true } }),
    completedDrill("refuse--bank", { first: { conclusion_early: false, tradeoff: true, alternative: true, no_overpromise: true } }),
    completedDrill("called_on--saas", { first: { conclusion_early: false, one_thread: true, concrete: true, no_overrun: true } }),
  ];
  assert.equal(weakestCheck(drills), "conclusion_early");
  assert.equal(checkRates(drills).conclusion_early.firstRate, 0);
  const scenarios = new Set();
  for (let seed = 1; seed < 20; seed += 1) {
    const { card, reason } = selectArenaCard({ drills, now: NOW, random: seeded(seed) });
    assert.ok(card.checks.includes("conclusion_early"), card.id);
    assert.match(reason, /结论先行/);
    scenarios.add(card.scenarioId);
  }
  assert.ok(scenarios.size >= 3, "弱项强化不能只反复出同一类场景");
});

test("drill storage normalization derives card metadata and strips recordings for export", async () => {
  const { __storageTestables } = await import("../public/js/storage.js");
  const drill = {
    ...completedDrill("complaint--hotel"),
    title: "伪造的标题",
    family: "upward",
    takes: { first: { recordingId: "rec-1", durationSeconds: 80, noRecording: false }, second: { recordingId: null, durationSeconds: 70, noRecording: true } },
    notes: { 0: "  关键词  " },
  };
  const normalized = __storageTestables.normalizeDrill(drill);
  assert.equal(normalized.title, ARENA_CARD_MAP.get("complaint--hotel").title);
  assert.equal(normalized.family, "client");
  assert.equal(normalized.notes[0], "关键词");
  assert.equal(normalized.takes.first.recordingId, "rec-1");
  const exported = __storageTestables.normalizeDrill(drill, { stripRecordings: true });
  assert.equal(exported.takes.first.recordingId, null);
  assert.equal(exported.takes.first.noRecording, true);
  assert.throws(() => __storageTestables.normalizeDrill({ ...drill, cardId: "missing--card" }), /不存在的实战卡/);
  assert.throws(() => __storageTestables.normalizeDrill({ ...drill, checks: { first: { invented: true }, second: {} } }), /未知检查项/);
  assert.throws(() => __storageTestables.normalizeDrill({ ...drill, completedAt: null }), /完成时间/);
  const document = __storageTestables.normalizeImportDocument({ format: "speak-clearly-export", version: 1, sessions: [], drills: [drill] });
  assert.equal(document.drills.length, 1);
  assert.throws(() => __storageTestables.normalizeImportDocument({ format: "speak-clearly-export", version: 1, sessions: [], drills: [drill, drill] }), /重复实战回合/);
});

test("selection interleaves families, avoids recent cards and expands into new industries", () => {
  const drills = [completedDrill("elevator--catering", { first: { conclusion_early: true, concrete: true, ask_clear: true, no_overrun: true }, second: { conclusion_early: true, concrete: true, ask_clear: true, no_overrun: true } })];
  for (let seed = 1; seed < 20; seed += 1) {
    const { card } = selectArenaCard({ drills, now: NOW, random: seeded(seed) });
    assert.notEqual(card.family, "upward");
    assert.notEqual(card.industryId, "catering");
    assert.ok(card.difficulty <= 1, "新手阶段先给入门难度");
  }
});

test("failed drills come back for spaced revisits with different pressure", () => {
  const old = completedDrill("challenged--logistics", { daysAgo: 4 });
  assert.deepEqual(dueRevisits([old], NOW).map((drill) => drill.drillId), [old.drillId]);
  assert.deepEqual(dueRevisits([completedDrill("challenged--logistics", { daysAgo: 1 })], NOW), [], "未满 3 天不复练");
  const revisited = completedDrill("challenged--logistics", { daysAgo: 0, revisitOf: old.drillId });
  assert.deepEqual(dueRevisits([old, revisited], NOW), [], "复练过一次后不再重复");
  const selection = selectArenaCard({ drills: [old], now: NOW, random: () => 0.1 });
  assert.equal(selection.card.id, old.cardId);
  assert.equal(selection.revisitOf, old.drillId);
  const drill = createDrill(selection.card, { avoidPressures: selection.avoidPressures, random: createSeededRandom(2) });
  assert.ok(!selection.avoidPressures.includes(drill.interruptId) || selection.card.interrupts.every((id) => selection.avoidPressures.includes(id)));
});

test("family filters restrict the pool", () => {
  for (let seed = 1; seed < 10; seed += 1) {
    assert.equal(selectArenaCard({ family: "insight", random: seeded(seed) }).card.family, "insight");
  }
});

test("arena stats count streaks, coverage, pressure handling and improvement", () => {
  const drills = [
    completedDrill("bad_news--catering", { daysAgo: 0 }),
    completedDrill("negotiation--bank", { daysAgo: 1 }),
    completedDrill("toast--gaming", { daysAgo: 3 }),
    { ...createDrill(ARENA_CARD_MAP.get("pitch--hotel")), status: "abandoned" },
  ];
  const stats = arenaStats(drills, NOW);
  assert.equal(stats.completed, 3);
  assert.equal(stats.today, 1);
  assert.equal(stats.streak, 2);
  assert.equal(stats.industriesCovered, 3);
  assert.equal(stats.pressureRate, 0);
  assert.equal(stats.improvementRate, 100);
});
