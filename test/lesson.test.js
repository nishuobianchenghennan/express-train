import assert from "node:assert/strict";
import test from "node:test";

import { ARENA_CARD_MAP, SCENARIOS, SCENARIO_MAP } from "../public/js/arena/scenarios.js";
import { LESSONS, LESSON_MAP } from "../public/js/arena/lessons.js";
import {
  LESSON_ORDER,
  advanceLesson,
  checkKeys,
  createLessonRun,
  exampleCard,
  learnedScenarios,
  lessonProgress,
  missedSteps,
  pickTransferCard,
  recommendedLesson,
  stepCoverage,
  stepKey,
  validateLessonPhase,
} from "../public/js/arena/lesson-engine.js";
import { selectArenaCard } from "../public/js/arena/engine.js";
import { createSeededRandom } from "../public/js/core/selection.js";

function seeded(seed) {
  const random = createSeededRandom(seed);
  for (let index = 0; index < 4; index += 1) random();
  return random;
}

/** 把一次课程推进到指定阶段，期间每次表达都标记为只计时、每项检查都按给定结果判断。 */
function runThrough(run, untilPhase, judge = () => true) {
  let current = run;
  while (current.phase !== untilPhase) {
    if (["retell1", "retell2", "transfer"].includes(current.phase)) {
      current = { ...current, takes: { ...current.takes, [current.phase]: { recordingId: null, durationSeconds: 40, noRecording: true } } };
    }
    const slot = { check1: "retell1", check2: "retell2", check3: "transfer" }[current.phase];
    if (slot) {
      const checks = Object.fromEntries(checkKeys(current, current.phase).map((key) => [key, judge(slot, key)]));
      current = { ...current, checks: { ...current.checks, [slot]: checks } };
    }
    assert.equal(validateLessonPhase(current).valid, true, `${current.phase} 应可推进`);
    current = advanceLesson(current);
  }
  return current;
}

test("every practice scenario has exactly one lesson with a matching example card", () => {
  assert.equal(LESSONS.length, SCENARIOS.length);
  for (const scenario of SCENARIOS) {
    const lesson = LESSON_MAP.get(scenario.id);
    assert.ok(lesson, scenario.id);
    assert.ok(exampleCard(lesson), `${scenario.id} 缺少示范卡`);
  }
});

test("model answers walk every structure step in order and fit the speaking time", () => {
  for (const lesson of LESSONS) {
    const steps = lesson.model.map((item) => item.step);
    assert.ok(lesson.steps.length >= 4 && lesson.steps.length <= 6, lesson.scenarioId);
    assert.deepEqual([...new Set(steps)], lesson.steps.map((_, index) => index), `${lesson.scenarioId} 示范必须按顺序覆盖每一步`);
    assert.ok(lesson.model.every((item) => item.text.length > 10 && item.why.length > 10), lesson.scenarioId);
    assert.ok(lesson.steps.every((item) => item.label && item.purpose && item.phrase), lesson.scenarioId);
    assert.ok(lesson.weak.problems.length >= 3, `${lesson.scenarioId} 反例至少指出三个问题`);
    assert.ok(lesson.hard && lesson.listener && lesson.why && lesson.transfer, lesson.scenarioId);
    const characters = lesson.model.map((item) => item.text).join("").length;
    const seconds = SCENARIO_MAP.get(lesson.scenarioId).speakSeconds;
    assert.ok(characters / seconds <= 4.6, `${lesson.scenarioId} 示范过长：${characters} 字 / ${seconds} 秒`);
  }
});

test("lesson order starts with the easiest scenarios", () => {
  const difficulties = LESSON_ORDER.map((item) => SCENARIO_MAP.get(item.scenarioId).difficulty);
  assert.deepEqual(difficulties, [...difficulties].sort((left, right) => left - right));
  assert.equal(recommendedLesson([]).scenarioId, LESSON_ORDER[0].scenarioId);
});

