import assert from "node:assert/strict";
import test from "node:test";

import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

import { TASK_CARDS } from "../public/js/data/cards.js";
import { createSession } from "../public/js/core/session.js";

const FALLBACK_KEY = "speak-clearly-fallback";
let moduleSequence = 0;

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
    this.setCount = 0;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.setCount += 1;
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function installEnvironment(t, { indexedDB, localStorage = new MemoryStorage() } = {}) {
  const previousIndexedDB = globalThis.indexedDB;
  const previousLocalStorage = globalThis.localStorage;
  if (indexedDB) {
    globalThis.indexedDB = indexedDB;
  } else {
    delete globalThis.indexedDB;
  }
  globalThis.localStorage = localStorage;
  t.after(() => {
    if (previousIndexedDB === undefined) {
      delete globalThis.indexedDB;
    } else {
      globalThis.indexedDB = previousIndexedDB;
    }
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previousLocalStorage;
    }
  });
  return localStorage;
}

async function freshStorageModule() {
  moduleSequence += 1;
  return import(`../public/js/storage.js?storage-test=${moduleSequence}`);
}

function completedSession(sessionId, card = TASK_CARDS[0]) {
  return {
    ...createSession(card, { mode: "full" }),
    sessionId,
    startedAt: "2026-09-15T08:00:00.000Z",
    completedAt: "2026-09-15T08:30:00.000Z",
    completionStatus: "completed",
    stage: "complete",
    stageIndex: 5,
    recordingUnavailable: { first: false, retry: false },
  };
}

function activeSession(sessionId, card = TASK_CARDS[1]) {
  return {
    ...createSession(card, { mode: "full" }),
    sessionId,
    startedAt: "2026-09-16T08:00:00.000Z",
  };
}

function importDocument(overrides = {}) {
  return {
    format: "speak-clearly-export",
    version: 1,
    exportedAt: "2026-09-16T09:00:00.000Z",
    settings: { level: 3, defaultMode: "quick" },
    sessions: [],
    activeSession: null,
    favorites: [],
    ...overrides,
  };
}

