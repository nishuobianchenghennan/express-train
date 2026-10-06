import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createApp } from "../src/app.js";
import { parseHost, parsePort, resolveStaticRoot } from "../src/config.js";

async function withServer(run) {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("GET / serves the application with privacy-oriented headers", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`, {
      headers: { accept: "text/html" },
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /object-src 'none'/);
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=(self)");
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(body, /<title>讲明白<\/title>/);
    assert.match(body, /\/js\/app\.js/);
  });
});

test("service worker precaches one complete version of the module graph", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/sw.js`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.match(body, /CACHE_PREFIX.*speak-clearly-/);
    assert.match(body, /2026\.10\.06-3/);
    assert.match(body, /\/js\/curriculum\/index\.js/);
    assert.match(body, /key\.startsWith\(CACHE_PREFIX\).*key !== CACHE_NAME/);
    assert.match(body, /\/js\/legacy\/card-additions\.js/);
    assert.match(body, /fetch\(request, \{ cache: "no-store" \}\)/);
    assert.match(body, /cache\.put\("\/index\.html", response\.clone\(\)\)/);
    assert.doesNotMatch(body, /return cached \?\? fetch\(request, \{ cache: "no-store" \}\)/);
  });
});

test("modal form controls are not treated as backdrop close actions", async () => {
  const source = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
  assert.match(source, /explicitModalControl = event\.target\.closest\("\[data-modal-panel\] \[data-action\]"\)/);
  assert.match(source, /state\.modal && modalPanel\?\.contains\(event\.target\) && !explicitModalControl/);
});

test("首页从已学范式中抽一道练习题，5 秒定格后开始回合", async () => {
  const source = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
  assert.match(source, /const TOPIC_DRAW_DURATION_MS = 5_000/);
  assert.match(source, /selectPracticeCard\(\{\s*drills: state\.drills,\s*learned: learnedParadigms\(state\.lessonRuns\),\s*recent: recentlyLearned\(state\.lessonRuns\),\s*careerStage: state\.settings\.careerStage,?\s*\}\)/);
  assert.match(source, /winnerId: selection\.card\.id/);
  assert.match(source, /status === "settled" && index === winnerIndex/);
  assert.match(source, /revisitOf: draw\.revisitOf/);
  assert.match(source, /avoidPressures: draw\.avoidPressures/);
  assert.match(source, /await arena\.startDrill\(card,/);
  assert.match(source, /data-action="start-revisit"/);
  assert.doesNotMatch(source, /home-track|homeTrack|renderTrackSwitch|selectArenaCard/);
  assert.match(source, /function applyTopicDrawMotion\(\)/);
  assert.match(source, /root\.innerHTML = renderHome\(\);\n\s+applyTopicDrawMotion\(\);/);
  assert.match(source, /duration: TOPIC_DRAW_DURATION_MS, easing: TOPIC_DRAW_EASING, fill: "forwards"/);
  assert.match(source, /startedAt: performance\.now\(\)/);
});

test("启动与导入后归档旧版进行中训练，旧版进行中记录不进入界面", async () => {
  const source = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
  // 至少两处调用：启动时一次、导入数据后一次
  assert.ok((source.match(/await archiveLegacyInProgress\(\)/g)?.length ?? 0) >= 2);
  const functionBody = (name) => {
    const start = source.indexOf(`async function ${name}(`);
    return source.slice(start, source.indexOf("\n}\n", start));
  };
  assert.match(functionBody("initialize"), /archiveLegacyInProgress\(\)/);
  assert.match(functionBody("importData"), /archiveLegacyInProgress\(\)/);
  assert.match(source, /if \(state\.activeDrill\?\.schemaVersion !== 2\) state\.activeDrill = null;/);
  assert.match(source, /if \(state\.activeLesson\?\.schemaVersion !== 2\) state\.activeLesson = null;/);
  assert.doesNotMatch(source, /loadFavorites|saveFavorites|core\/selection\.js/);
});

test("topic draw track never relies on inline style attributes blocked by CSP", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../public/js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(source, /topic-draw-track[^`]*style="/);
  assert.doesNotMatch(styles, /var\(--(draw|idle)-(offset|p\d)\)/);
  assert.match(source, /data-draw-offset="\$\{offset\}" data-idle-offset="\$\{idleOffset\}"/);
});

test("browser routes fall back to the application shell", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/history`, {
      headers: { accept: "text/html" },
    });

    assert.equal(response.status, 200);
    assert.match(await response.text(), /id="app"/);
  });
});

