// test/legacy.test.js
import assert from "node:assert/strict";
import test from "node:test";

import { PRACTICE_CARD_MAP, PARADIGM_MAP } from "../public/js/curriculum/index.js";
import { createDrill } from "../public/js/arena/engine.js";
import { createLessonRun, checkKeys } from "../public/js/arena/lesson-engine.js";
import { ARENA_CARD_MAP } from "../public/js/legacy/scenarios.js";
import { __storageTestables, DEFAULT_SETTINGS } from "../public/js/storage.js";
import { seeded } from "./helpers/random.js";
import { METRICS, TASK_CARDS } from "../public/js/legacy/cards.js";
import { calculateStats, filterHistory } from "../public/js/legacy/stats.js";

const { normalizeDrill, normalizeLessonRun, normalizeImportDocument, normalizeSettings } = __storageTestables;
const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-05T12:00:00").getTime();

function legacyDrill() {
  const card = ARENA_CARD_MAP.get("elevator--catering");
  return {
    drillId: "legacy-1", schemaVersion: 1, cardId: card.id, cardVersion: card.version, mode: "full", status: "completed", phase: "done",
    phaseStartedAt: null, startedAt: new Date(NOW - 86_400_000).toISOString(), completedAt: new Date(NOW).toISOString(),
    selectionReason: "均衡轮换", revisitOf: null, interruptId: card.interrupts[0], interruptAt: 12, followupId: card.followups[0],
    takes: { first: { recordingId: null, durationSeconds: 30, noRecording: true }, second: { recordingId: null, durationSeconds: 30, noRecording: true } },
    checks: { first: Object.fromEntries(card.checks.map((id) => [id, false])), second: Object.fromEntries(card.checks.map((id) => [id, true])) },
    focusCheckId: card.checks[0], notes: {}, lesson: "",
  };
}

function practiceDrill() {
  const card = PRACTICE_CARD_MAP.get("A08-01");
  const drill = createDrill(card, { random: seeded(3), now: NOW });
  return { ...drill, status: "completed", phase: "done", completedAt: new Date(NOW).toISOString(), checks: { first: Object.fromEntries(card.checks.map((id) => [id, true])), second: Object.fromEntries(card.checks.map((id) => [id, true])) }, focusCheckId: "handled_pressure" };
}

test("默认设置使用 careerStage = phd，不再有 homeTrack", () => {
  assert.equal(DEFAULT_SETTINGS.careerStage, "phd");
  assert.equal("homeTrack" in DEFAULT_SETTINGS, false);
});

test("设置：接受任意 homeTrack 并丢弃；careerStage 只能是三档之一", () => {
  const settings = normalizeSettings({ homeTrack: "whatever", careerStage: "founder" });
  assert.equal(settings.careerStage, "founder");
  assert.equal("homeTrack" in settings, false);
  assert.throws(() => normalizeSettings({ careerStage: "ceo" }), /当前阶段/);
});

test("回合按 schemaVersion 分流：旧回合按旧题库校验，新回合按新题库严格校验", () => {
  assert.equal(normalizeDrill(legacyDrill()).schemaVersion, 1);
  const normalized = normalizeDrill(practiceDrill());
  assert.equal(normalized.schemaVersion, 2);
  assert.deepEqual([normalized.contextId, normalized.paradigmId, normalized.line], ["A08", "handle_challenge", "academic"]);
  assert.throws(() => normalizeDrill({ ...practiceDrill(), cardId: "Z99-01" }), /不存在/);
  assert.throws(() => normalizeDrill({ ...practiceDrill(), checks: { first: { not_a_check: true }, second: {} } }), /未知检查项/);
});

test("课程记录按 schemaVersion 分流：同名 bad_news 的旧记录仍按旧课程校验", () => {
  const legacyCard = ARENA_CARD_MAP.get("bad_news--logistics");
  const transfer = [...ARENA_CARD_MAP.values()].find((card) => card.scenarioId === "bad_news" && card.industryId !== "logistics");
  const legacyRun = {
    runId: "legacy-run", schemaVersion: 1, scenarioId: "bad_news", exampleCardId: legacyCard.id, transferCardId: transfer.id,
    phase: "done", status: "completed", startedAt: new Date(NOW - 1000).toISOString(), completedAt: new Date(NOW).toISOString(),
    takes: {}, checks: {}, lesson: "",
  };
  assert.equal(normalizeLessonRun(legacyRun).schemaVersion, 1);
  const run = createLessonRun(PARADIGM_MAP.get("bad_news"), { random: seeded(2), now: NOW });
  const normalized = normalizeLessonRun(run);
  assert.equal(normalized.schemaVersion, 2);
  assert.equal(normalized.paradigmId, "bad_news");
  assert.throws(() => normalizeLessonRun({ ...run, transferCardId: "A01-01" }), /迁移/);
});

test("导入 version 1：homeTrack 不报错，旧回合保持旧版", () => {
  const data = { format: "speak-clearly-export", version: 1, settings: { homeTrack: "practice" }, sessions: [], activeSession: null, favorites: [], drills: [legacyDrill()], lessonRuns: [] };
  const normalized = normalizeImportDocument(data);
  assert.equal("homeTrack" in normalized.settings, false);
  assert.equal(normalized.drills[0].schemaVersion, 1);
});

test("导入 version 2：新回合严格校验", () => {
  const data = { format: "speak-clearly-export", version: 2, settings: {}, sessions: [], drills: [practiceDrill()], lessonRuns: [] };
  assert.equal(normalizeImportDocument(data).drills[0].schemaVersion, 2);
  assert.throws(() => normalizeImportDocument({ ...data, version: 3 }), /受支持/);
});

test("课程检查项按轮次校验：迁移题卡的关键行为只能出现在 transfer 槽位", () => {
  const run = createLessonRun(PARADIGM_MAP.get("bad_news"), { random: seeded(2), now: NOW });
  const [keyCheck] = PRACTICE_CARD_MAP.get(run.transferCardId).keyChecks;
  assert.ok(checkKeys(run, "check3").includes(keyCheck));
  const misplaced = { ...run, checks: { ...run.checks, retell1: { [keyCheck]: true } } };
  assert.throws(() => normalizeLessonRun(misplaced), /未知检查项/);
  const placed = { ...run, checks: { ...run.checks, transfer: { [keyCheck]: true } } };
  assert.equal(normalizeLessonRun(placed).checks.transfer[keyCheck], true);
});

test("新版回合：abandoned 但缺少 completedAt 会被拒绝（界面放弃回合时必须写入 completedAt）", () => {
  assert.throws(() => normalizeDrill({ ...practiceDrill(), status: "abandoned", completedAt: null }), /完成时间/);
});

// 旧版能力档案折叠区仍在使用 legacy/stats.js，以下用例从已删除的 core.test.js 迁入
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