function openDatabase(indexedDB, name = "speak-clearly-local", version = 1) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteDatabase(indexedDB, name = "speak-clearly-local") {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

test("storage import, completion, archival and clearing remain atomic", async (t) => {
  await t.test("invalid fallback imports do not write and valid imports preserve local recording references", async (t) => {
    const existingHistory = {
      ...completedSession("history-local"),
      recordingFirstId: "recording-history-first",
      recordingRetryId: "recording-history-retry",
    };
    const existingActive = {
      ...activeSession("active-local"),
      recordingFirstId: "recording-active-first",
    };
    const localStorage = installEnvironment(t, {
      localStorage: new MemoryStorage({
        [FALLBACK_KEY]: JSON.stringify({
          settings: { level: 2 },
          sessions: [existingHistory],
          activeSession: existingActive,
          favorites: [],
        }),
      }),
    });
    const storage = await freshStorageModule();

    await assert.rejects(() => storage.importLocalData({ format: "wrong", version: 1, sessions: [] }), /受支持/);
    assert.equal(localStorage.setCount, 0);

    const importedHistory = {
      ...completedSession("history-local"),
      recordingUnavailable: { first: true, retry: true },
      recordingRetention: "excluded_from_export",
    };
    const importedActive = {
      ...activeSession("active-local"),
      recordingUnavailable: { first: true, retry: false },
    };
    await storage.importLocalData(importDocument({
      sessions: [importedHistory],
      activeSession: importedActive,
      favorites: [TASK_CARDS[2].id],
    }));

    assert.equal(localStorage.setCount, 1);
    const sessions = await storage.loadSessions();
    const active = await storage.loadActiveSession();
    assert.equal(sessions[0].recordingFirstId, "recording-history-first");
    assert.equal(sessions[0].recordingRetryId, "recording-history-retry");
    assert.equal(sessions[0].recordingRetention, undefined);
    assert.equal(active.recordingFirstId, "recording-active-first");
    assert.equal(active.recordingUnavailable.first, false);
  });

  await t.test("IndexedDB import rollback leaves the previous snapshot intact", async (t) => {
    const indexedDB = new IDBFactory();
    installEnvironment(t, { indexedDB });
    const storage = await freshStorageModule();
    const existing = completedSession("existing-history");
    const active = activeSession("existing-active");
    await storage.saveSettings({ ...storage.DEFAULT_SETTINGS, level: 2 });
    await storage.saveFavorites(new Set([TASK_CARDS[3].id]));
    await storage.saveSession(existing);
    await storage.saveActiveSession(active);

    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(value, key) {
      if (this.name === "kv" && key === "favorites") {
        throw new Error("forced import failure");
      }
      return originalPut.call(this, value, key);
    };
    try {
      await assert.rejects(
        () => storage.importLocalData(importDocument({
          sessions: [completedSession("imported-history")],
          activeSession: active,
        })),
        /forced import failure/,
      );
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }

    assert.deepEqual((await storage.loadSessions()).map((session) => session.sessionId), ["existing-history"]);
    assert.equal((await storage.loadActiveSession()).sessionId, "existing-active");
    assert.equal((await storage.loadSettings()).level, 2);
    assert.deepEqual([...await storage.loadFavorites()], [TASK_CARDS[3].id]);
  });

  await t.test("annual-plan anchors survive active-session normalization", async (t) => {
    const indexedDB = new IDBFactory();
    installEnvironment(t, { indexedDB });
    const storage = await freshStorageModule();
    const active = {
      ...activeSession("annual-active"),
      annualPlanDate: "2028-02-29",
      annualPlanDayNumber: 59,
    };

    await storage.saveActiveSession(active);

    const restored = await storage.loadActiveSession();
    assert.equal(restored.annualPlanDate, "2028-02-29");
    assert.equal(restored.annualPlanDayNumber, 59);
    await assert.rejects(
      () => storage.importLocalData(importDocument({
        activeSession: { ...active, annualPlanDayNumber: null },
      })),
      /年度计划锚点不完整/,
    );
  });

  await t.test("completed history and active-session state commit or roll back together", async (t) => {
    const indexedDB = new IDBFactory();
    installEnvironment(t, { indexedDB });
    const storage = await freshStorageModule();
    const previousActive = activeSession("previous-active");
    const completed = completedSession("new-completed");
    await storage.saveActiveSession(previousActive);

    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(value, key) {
      if (this.name === "kv" && key === "activeSession") {
        throw new Error("forced completion failure");
      }
      return originalPut.call(this, value, key);
    };
    try {
      await assert.rejects(() => storage.saveCompletedSession(completed), /forced completion failure/);
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
    assert.deepEqual(await storage.loadSessions(), []);
    assert.equal((await storage.loadActiveSession()).sessionId, "previous-active");

    await storage.saveCompletedSession(completed);
    assert.deepEqual((await storage.loadSessions()).map((session) => session.sessionId), ["new-completed"]);
    assert.equal((await storage.loadActiveSession()).sessionId, "new-completed");
  });

  await t.test("archiving an old session does not clear a newer active session", async (t) => {
    const indexedDB = new IDBFactory();
    installEnvironment(t, { indexedDB });
    const storage = await freshStorageModule();
    const archived = {
      ...completedSession("archive-me"),
      recordingFirstId: "archive-first",
      recordingRetryId: "archive-retry",
    };
    const newerActive = activeSession("keep-active");
    await storage.saveSession(archived);
    await storage.saveActiveSession(newerActive);

    await storage.archiveSessionWithoutRecordings(archived, { clearActive: true });

    assert.equal((await storage.loadActiveSession()).sessionId, "keep-active");
    const stored = (await storage.loadSessions()).find((session) => session.sessionId === "archive-me");
    assert.equal(stored.recordingFirstId, null);
    assert.equal(stored.recordingRetryId, null);
  });

  await t.test("clear removes both backends and reports a blocked IndexedDB deletion", async (t) => {
    const indexedDB = new IDBFactory();
    const localStorage = installEnvironment(t, {
      indexedDB,
      localStorage: new MemoryStorage({
        [FALLBACK_KEY]: JSON.stringify({ sessions: [completedSession("fallback-history")] }),
        "speak-clearly-appearance": JSON.stringify({ reducedMotion: true }),
      }),
    });
    const storage = await freshStorageModule();
    await storage.saveSession(completedSession("database-history"));
    await storage.clearAllData();

    assert.equal(localStorage.getItem(FALLBACK_KEY), null);
    assert.equal(localStorage.getItem("speak-clearly-appearance"), null);
    assert.deepEqual(await storage.loadSessions(), []);
    assert.equal(await storage.loadActiveSession(), null);

    await storage.saveSession(completedSession("blocked-history"));
    localStorage.setItem(FALLBACK_KEY, JSON.stringify({ sessions: [completedSession("fallback-again")] }));
    const blocker = await openDatabase(indexedDB);
    try {
      await assert.rejects(() => storage.clearAllData(), /占用/);
      assert.equal(localStorage.getItem(FALLBACK_KEY), null);
    } finally {
      blocker.close();
    }
  });
  await t.test("version changes close and invalidate the cached database handle", async (t) => {
    const indexedDB = new IDBFactory();
    installEnvironment(t, { indexedDB });
    const storage = await freshStorageModule();

    await storage.saveSession(completedSession("before-version-change"));
    await deleteDatabase(indexedDB);
    await storage.saveSession(completedSession("after-version-change"));

    assert.deepEqual((await storage.loadSessions()).map((session) => session.sessionId), ["after-version-change"]);
  });

  await t.test("session normalization enforces status and completion-time invariants", async (t) => {
    installEnvironment(t);
    const storage = await freshStorageModule();
    const normalize = storage.__storageTestables.normalizeSession;
    const active = activeSession("active-in-progress");
    const completed = completedSession("active-completed");

    assert.throws(
      () => normalize({ ...active, completionStatus: "skipped", stage: "complete", completedAt: "2026-09-16T08:30:00.000Z" }, { active: true }),
      /只能是 in_progress 或 completed/,
    );
    assert.throws(
      () => normalize({ ...active, stage: "complete" }, { active: true }),
      /阶段不能是 complete/,
    );
    assert.throws(
      () => normalize({ ...active, completedAt: "2026-09-16T08:30:00.000Z" }, { active: true }),
      /不能包含完成时间/,
    );
    assert.throws(
      () => normalize({ ...completed, completedAt: null }, { active: true }),
      /完成时间/,
    );
    assert.throws(
      () => normalize({ ...completed, completedAt: "2026-09-15T07:59:59.999Z" }, { active: true }),
      /不能早于开始时间/,
    );
    assert.throws(
      () => normalize({ ...completed, completedAt: null }),
      /完成时间/,
    );
    assert.throws(
      () => normalize({ ...active, completionStatus: "skipped", completedAt: null }),
      /完成时间/,
    );

    const normalizedCompleted = normalize(completed, { active: true });
    assert.equal(normalizedCompleted.completionStatus, "completed");
    assert.equal(normalizedCompleted.stage, "complete");

    await assert.rejects(
      () => storage.importLocalData(importDocument({
        activeSession: { ...active, completionStatus: "abandoned" },
      })),
      /只能是 in_progress 或 completed/,
    );
    await storage.importLocalData(importDocument({ activeSession: completed }));
    assert.equal((await storage.loadActiveSession()).completionStatus, "completed");
  });
  await t.test("legacy organize progress migrates into the combined learning stage", async (t) => {
    installEnvironment(t);
    const storage = await freshStorageModule();
    const card = TASK_CARDS.find((item) => item.id === "VID-002");
    const active = {
      ...activeSession("legacy-organize", card),
      stage: "organize",
      stageIndex: 1,
      stageDurations: { research: 120, organize: 90 },
      extendedStages: { organize: 60 },
      researchChecks: Object.fromEntries(card.researchPrompts.map((prompt) => [prompt, true])),
      userNotes: Object.fromEntries(card.organizingTemplate.slice(0, 3).map((key) => [key, "legacy note"])),
    };
    await storage.saveActiveSession(active);
    const restored = await storage.loadActiveSession();
    assert.equal(restored.stage, "research");
    assert.equal(restored.stageIndex, 0);
    assert.equal(restored.stageDurations.research, 210);
    assert.equal(restored.extendedStages.research, 60);
    assert.equal(restored.userNotes[card.organizingTemplate[0]], "legacy note");
  });

  await t.test("fallback archival retains only the newest MAX_SESSIONS records", async (t) => {
    const sessions = Array.from({ length: 10_000 }, (_, index) => ({ sessionId: `old-${index}` }));
    const localStorage = installEnvironment(t, {
      localStorage: new MemoryStorage({ [FALLBACK_KEY]: JSON.stringify({ sessions }) }),
    });
    const storage = await freshStorageModule();

    await storage.archiveSessionWithoutRecordings({ sessionId: "newest" });

    const saved = JSON.parse(localStorage.getItem(FALLBACK_KEY));
    assert.equal(saved.sessions.length, 10_000);
    assert.equal(saved.sessions[0].sessionId, "old-1");
    assert.equal(saved.sessions.at(-1).sessionId, "newest");
  });
});
