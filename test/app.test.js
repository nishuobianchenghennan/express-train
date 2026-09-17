import assert from "node:assert/strict";
import { once } from "node:events";
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
    assert.match(body, /2026\.09\.16-3/);
    assert.match(body, /key\.startsWith\(CACHE_PREFIX\).*key !== CACHE_NAME/);
    assert.match(body, /\/js\/data\/card-additions\.js/);
    assert.doesNotMatch(body, /speak-clearly-v1/);
    assert.doesNotMatch(body, /return cached \|\| network/);
    assert.doesNotMatch(body, /cache\.put\("\/index\.html", response\.clone\(\)\)/);
  });
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
