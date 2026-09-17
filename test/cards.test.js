import assert from "node:assert/strict";
import test from "node:test";

import {
  CARD_BANK_VERSION,
  DOMAINS,
  METRICS,
  PROTOCOLS,
  SCENES,
  STRUCTURES,
  TASK_CARDS,
  TASK_TYPES,
} from "../public/js/data/cards.js";

function countBy(items, key) {
  return items.reduce((counts, item) => {
    counts[item[key]] = (counts[item[key]] ?? 0) + 1;
    return counts;
  }, {});
}

test("card bank contains 365 complete, versioned scenario tasks", () => {
  assert.equal(CARD_BANK_VERSION, "2026.09.16-1");
  assert.equal(TASK_CARDS.length, 365);
  assert.equal(new Set(TASK_CARDS.map((card) => card.id)).size, 365);
  assert.equal(new Set(TASK_CARDS.map((card) => `${card.scene}:${card.topic}`)).size, 365);

  for (const card of TASK_CARDS) {
    assert.equal(card.version, 1);
    assert.equal(card.status, "active");
    assert.ok(SCENES[card.scene]);
    assert.ok(DOMAINS[card.domain]);
    assert.ok(PROTOCOLS[card.protocol]);
    assert.ok(STRUCTURES[card.structureId]);
    assert.ok(card.taskTypes.every((id) => TASK_TYPES[id]));
    assert.ok(card.reviewMetricIds.every((id) => METRICS[id]));
    assert.ok(card.researchPrompts.length >= 4);
    assert.ok(card.sourceRequirements.length >= 3);
    assert.ok(card.organizingTemplate.length >= 4);
    assert.ok(card.constraints.length >= 3);
    assert.ok(card.completionCriteria.length >= 3);
    assert.ok(card.estimatedMinutes >= 8 && card.estimatedMinutes <= 40);
    assert.ok(card.difficulty >= 1 && card.difficulty <= 5);
    assert.equal(card.baseWeight, 1);
  }
});

test("annual bank follows the fixed scene, domain, and matrix distribution", () => {
  const scenes = countBy(TASK_CARDS, "scene");
  const domains = countBy(TASK_CARDS, "domain");
  const matrix = countBy(
    TASK_CARDS.map((card) => ({ cell: `${card.scene}:${card.domain}` })),
    "cell",
  );

  assert.deepEqual(new Set(Object.keys(scenes)), new Set(Object.keys(SCENES)));
  assert.deepEqual(new Set(Object.keys(domains)), new Set(Object.keys(DOMAINS)));
  assert.equal(Object.values(scenes).filter((count) => count === 37).length, 5);
  assert.equal(Object.values(scenes).filter((count) => count === 36).length, 5);
  assert.equal(Object.values(domains).filter((count) => count === 31).length, 5);
  assert.equal(Object.values(domains).filter((count) => count === 30).length, 7);
  assert.equal(Object.keys(matrix).length, 120);
  assert.equal(Object.values(matrix).filter((count) => count === 4).length, 5);
  assert.equal(Object.values(matrix).filter((count) => count === 3).length, 115);

  const extraCells = new Set(
    Object.entries(matrix)
      .filter(([, count]) => count === 4)
      .map(([cell]) => cell),
  );
  assert.deepEqual(
    extraCells,
    new Set([
      "impromptu:personal_life",
      "public_speaking:psychology_behavior",
      "social_conversation:relationships",
      "knowledge_explanation:workplace_organization",
      "argumentation:business_entrepreneurship",
    ]),
  );
});

test("annual bank covers every protocol, task type, structure, and difficulty", () => {
  assert.deepEqual(new Set(TASK_CARDS.map((card) => card.protocol)), new Set(Object.keys(PROTOCOLS)));
  assert.deepEqual(new Set(TASK_CARDS.flatMap((card) => card.taskTypes)), new Set(Object.keys(TASK_TYPES)));
  assert.deepEqual(new Set(TASK_CARDS.map((card) => card.structureId)), new Set(Object.keys(STRUCTURES)));
  assert.deepEqual(new Set(TASK_CARDS.map((card) => card.difficulty)), new Set([1, 2, 3, 4, 5]));
});

test("cards do not reveal a ready-made topic answer", () => {
  const forbidden = ["参考答案", "标准答案", "照读稿", "完整稿件如下", "最终答案是"];
  for (const card of TASK_CARDS) {
    const content = JSON.stringify(card);
    for (const phrase of forbidden) {
      assert.equal(content.includes(phrase), false, `${card.id} includes forbidden phrase ${phrase}`);
    }
  }
});
