// test/ui.test.js
// 渲染级测试：直接调用控制器的 renderWorkspace，检查各阶段输出的 HTML，不依赖 DOM。
import assert from "node:assert/strict";
import test from "node:test";

import { createDrill } from "../public/js/arena/engine.js";
import { renderCurriculumMap } from "../public/js/arena/lesson-ui.js";
import { createArenaController } from "../public/js/arena/ui.js";
import { PARADIGMS, PRACTICE_CARDS } from "../public/js/curriculum/index.js";
import { seeded } from "./helpers/random.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// 选一张至少有两步、且好答案覆盖第 2 步的题卡，便于检查“漏掉的步骤”高亮
const CARD = PRACTICE_CARDS.find((card) => card.steps.length >= 2 && card.bestAnswer.some((item) => item.step === 1));

/** 构造最小上下文的练习控制器，并把进行中的回合放进 state。 */
function renderDrill(patch) {
  const drill = { ...createDrill(CARD, { random: seeded(3), mode: patch.mode }), ...patch };
  const state = { activeDrill: drill, drills: [], view: "drill", renderVersion: 0, audioUrls: [] };
  const arena = createArenaController({
    root: null,
    state,
    escapeHtml,
    icon: () => "",
    render() {},
    navigate() {},
    showToast() {},
    playTone() {},
    saveRecording: async () => {},
    loadRecording: async () => null,
    saveDrillProgress: async () => {},
  });
  return arena.renderWorkspace();
}

const allChecks = (value) => Object.fromEntries(CARD.checks.map((id) => [id, value]));

test("准备阶段只渲染选结构引导，不泄露本题最优方案", () => {
  assert.ok(CARD, "需要至少一张覆盖第 2 步的题卡");
  const html = renderDrill({ phase: "prep1", phaseStartedAt: Date.now() });
  assert.match(html, /class="drill-panel prep-guide"/);
  assert.doesNotMatch(html, /structure-guide/);
  for (const item of CARD.bestAnswer) {
    assert.equal(html.includes(escapeHtml(item.text)), false, `准备阶段不应出现好答案原句：${item.text}`);
  }
});

test("补课阶段揭晓最优方案，并高亮首轮漏掉的步骤", () => {
  const html = renderDrill({ phase: "learn", phaseStartedAt: Date.now(), checks: { first: { ...allChecks(true), s1: false }, second: {} } });
  for (const item of CARD.bestAnswer) {
    assert.ok(html.includes(escapeHtml(item.text)), `补课阶段应出现好答案原句：${item.text}`);
  }
  assert.match(html, /class="model-line step-1 is-missed"/);
  assert.doesNotMatch(html, /class="model-line step-0 is-missed"/);
});

test("闪电回合结束页把最优方案收进可展开区域", () => {
  const html = renderDrill({ mode: "quick", phase: "done", checks: { first: allChecks(false), second: allChecks(true) } });
  assert.match(html, /<details class="best-answer-toggle">/);
  assert.match(html, /data-action="drill-next"/);
});

test("30 课地图把进行中的一课标为“进行中”并设置 aria-current", () => {
  const active = PARADIGMS[0];
  const html = renderCurriculumMap(
    { runs: [], activeRun: { status: "in_progress", schemaVersion: 2, paradigmId: active.id } },
    { escapeHtml },
  );
  const tile = html.match(new RegExp(`<button[^>]*data-paradigm="${active.id}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? "";
  assert.match(tile, /aria-current="step"/);
  assert.match(tile, /进行中/);
  assert.equal((html.match(/aria-current=/g) ?? []).length, 1);
});
