import assert from "node:assert/strict";
import test from "node:test";

import { METRICS, TASK_CARDS } from "../public/js/data/cards.js";
import {
  advanceStage,
  createSession,
  currentElapsed,
  extendTimer,
  startTraining,
  timerRemaining,
  toggleTimer,
  validateStage,
} from "../public/js/core/session.js";
import {
  annualPlanAlternative,
  annualPlanEntryForDate,
  createAnnualPlan,
  createSeededRandom,
  selectTask,
  simulateSelections,
} from "../public/js/core/selection.js";
import { calculateStats, filterHistory } from "../public/js/core/stats.js";

const DAY_MS = 86_400_000;

function countBy(items, key) {
  return items.reduce((counts, item) => {
    counts[item[key]] = (counts[item[key]] ?? 0) + 1;
    return counts;
  }, {});
}

test("30-day constrained simulation covers all scenes and domains evenly", () => {
  const history = simulateSelections(TASK_CARDS, 30, 42);
  const scenes = countBy(history, "scene");
  const domains = countBy(history, "domain");

  assert.equal(history.length, 30);
  assert.equal(new Set(history.map((session) => session.taskCardId)).size, 30);
  assert.equal(Object.keys(scenes).length, 10);
  assert.deepEqual(new Set(Object.values(scenes)), new Set([3]));
  assert.equal(Object.keys(domains).length, 12);
  assert.ok(Math.max(...Object.values(domains)) - Math.min(...Object.values(domains)) <= 1);

  for (let index = 0; index < history.length; index += 1) {
    const recentTopics = history.slice(Math.max(0, index - 6), index).map((item) => item.topic);
    assert.equal(recentTopics.includes(history[index].topic), false);
  }

  let structureRun = 1;
  for (let index = 1; index < history.length; index += 1) {
    structureRun = history[index].structureId === history[index - 1].structureId ? structureRun + 1 : 1;
    assert.ok(structureRun <= 2);
  }
});

test("deterministic annual plan uses every card once with progression and adjacency control", () => {
  const first = createAnnualPlan(TASK_CARDS, { year: 2026, seed: 42 });
  const second = createAnnualPlan(TASK_CARDS, { year: 2026, seed: 42 });
  const alternate = createAnnualPlan(TASK_CARDS, { year: 2026, seed: 43 });

  assert.equal(first.length, 365);
  assert.deepEqual(first.map((entry) => entry.cardId), second.map((entry) => entry.cardId));
  assert.notDeepEqual(first.map((entry) => entry.cardId), alternate.map((entry) => entry.cardId));
  assert.equal(new Set(first.map((entry) => entry.cardId)).size, 365);
  assert.deepEqual(new Set(first.map((entry) => entry.cardId)), new Set(TASK_CARDS.map((card) => card.id)));
  assert.equal(first[0].date, "2026-01-01");
  assert.equal(first.at(-1).date, "2026-12-31");
  assert.equal(first[0].dayNumber, 1);
  assert.equal(first.at(-1).dayNumber, 365);
  assert.equal(annualPlanEntryForDate(first, "2026-09-16")?.date, "2026-09-16");
  assert.equal(annualPlanEntryForDate(first, "2027-01-01"), null);

  for (let index = 1; index < first.length; index += 1) {
    assert.notEqual(first[index].card.scene, first[index - 1].card.scene);
    assert.notEqual(first[index].card.domain, first[index - 1].card.domain);
    assert.notEqual(first[index].card.structureId, first[index - 1].card.structureId);
  }

  const segmentSize = Math.floor(first.length / 4);
  const averages = [0, 1, 2, 3].map((quarter) => {
    const start = quarter * segmentSize;
    const end = quarter === 3 ? first.length : (quarter + 1) * segmentSize;
    const segment = first.slice(start, end);
    return segment.reduce((sum, entry) => sum + entry.card.difficulty, 0) / segment.length;
  });
  assert.ok(averages.every((average, index) => index === 0 || average > averages[index - 1]));
});

test("leap-year annual plan skips February 29 while retaining 365 training days", () => {
  const plan = createAnnualPlan(TASK_CARDS, { year: 2028, seed: 42 });
  assert.equal(plan.length, 365);
  assert.equal(plan.some((entry) => entry.date === "2028-02-29"), false);
  assert.equal(plan[58].date, "2028-02-28");
  assert.equal(plan[59].date, "2028-03-01");
  assert.equal(plan.at(-1).date, "2028-12-31");
  assert.equal(annualPlanEntryForDate(plan, "2028-02-29")?.date, "2028-02-28");
});