test("GET /health reports a healthy service", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(typeof body.uptime, "number");
    assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test("unknown non-browser routes return JSON 404 responses", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`, {
      headers: { accept: "application/json" },
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not Found" });
  });
});

test("server configuration rejects unsafe values and validates static roots", () => {
  assert.equal(parseHost("  "), "127.0.0.1");
  assert.equal(parseHost(" 127.0.0.1 "), "127.0.0.1");
  assert.equal(parsePort(undefined), 3000);
  assert.equal(parsePort(" 3001 "), 3001);
  assert.throws(() => parsePort("3000junk"), /decimal integer/);
  assert.throws(() => parsePort("1e3"), /decimal integer/);
  assert.throws(() => parsePort("0"), /decimal integer/);
  assert.equal(resolveStaticRoot({ configured: "public", nodeEnv: "production" }).endsWith("public"), true);
  assert.throws(() => resolveStaticRoot({ configured: ".", nodeEnv: "development" }), /index.html/);
  assert.throws(() => resolveStaticRoot({ configured: "missing-static-root", nodeEnv: "development" }), /does not exist/);
});

test("malformed JSON is a client error without leaking server details", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.notEqual(body.error, "Internal Server Error");
    assert.doesNotMatch(body.error, /node_modules|at .*\.js/);
  });
});

test("练习回合：准备阶段只给选结构引导，补课阶段才揭晓最优方案", async () => {
  const source = await readFile(new URL("../public/js/arena/ui.js", import.meta.url), "utf8");
  const prep = source.match(/function renderPrep\([\s\S]*?\n  }\n/)?.[0] ?? "";
  assert.match(prep, /renderPrepGuide\(card\)/);
  assert.doesNotMatch(prep, /bestAnswer/);
  const learn = source.match(/function renderLearn\([\s\S]*?\n  }\n/)?.[0] ?? "";
  assert.match(learn, /renderBestAnswer\(drill, card\)/);
  assert.match(source, /function renderBestAnswer\(drill, card\)[\s\S]*?missedStepIndexes\(drill, card\)/);
  assert.doesNotMatch(source, /legacy\//);
});

test("旧版历史搜索框边输入边筛选：input 事件写入查询词并防抖重渲染", async () => {
  const source = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf('root.addEventListener("input"'), source.indexOf("let filterTimer"));
  assert.match(handler, /if \(target\.matches\("\[data-history-filter='query'\]"\)\) \{(?:\n\s*\/\/[^\n]*)?\n\s*state\.historyFilters\.query = target\.value;\n\s*debounceFilterRender\(target\);/);
  assert.doesNotMatch(handler, /\{\s*\}\s*else if/);
});

test("页内锚点与表达进行中的 hash 变化不会把用户带离当前页面", async () => {
  const source = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf('window.addEventListener("hashchange"'), source.indexOf('window.addEventListener("keydown"'));
  assert.match(handler, /document\.getElementById\(requested\)/);
  assert.match(handler, /arena\.isBusy\(\) \|\| lessons\.isBusy\(\)/);
  assert.match(handler, /history\.replaceState\(null, "", `#\$\{state\.view\}`\)/);
  assert.match(handler, /showToast\(BUSY_NAVIGATION_MESSAGE, "danger"\)/);
});

test("换一题不占用互斥锁：抽题动画期间其他操作仍可响应", async () => {
  const source = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
  assert.match(source, /action === "explore-topics"\) \{(?:\n\s*\/\/[^\n]*)?\n\s*void runTopicDraw\(\)\.catch/);
});