test("a lesson fades scaffolding and ends with a transfer to a different industry", () => {
  const lesson = LESSON_MAP.get("bad_news");
  const run = createLessonRun(lesson, { random: seeded(1) });
  const transfer = ARENA_CARD_MAP.get(run.transferCardId);
  assert.equal(transfer.scenarioId, "bad_news");
  assert.notEqual(transfer.industryId, lesson.exampleIndustry);
  assert.equal(run.phase, "intro");

  const atRetell = runThrough(run, "retell1");
  assert.match(validateLessonPhase(atRetell).message, /完成这次表达/);

  const atCheck1 = runThrough(run, "check1");
  assert.match(validateLessonPhase(atCheck1).message, /还有 4 项/);
  assert.deepEqual(checkKeys(atCheck1, "check1"), lesson.steps.map((_, index) => stepKey(index)));
  assert.deepEqual(checkKeys(atCheck1, "check3").slice(lesson.steps.length), transfer.checks, "迁移检查加入场景关键行为");

  // 第一次复述漏掉第 2、3 步，第二次全部讲到
  const missing = runThrough(run, "retell2", (slot, key) => !(slot === "retell1" && ["s1", "s2"].includes(key)));
  assert.deepEqual(missedSteps(missing, "retell1").map((item) => item.index), [1, 2]);
  assert.deepEqual(stepCoverage(missing, "retell1"), { hit: 2, total: 4 });

  const done = runThrough(run, "done");
  assert.equal(done.status, "completed");
  assert.ok(done.completedAt);
});

test("repeat lessons rotate transfer industries and progress unlocks learned scenarios", () => {
  const lesson = LESSON_MAP.get("elevator");
  const first = runThrough(createLessonRun(lesson, { random: seeded(2) }), "done");
  const second = createLessonRun(lesson, { runs: [first], random: seeded(2) });
  assert.notEqual(second.transferCardId, first.transferCardId);
  assert.equal(pickTransferCard(lesson, { runs: [first], random: () => 0 }).industryId === lesson.exampleIndustry, false);

  assert.deepEqual(lessonProgress([first]).elevator.completed, 1);
  assert.deepEqual([...learnedScenarios([first, { ...second, status: "abandoned" }])], ["elevator"]);
  assert.notEqual(recommendedLesson([first]).scenarioId, "elevator");
});

test("practice prefers scenarios the learner has already studied", () => {
  const learned = new Set(["complaint"]);
  let applied = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const { card, reason } = selectArenaCard({ learned, random: seeded(seed) });
    if (card.scenarioId === "complaint") {
      applied += 1;
      assert.match(reason, /应用已学结构/);
    }
  }
  assert.ok(applied >= 20 && applied <= 36, `约 70% 的回合应选择已学场景，实际 ${applied}/40`);
});

test("lesson storage normalization rejects cards from another scenario", async () => {
  const { __storageTestables } = await import("../public/js/storage.js");
  const run = runThrough(createLessonRun(LESSON_MAP.get("toast"), { random: seeded(3) }), "done");
  const normalized = __storageTestables.normalizeLessonRun({ ...run, takes: { ...run.takes, retell1: { recordingId: "rec-x", durationSeconds: 30, noRecording: false } } });
  assert.equal(normalized.takes.retell1.recordingId, "rec-x");
  assert.equal(__storageTestables.normalizeLessonRun(normalized, { stripRecordings: true }).takes.retell1.recordingId, null);
  assert.throws(() => __storageTestables.normalizeLessonRun({ ...run, transferCardId: "pitch--bank" }), /迁移卡/);
  assert.throws(() => __storageTestables.normalizeLessonRun({ ...run, checks: { ...run.checks, retell1: { s9: true } } }), /未知检查项/);
  const document = __storageTestables.normalizeImportDocument({ format: "speak-clearly-export", version: 1, sessions: [], lessonRuns: [run] });
  assert.equal(document.lessonRuns.length, 1);
  assert.throws(() => __storageTestables.normalizeImportDocument({ format: "speak-clearly-export", version: 1, sessions: [], lessonRuns: [run, run] }), /重复学习记录/);
});