test("annual plan refuses incomplete banks and invalid years", () => {
  assert.throws(() => createAnnualPlan(TASK_CARDS.slice(0, 364), { year: 2026 }), /365/);
  assert.throws(() => createAnnualPlan(TASK_CARDS, { year: 1969 }), /1970-9999/);
});

test("annual-plan sensitive alternatives are deterministic and honor all prior skips", () => {
  const plan = createAnnualPlan(TASK_CARDS, { year: 2026, seed: 42 });
  const current = plan.find((entry) => entry.card.sensitiveFlags.length > 0);
  const first = annualPlanAlternative(plan, current.cardId);
  const second = annualPlanAlternative(plan, current.cardId, [first.cardId]);

  assert.equal(first.cardId, annualPlanAlternative(plan, current.cardId).cardId);
  assert.notEqual(first.cardId, current.cardId);
  assert.notEqual(second.cardId, current.cardId);
  assert.notEqual(second.cardId, first.cardId);
  assert.equal(annualPlanAlternative([], current.cardId), null);
});

test("requested scene and difficulty remain respected", () => {
  const random = createSeededRandom(9);
  const result = selectTask({
    cards: TASK_CARDS,
    history: [],
    settings: { level: 4 },
    requestedScene: "interview_answer",
    random,
  });

  assert.equal(result.card.scene, "interview_answer");
  assert.ok(result.card.difficulty >= 3);
  assert.match(result.reason, /指定场景/);
});

test("sessions preserve repeatable sensitive-task skips without consuming the normal swap", () => {
  const card = TASK_CARDS.find((item) => item.sensitiveFlags.length > 0);
  const session = createSession(card, {
    swapUsed: false,
    annualPlanDate: "2026-12-31",
    annualPlanDayNumber: 365,
    sensitiveSkipCount: 3,
    sensitiveSkippedCardIds: [card.id, card.id, TASK_CARDS[0].id],
  });
  const replacement = createSession(TASK_CARDS[2], {
    swapUsed: session.swapUsed,
    annualPlanDate: session.annualPlanDate,
    annualPlanDayNumber: session.annualPlanDayNumber,
    sensitiveSkipCount: session.sensitiveSkipCount + 1,
    sensitiveSkippedCardIds: [...session.sensitiveSkippedCardIds, session.taskCardId],
  });

  assert.equal(session.swapUsed, false);
  assert.equal(session.sensitiveSkipCount, 3);
  assert.deepEqual(session.sensitiveSkippedCardIds, [card.id, TASK_CARDS[0].id]);
  assert.equal(replacement.swapUsed, false);
  assert.equal(replacement.annualPlanDate, "2026-12-31");
  assert.equal(replacement.annualPlanDayNumber, 365);
  assert.equal(replacement.sensitiveSkipCount, 4);
});

test("target-timestamp timer survives pause and extension", () => {
  const card = TASK_CARDS.find((item) => item.id === "IMP-001");
  let session = startTraining(createSession(card, { mode: "full" }));
  const origin = 1_000_000;

  session = toggleTimer(session, origin);
  assert.equal(timerRemaining(session.timer, origin + 20_000), 100);
  assert.equal(Math.round(currentElapsed(session.timer, origin + 20_000)), 20);

  session = toggleTimer(session, origin + 20_000);
  assert.equal(session.timer.runningSince, null);
  assert.equal(Math.round(session.timer.elapsedSeconds), 20);

  session = extendTimer(session, 300);
  assert.equal(session.timer.durationSeconds, 420);
  assert.equal(session.extendedStages.research, 300);
});

test("combined learning stage enforces research, evidence and structured notes before delivery", () => {
  const card = TASK_CARDS.find((item) => item.id === "VID-002");
  let session = startTraining(createSession(card, { mode: "full" }));

  assert.equal(session.stage, "research");
  assert.equal(session.stageMinutes.organize, 0);
  assert.equal(session.stageMinutes.research, card.stageMinutes.research + card.stageMinutes.organize);
  assert.equal(validateStage(session, card).valid, false);

  for (const prompt of card.researchPrompts) {
    session.researchChecks[prompt] = true;
  }
  session.sources = [
    { name: "来源一", url: "https://example.com/one", support: "支持判断标准", kind: "fact" },
    { name: "来源二", url: "https://example.com/two", support: "提供边界材料", kind: "counter" },
  ];
  session.sourceRequirementsMet = true;
  assert.equal(validateStage(session, card).valid, false);

  for (const key of card.organizingTemplate.slice(0, 3)) {
    session.userNotes[key] = `${key}的判断、证据与边界`;
  }
  assert.equal(validateStage(session, card).valid, true);

  session = advanceStage(session, 20_000);
  assert.equal(session.stage, "firstDelivery");
  assert.equal(validateStage(session, card).valid, false);
  session.recordingUnavailable.first = true;
  assert.equal(validateStage(session, card).valid, true);

  session = advanceStage(session, 30_000);
  assert.equal(session.stage, "review");
  assert.equal(validateStage(session, card).valid, false);
  for (const metricId of card.reviewMetricIds) {
    session.selfScores[metricId] = 3;
  }
  session.mainProblem = "开头进入主题较慢";
  session.effectiveAction = "例子与判断标准对应清楚";
  session.retryFocus = "前二十秒直接说明判断标准";
  assert.equal(validateStage(session, card).valid, true);

  session = advanceStage(session, 40_000);
  assert.equal(session.stage, "retry");
  session.recordingUnavailable.retry = true;
  for (const metricId of card.reviewMetricIds) {
    session.retryScores[metricId] = 4;
  }
  session.observableImprovement = true;
  assert.equal(validateStage(session, card).valid, true);
});

