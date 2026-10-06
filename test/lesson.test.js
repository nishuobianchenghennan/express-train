// test/lesson.test.js
import assert from "node:assert/strict";
import test from "node:test";

import { CONTEXT_MAP, PARADIGMS, PARADIGM_MAP, PRACTICE_CARD_MAP } from "../public/js/curriculum/index.js";
import {
  LESSON_ORDER, advanceLesson, checkKeys, createLessonRun, learnedParadigms, lessonProgress, missedSteps,
  pickTransferCard, recentlyLearned, recommendedLesson, stepCoverage, stepKey, validateLessonPhase,
} from "../public/js/arena/lesson-engine.js";
import { seeded } from "./helpers/random.js";

const NOW = new Date("2026-10-05T12:00:00").getTime();

/** 把一次课程推进到指定阶段，每次表达标记为只计时，每项检查按 judge 判断。 */
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
    current = advanceLesson(current, NOW);
  }
  return current;
}

function completedRun(paradigmId, daysAgo = 1) {
  const run = createLessonRun(PARADIGM_MAP.get(paradigmId), { random: seeded(1), now: NOW - daysAgo * 86_400_000 });
  return { ...runThrough(run, "done"), completedAt: new Date(NOW - daysAgo * 86_400_000).toISOString() };
}

test("课程顺序就是 30 课的课序", () => {
  assert.deepEqual(LESSON_ORDER.map((item) => item.order), Array.from({ length: 30 }, (_, index) => index + 1));
});

test("新课程记录是 schemaVersion 2，以 paradigmId 为键，迁移题卡属于本课且与示范不同线", () => {
  for (const paradigm of PARADIGMS) {
    const run = createLessonRun(paradigm, { random: seeded(3), now: NOW });
    assert.equal(run.schemaVersion, 2);
    assert.equal(run.paradigmId, paradigm.id);
    assert.equal("scenarioId" in run, false);
    const card = PRACTICE_CARD_MAP.get(run.transferCardId);
    assert.equal(card.paradigmId, paradigm.id, paradigm.id);
    assert.ok(paradigm.transferContextIds.includes(card.contextId), paradigm.id);
    assert.notEqual(card.line, CONTEXT_MAP.get(paradigm.exampleContextId).line, paradigm.id);
  }
});

test("一课完整走完：前两次只检查步骤，迁移检查加上语境关键行为但不含接住打断", () => {
  const paradigm = PARADIGM_MAP.get("conclusion_first");
  const run = createLessonRun(paradigm, { random: seeded(5), now: NOW });
  assert.deepEqual(checkKeys(run, "check1"), paradigm.steps.map((_, index) => stepKey(index)));
  const transferKeys = checkKeys(run, "check3");
  const card = PRACTICE_CARD_MAP.get(run.transferCardId);
  assert.deepEqual(transferKeys, [...paradigm.steps.map((_, index) => stepKey(index)), ...card.keyChecks]);
  assert.equal(transferKeys.includes("handled_pressure"), false);
  const done = runThrough(run, "done", (slot, key) => !(slot === "retell1" && key === "s1"));
  assert.equal(done.status, "completed");
  assert.deepEqual(stepCoverage(done, "retell1"), { hit: paradigm.steps.length - 1, total: paradigm.steps.length });
  assert.deepEqual(missedSteps(done, "retell1").map((item) => item.index), [1]);
});

test("迁移选卡优先不同线、未用过；都用过时选最久未用的", () => {
  const paradigm = PARADIGM_MAP.get("self_intro"); // 迁移语境 B10、B07、L01，示范在生活线
  const exampleLine = CONTEXT_MAP.get(paradigm.exampleContextId).line;
  const first = pickTransferCard(paradigm, { runs: [], random: seeded(2) });
  assert.notEqual(PRACTICE_CARD_MAP.get(first.id).line, exampleLine);
  const crossLine = [...PRACTICE_CARD_MAP.values()].filter((card) => card.paradigmId === "self_intro" && paradigm.transferContextIds.includes(card.contextId) && card.line !== exampleLine);
  const runs = crossLine.map((card, index) => ({ schemaVersion: 2, paradigmId: "self_intro", status: "completed", transferCardId: card.id, completedAt: new Date(NOW - (index + 1) * 86_400_000).toISOString() }));
  const oldest = runs.at(-1).transferCardId;
  assert.equal(pickTransferCard(paradigm, { runs, random: seeded(2) }).id, oldest);
});

test("已学范式只统计 schemaVersion 2 的完成记录，旧课程（含同名 bad_news）不算", () => {
  const legacyRun = { schemaVersion: 1, scenarioId: "bad_news", status: "completed", completedAt: new Date(NOW).toISOString() };
  assert.equal(learnedParadigms([legacyRun]).size, 0);
  const runs = [completedRun("conclusion_first"), legacyRun];
  assert.deepEqual([...learnedParadigms(runs)], ["conclusion_first"]);
  assert.equal(lessonProgress(runs).conclusion_first.completed, 1);
});

test("推荐下一课：一课没学时是第 1 课；学过的按课序跳过", () => {
  assert.equal(recommendedLesson([]).id, "conclusion_first");
  assert.equal(recommendedLesson([completedRun("conclusion_first")]).id, "pyramid");
});

test("刚学范式：3 天内完成的课", () => {
  const runs = [completedRun("conclusion_first", 1), completedRun("pyramid", 5)];
  assert.deepEqual([...recentlyLearned(runs, NOW)], ["conclusion_first"]);
});

test("迁移题优先选没用过的：pyramid 的两张跨线迁移题，用过的那张不再被选中", () => {
  const paradigm = PARADIGM_MAP.get("pyramid"); // 示范在学术线，跨线迁移题为 F16-01、F20-01
  const used = { ...completedRun("pyramid", 2), transferCardId: "F16-01" };
  const seen = new Set();
  for (let index = 0; index < 100; index += 1) {
    seen.add(pickTransferCard(paradigm, { runs: [used], random: seeded(index + 1) }).id);
  }
  assert.deepEqual([...seen], ["F20-01"]);
});