test("ability statistics and all history filters remain observable", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  const base = TASK_CARDS.find((item) => item.topic === "cheap_not_value");
  const sessions = [0, 1, 2].map((offset) => ({
    sessionId: `session-${offset}`,
    taskCardId: base.id,
    taskCardVersion: 1,
    scene: base.scene,
    sceneLabel: base.sceneLabel,
    domain: base.domain,
    domainLabel: base.domainLabel,
    topic: base.topic,
    topicLabel: base.topicLabel,
    title: base.title,
    taskTypes: base.taskTypes,
    protocol: base.protocol,
    structureId: base.structureId,
    structureName: base.structureName,
    difficulty: base.difficulty,
    startedAt: new Date(now.getTime() - (offset + 1) * DAY_MS).toISOString(),
    completedAt: new Date(now.getTime() - (offset + 1) * DAY_MS).toISOString(),
    completionStatus: "completed",
    recordingRetryId: `recording-${offset}`,
    selfScores: Object.fromEntries(base.reviewMetricIds.map((id) => [id, 2 + offset])),
    retryScores: Object.fromEntries(base.reviewMetricIds.map((id) => [id, 3 + offset])),
    mainProblem: "书面长句过多",
    retryFocus: "每句话只表达一个意思",
    observableImprovement: true,
    migrationRecommended: offset === 0,
    sources: [{ name: "来源", support: "证据" }],
    sourceRequirementsMet: true,
  }));

  const stats = calculateStats(sessions, TASK_CARDS, METRICS, now);
  assert.equal(stats.completeLoops28, 3);
  assert.equal(stats.retryCount, 3);
  assert.equal(stats.improvementRate, 100);
  assert.equal(stats.sourceComplianceRate, 100);
  assert.equal(stats.problems[0].count, 3);
  assert.equal(stats.focus.label, "书面长句过多");

  const filtered = filterHistory(sessions, {
    scene: base.scene,
    domain: base.domain,
    taskType: base.taskTypes[0],
    structureId: base.structureId,
    difficulty: String(base.difficulty),
    retry: "yes",
    problem: "书面长句过多",
    migration: "yes",
    completionStatus: "completed",
    query: "便宜",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].sessionId, "session-0");
});

test("rolling stats exclude future sessions and fall back from empty retry scores", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  const card = TASK_CARDS[0];
  const metricId = card.reviewMetricIds[0];
  const past = {
    sessionId: "past",
    taskCardId: card.id,
    scene: card.scene,
    domain: card.domain,
    protocol: card.protocol,
    structureId: card.structureId,
    startedAt: new Date(now.getTime() - DAY_MS).toISOString(),
    completedAt: new Date(now.getTime() - DAY_MS).toISOString(),
    completionStatus: "completed",
    selfScores: { [metricId]: 2 },
    retryScores: {},
    mainProblem: "past problem",
  };
  const future = {
    ...past,
    sessionId: "future",
    scene: "future-scene",
    domain: "future-domain",
    structureId: "future-structure",
    startedAt: new Date(now.getTime() + DAY_MS).toISOString(),
    completedAt: new Date(now.getTime() + DAY_MS).toISOString(),
    selfScores: { [metricId]: 1 },
    retryScores: { [metricId]: 5 },
    mainProblem: "future problem",
  };

  const stats = calculateStats([past, future], TASK_CARDS, METRICS, now);

  assert.equal(stats.completeLoops28, 1);
  assert.deepEqual(stats.sceneCounts7, { [card.scene]: 1 });
  assert.deepEqual(stats.domainCounts60, { [card.domain]: 1 });
  assert.equal(stats.structureDiversity30, 1);
  assert.deepEqual(stats.problems, [{ problem: "past problem", count: 1 }]);
  assert.deepEqual(stats.metrics[metricId], {
    average: 2,
    count: 1,
    recent: 2,
    change: 0,
  });
});
