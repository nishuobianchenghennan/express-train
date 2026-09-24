import { TASK_CARDS } from "./data/cards.js";
import { stageMinutes as sessionStageMinutes } from "./core/session.js";

const DB_NAME = "speak-clearly-local";
const DB_VERSION = 1;
const FALLBACK_KEY = "speak-clearly-fallback";
const STAGES = ["preview", "research", "organize", "firstDelivery", "review", "retry", "complete"];
const CURRENT_STAGES = ["preview", "research", "firstDelivery", "review", "retry", "complete"];
const COMPLETION_STATUSES = ["in_progress", "completed", "skipped", "abandoned"];
const MODES = ["full", "quick"];
const SOURCE_KINDS = ["fact", "viewpoint", "counter"];
const MAX_SENSITIVE_SKIPS = 365;
const MAX_SESSIONS = 10_000;
const MAX_SOURCES = 20;
const MAX_STRING_LENGTH = 4_000;
const CARD_MAP = new Map(TASK_CARDS.map((card) => [card.id, card]));

export const DEFAULT_SETTINGS = Object.freeze({
  level: 2,
  defaultMode: "full",
  soundEnabled: true,
  reducedMotion: false,
  keepRecordings: true,
  onboardingComplete: false,
});

let databasePromise;
let databaseHandle;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function localStorageAvailable() {
  return Boolean(globalThis.localStorage);
}

function fallbackRead() {
  if (!localStorageAvailable()) {
    return {};
  }
  try {
    return JSON.parse(globalThis.localStorage.getItem(FALLBACK_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function fallbackWrite(value) {
  if (!localStorageAvailable()) {
    throw new Error("当前浏览器不支持本地数据存储");
  }
  globalThis.localStorage.setItem(FALLBACK_KEY, JSON.stringify(value));
}

function fallbackClear() {
  if (!localStorageAvailable()) {
    return;
  }
  globalThis.localStorage.removeItem(FALLBACK_KEY);
  globalThis.localStorage.removeItem("speak-clearly-appearance");
}

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  if (databasePromise) {
    return databasePromise;
  }

  let promise;
  promise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("kv")) {
        database.createObjectStore("kv");
      }
      if (!database.objectStoreNames.contains("sessions")) {
        const store = database.createObjectStore("sessions", { keyPath: "sessionId" });
        store.createIndex("completedAt", "completedAt");
      }
      if (!database.objectStoreNames.contains("recordings")) {
        database.createObjectStore("recordings", { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (databasePromise !== promise) {
        database.close();
        return;
      }
      databaseHandle = database;
      database.onversionchange = () => {
        database.close();
        if (databaseHandle === database) {
          databaseHandle = null;
          if (databasePromise === promise) {
            databasePromise = null;
          }
        }
      };
      resolve(database);
    };
    request.onerror = () => {
      if (databasePromise === promise) {
        databasePromise = null;
      }
      reject(request.error ?? new Error("无法打开本地数据库"));
    };
    request.onblocked = () => {
      if (databasePromise === promise) {
        databasePromise = null;
      }
      reject(new Error("本地数据库仍被其他页面占用"));
    };
  });
  databasePromise = promise;
  return promise;
}

function runTransaction(database, storeNames, mode, callback) {
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(names, mode);
    } catch (error) {
      reject(error);
      return;
    }
    let result;
    try {
      result = callback(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error("本地数据库事务失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地数据库事务已中止"));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本地数据库读取失败"));
  });
}

async function readKeyFromDatabase(database, key, fallback = null) {
  const value = await runTransaction(database, "kv", "readonly", (transaction) =>
    requestValue(transaction.objectStore("kv").get(key)),
  );
  return value ?? fallback;
}

async function readSessionsFromDatabase(database) {
  return runTransaction(database, "sessions", "readonly", (transaction) =>
    requestValue(transaction.objectStore("sessions").getAll()),
  );
}

async function getKey(key, fallback = null) {
  try {
    const database = await openDatabase();
    return await readKeyFromDatabase(database, key, fallback);
  } catch {
    return fallbackRead()[key] ?? fallback;
  }
}

async function setKey(key, value) {
  let database;
  try {
    database = await openDatabase();
  } catch {
    const data = fallbackRead();
    data[key] = value;
    fallbackWrite(data);
    return;
  }
  await runTransaction(database, "kv", "readwrite", (transaction) => {
    transaction.objectStore("kv").put(value, key);
  });
}

function validDate(value) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isoDate(value, field, { required = false } = {}) {
  if (value == null || value === "") {
    if (required) {
      throw new Error(`导入文件缺少有效的${field}`);
    }
    return null;
  }
  if (!validDate(value)) {
    throw new Error(`导入文件中的${field}无效`);
  }
  return new Date(value).toISOString();
}

function text(value, field, { required = false, max = MAX_STRING_LENGTH } = {}) {
  if (value == null || value === "") {
    if (required) {
      throw new Error(`导入文件缺少${field}`);
    }
    return "";
  }
  if (typeof value !== "string") {
    throw new Error(`导入文件中的${field}必须是文本`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new Error(`导入文件中的${field}过长`);
  }
  if (normalized.includes("\u0000")) {
    throw new Error(`导入文件中的${field}包含不可用字符`);
  }
  return normalized;
}

function localDate(value, field) {
  if (value == null || value === "") {
    return null;
  }
  const normalized = text(value, field, { required: true, max: 10 });
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized ||
    Number(normalized.slice(0, 4)) < 1970
  ) {
    throw new Error(`导入文件中的${field}无效`);
  }
  return normalized;
}

function identifier(value, field) {
  const normalized = text(value, field, { required: true, max: 180 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw new Error(`导入文件中的${field}格式无效`);
  }
  return normalized;
}

function booleanValue(value, field, fallback = false) {
  if (value == null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`导入文件中的${field}必须是布尔值`);
  }
  return value;
}

function finiteNumber(value, field, { min = -Infinity, max = Infinity, integer = false, fallback = 0, required = false } = {}) {
  if (value == null || value === "") {
    if (required) {
      throw new Error(`导入文件中的${field}无效`);
    }
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`导入文件中的${field}无效`);
  }
  return value;
}

function normalizeSettings(value, { allowPartial = false } = {}) {
  if (value == null && allowPartial) {
    return { ...DEFAULT_SETTINGS };
  }
  if (!isPlainObject(value)) {
    throw new Error("导入文件中的设置无效");
  }
  const settings = { ...DEFAULT_SETTINGS };
  if (value.level != null) {
    settings.level = finiteNumber(value.level, "训练等级", { min: 1, max: 5, integer: true });
  }
  if (value.defaultMode != null) {
    if (!MODES.includes(value.defaultMode)) {
      throw new Error("导入文件中的默认训练模式无效");
    }
    settings.defaultMode = value.defaultMode;
  }
  for (const key of ["soundEnabled", "reducedMotion", "keepRecordings", "onboardingComplete"]) {
    settings[key] = booleanValue(value[key], key, settings[key]);
  }
  return settings;
}

function normalizeMap(value, field, allowedKeys, valueNormalizer) {
  if (value == null) {
    return {};
  }
  if (!isPlainObject(value)) {
    throw new Error(`导入文件中的${field}无效`);
  }
  const normalized = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!allowedKeys.has(key)) {
      continue;
    }
    normalized[key] = valueNormalizer(rawValue, `${field}.${key}`);
  }
  return normalized;
}

function normalizeScores(value, field, metricIds) {
  return normalizeMap(value, field, new Set(metricIds), (score, scoreField) =>
    finiteNumber(score, scoreField, { min: 1, max: 5, integer: true, required: true }),
  );
}

function normalizeTimer(value, stageMinutes, stage) {
  if (value == null) {
    return stage && !["preview", "complete"].includes(stage)
      ? { durationSeconds: Math.round((stageMinutes[stage] ?? 0) * 60), elapsedSeconds: 0, runningSince: null, endAt: null }
      : null;
  }
  if (!isPlainObject(value)) {
    throw new Error("导入文件中的计时器无效");
  }
  const runningSince = value.runningSince == null ? null : finiteNumber(value.runningSince, "计时开始时间", { min: 0, integer: true });
  const endAt = value.endAt == null ? null : finiteNumber(value.endAt, "计时结束时间", { min: 0, integer: true });
  const notifiedAt = value.notifiedAt == null ? null : finiteNumber(value.notifiedAt, "计时提示时间", { min: 0, integer: true });
  return {
    durationSeconds: finiteNumber(value.durationSeconds, "阶段时长", { min: 0, max: 86_400, integer: false, fallback: Math.round((stageMinutes[stage] ?? 0) * 60) }),
    elapsedSeconds: finiteNumber(value.elapsedSeconds, "已用时长", { min: 0, max: 86_400, fallback: 0 }),
    runningSince,
    endAt,
    ...(notifiedAt == null ? {} : { notifiedAt }),
  };
}

function normalizeSources(value) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_SOURCES) {
    throw new Error("导入文件中的来源记录无效");
  }
  return value.map((source, index) => {
    if (!isPlainObject(source)) {
      throw new Error(`导入文件中的第 ${index + 1} 条来源无效`);
    }
    const kind = source.kind == null ? "fact" : source.kind;
    if (!SOURCE_KINDS.includes(kind)) {
      throw new Error(`导入文件中的第 ${index + 1} 条来源类型无效`);
    }
    return {
      name: text(source.name, `来源 ${index + 1} 名称`, { max: 500 }),
      url: text(source.url, `来源 ${index + 1} 链接或出版信息`, { max: 1_000 }),
      support: text(source.support, `来源 ${index + 1} 支持内容`, { max: 2_000 }),
      kind,
    };
  });
}

function normalizeCardIds(value, field) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_SENSITIVE_SKIPS) {
    throw new Error(`导入文件中的${field}无效`);
  }
  const normalized = [];
  for (const rawId of value) {
    const cardId = identifier(rawId, field);
    if (CARD_MAP.has(cardId) && !normalized.includes(cardId)) {
      normalized.push(cardId);
    }
  }
  return normalized;
}

function normalizeRecordingReference(value, field, stripRecordings) {
  if (value == null || value === "") {
    return null;
  }
  const normalized = identifier(value, field);
  if (stripRecordings) {
    return null;
  }
  return normalized;
}

function normalizeSession(raw, { active = false, stripRecordings = false } = {}) {
  if (!isPlainObject(raw)) {
    throw new Error("导入文件包含无效训练记录");
  }
  const taskCardId = identifier(raw.taskCardId, "题卡 ID");
  const card = CARD_MAP.get(taskCardId);
  if (!card) {
    throw new Error(`导入文件引用了不存在的题卡：${taskCardId}`);
  }
  const sessionId = identifier(raw.sessionId, "训练记录 ID");
  const completionStatus = raw.completionStatus;
  if (!COMPLETION_STATUSES.includes(completionStatus)) {
    throw new Error(`训练记录 ${sessionId} 的完成状态无效`);
  }
  if (!active && completionStatus === "in_progress") {
    throw new Error("只有当前进行中的训练才能保存在 activeSession 中");
  }
  if (active && !["in_progress", "completed"].includes(completionStatus)) {
    throw new Error("当前训练的完成状态只能是 in_progress 或 completed");
  }
  const mode = raw.mode == null ? "full" : raw.mode;
  if (!MODES.includes(mode)) {
    throw new Error(`训练记录 ${sessionId} 的训练模式无效`);
  }
  const rawStage = raw.stage == null ? (completionStatus === "completed" ? "complete" : "preview") : raw.stage;
  if (!STAGES.includes(rawStage)) {
    throw new Error(`训练记录 ${sessionId} 的训练阶段无效`);
  }
  const stage = rawStage === "organize" ? "research" : rawStage;
  if (completionStatus === "in_progress" && stage === "complete") {
    throw new Error("进行中的训练阶段不能是 complete");
  }
  if (completionStatus === "completed" && stage !== "complete") {
    throw new Error(`已完成训练记录 ${sessionId} 的阶段必须是 complete`);
  }
  const stageIndex = CURRENT_STAGES.indexOf(stage) - 1;
  const startedAt = isoDate(raw.startedAt, "开始时间", { required: true });
  const completedAt = isoDate(raw.completedAt, "完成时间", {
    required: completionStatus === "completed" || (!active && completionStatus !== "in_progress"),
  });
  if (completionStatus === "in_progress" && completedAt) {
    throw new Error("进行中的训练不能包含完成时间");
  }
  if (completedAt && new Date(completedAt).getTime() < new Date(startedAt).getTime()) {
    throw new Error(`训练记录 ${sessionId} 的完成时间不能早于开始时间`);
  }
  const annualPlanDate = localDate(raw.annualPlanDate, "年度计划日期");
  const annualPlanDayNumber = raw.annualPlanDayNumber == null
    ? null
    : finiteNumber(raw.annualPlanDayNumber, "年度计划序号", { min: 1, max: 365, integer: true, required: true });
  if (Boolean(annualPlanDate) !== Boolean(annualPlanDayNumber)) {
    throw new Error(`训练记录 ${sessionId} 的年度计划锚点不完整`);
  }
  const stageMinutes = sessionStageMinutes(card, mode);
  const recordingFirstId = normalizeRecordingReference(raw.recordingFirstId, "首次录音 ID", stripRecordings);
  const recordingRetryId = normalizeRecordingReference(raw.recordingRetryId, "重讲录音 ID", stripRecordings);
  if (raw.recordingUnavailable != null && !isPlainObject(raw.recordingUnavailable)) {
    throw new Error(`训练记录 ${sessionId} 的录音不可用状态无效`);
  }
  const recordingUnavailable = {
    first: booleanValue(raw.recordingUnavailable?.first, "首次录音不可用", false),
    retry: booleanValue(raw.recordingUnavailable?.retry, "重讲录音不可用", false),
  };
  if (stripRecordings && raw.recordingFirstId) {
    recordingUnavailable.first = true;
  }
  if (stripRecordings && raw.recordingRetryId) {
    recordingUnavailable.retry = true;
  }
  if (active && ["review", "retry"].includes(stage) && !recordingFirstId && !recordingUnavailable.first) {
    throw new Error("进行中的训练缺少首次口头完成记录");
  }
  const validNoteKeys = new Set(card.organizingTemplate);
  const userNotes = normalizeMap(raw.userNotes, "整理笔记", validNoteKeys, (value, field) => text(value, field, { max: 2_000 }));
  const researchChecks = normalizeMap(raw.researchChecks, "检索清单", new Set(card.researchPrompts), (value, field) => booleanValue(value, field));
  const helpLevels = normalizeMap(raw.helpLevels, "帮助层级", new Set(STAGES), (value, field) => finiteNumber(value, field, { min: 0, max: 6, integer: true }));
  if (helpLevels.organize != null) {
    helpLevels.research = Math.max(helpLevels.research ?? 0, helpLevels.organize);
    delete helpLevels.organize;
  }
  const stageDurations = normalizeMap(raw.stageDurations, "阶段时长记录", new Set(STAGES), (value, field) => finiteNumber(value, field, { min: 0, max: 86_400 }));
  if (stageDurations.organize != null) {
    stageDurations.research = (stageDurations.research ?? 0) + stageDurations.organize;
    delete stageDurations.organize;
  }
  const extendedStages = normalizeMap(raw.extendedStages, "阶段延期记录", new Set(STAGES), (value, field) => finiteNumber(value, field, { min: 0, max: 86_400 }));
  if (extendedStages.organize != null) {
    extendedStages.research = (extendedStages.research ?? 0) + extendedStages.organize;
    delete extendedStages.organize;
  }
  const normalized = {
    sessionId,
    taskCardId: card.id,
    taskCardVersion: card.version,
    scene: card.scene,
    sceneLabel: card.sceneLabel,
    domain: card.domain,
    domainLabel: card.domainLabel,
    topic: card.topic,
    topicLabel: card.topicLabel,
    title: card.title,
    taskTypes: [...card.taskTypes],
    taskTypeLabels: [...card.taskTypeLabels],
    protocol: card.protocol,
    structureId: card.structureId,
    structureName: card.structureName,
    difficulty: card.difficulty,
    mode,
    selectionReason: text(raw.selectionReason, "抽题原因", { max: 500 }),
    startedAt,
    completedAt,
    completionStatus,
    stage,
    stageIndex,
    stageMinutes,
    stageDurations,
    extendedStages,
    timer: normalizeTimer(raw.timer, stageMinutes, stage),
    researchChecks,
    sources: normalizeSources(raw.sources),
    userNotes,
    recordingFirstId,
    recordingRetryId,
    recordingUnavailable,
    selfScores: normalizeScores(raw.selfScores, "首次评分", card.reviewMetricIds),
    retryScores: normalizeScores(raw.retryScores, "重讲评分", card.reviewMetricIds),
    mainProblem: text(raw.mainProblem, "主要问题", { max: 2_000 }),
    effectiveAction: text(raw.effectiveAction, "有效动作", { max: 2_000 }),
    retryFocus: text(raw.retryFocus, "重讲目标", { max: 2_000 }),
    observableImprovement: raw.observableImprovement == null ? null : booleanValue(raw.observableImprovement, "可观察改善"),
    migrationRecommended: booleanValue(raw.migrationRecommended, "迁移建议"),
    sourceRequirementsMet: booleanValue(raw.sourceRequirementsMet, "来源要求确认"),
    swapUsed: booleanValue(raw.swapUsed, "换题状态"),
    annualPlanDate,
    annualPlanDayNumber,
    sensitiveSkipCount: finiteNumber(raw.sensitiveSkipCount, "敏感任务跳过次数", {
      min: 0,
      max: MAX_SENSITIVE_SKIPS,
      integer: true,
    }),
    sensitiveSkippedCardIds: normalizeCardIds(raw.sensitiveSkippedCardIds, "敏感任务跳过题卡"),
    feedbackRevealed: booleanValue(raw.feedbackRevealed, "反馈开放状态"),
    retryCompletedWithoutRecording: booleanValue(raw.retryCompletedWithoutRecording, "无录音重讲状态") || Boolean(stripRecordings && raw.recordingRetryId),
    notesUpdatedAt: isoDate(raw.notesUpdatedAt, "笔记更新时间"),
  };
  if (raw.skipReason) {
    normalized.skipReason = text(raw.skipReason, "中断或换题原因", { max: 2_000 });
  }
  if (raw.recordingRetention) {
    const allowed = ["discarded_by_setting", "discarded_incomplete", "excluded_from_export", "excluded_from_import"];
    if (!allowed.includes(raw.recordingRetention)) {
      throw new Error(`训练记录 ${sessionId} 的录音保留状态无效`);
    }
    normalized.recordingRetention = raw.recordingRetention;
  } else if (stripRecordings && (raw.recordingFirstId || raw.recordingRetryId)) {
    normalized.recordingRetention = "excluded_from_import";
  }
  return normalized;
}

function normalizeStoredSession(raw, active = false) {
  try {
    return normalizeSession(raw, { active, stripRecordings: false });
  } catch {
    return null;
  }
}

function normalizeImportDocument(data) {
  if (!isPlainObject(data) || data.format !== "speak-clearly-export" || data.version !== 1 || !Array.isArray(data.sessions)) {
    throw new Error("这不是受支持的讲明白数据文件");
  }
  if (data.sessions.length > MAX_SESSIONS) {
    throw new Error("导入文件包含过多训练记录");
  }
  const sessions = data.sessions.map((session) => normalizeSession(session, { stripRecordings: true }));
  const ids = new Set();
  for (const session of sessions) {
    if (ids.has(session.sessionId)) {
      throw new Error(`导入文件包含重复训练记录：${session.sessionId}`);
    }
    ids.add(session.sessionId);
  }
  if (data.activeSession?.recordingFirstId || data.activeSession?.recordingRetryId) {
    throw new Error("进行中的录音不会包含在 JSON 中，请先在原设备完成或结束当前训练");
  }
  const activeSession = data.activeSession == null ? null : normalizeSession(data.activeSession, { active: true, stripRecordings: true });
  if (activeSession) {
    const duplicate = sessions.find((session) => session.sessionId === activeSession.sessionId);
    if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(activeSession)) {
      throw new Error("导入文件中的当前进度与同 ID 历史记录冲突");
    }
  }
  if (data.favorites != null && !Array.isArray(data.favorites)) {
    throw new Error("导入文件中的收藏列表无效");
  }
  const favorites = [...new Set((data.favorites ?? []).map((id) => identifier(id, "收藏题卡 ID")))];
  for (const id of favorites) {
    if (!CARD_MAP.has(id)) {
      throw new Error(`导入文件收藏了不存在的题卡：${id}`);
    }
  }
  return {
    settings: normalizeSettings(data.settings ?? {}, { allowPartial: true }),
    sessions,
    activeSession,
    favorites,
  };
}

async function readCurrentSnapshot() {
  let database;
  try {
    database = await openDatabase();
  } catch {
    const fallback = fallbackRead();
    return {
      backend: "fallback",
      settings: fallback.settings ?? null,
      sessions: Array.isArray(fallback.sessions) ? fallback.sessions : [],
      activeSession: fallback.activeSession ?? null,
      favorites: Array.isArray(fallback.favorites) ? fallback.favorites : [],
    };
  }
  return {
    backend: "indexeddb",
    ...(await runTransaction(database, ["kv", "sessions"], "readonly", (transaction) => {
      const kv = transaction.objectStore("kv");
      const sessions = transaction.objectStore("sessions");
      const result = {};
      const settingsRequest = kv.get("settings");
      const activeRequest = kv.get("activeSession");
      const favoritesRequest = kv.get("favorites");
      const sessionsRequest = sessions.getAll();
      settingsRequest.onsuccess = () => { result.settings = settingsRequest.result ?? null; };
      activeRequest.onsuccess = () => { result.activeSession = activeRequest.result ?? null; };
      favoritesRequest.onsuccess = () => { result.favorites = favoritesRequest.result ?? []; };
      sessionsRequest.onsuccess = () => { result.sessions = sessionsRequest.result ?? []; };
      return result;
    })),
  };
}

function preserveLocalRecordingReferences(existing, imported) {
  if (!existing || existing.sessionId !== imported.sessionId) {
    return imported;
  }
  const next = {
    ...imported,
    recordingFirstId: existing.recordingFirstId ?? imported.recordingFirstId,
    recordingRetryId: existing.recordingRetryId ?? imported.recordingRetryId,
    recordingUnavailable: {
      ...imported.recordingUnavailable,
      first: existing.recordingFirstId ? false : imported.recordingUnavailable?.first,
      retry: existing.recordingRetryId ? false : imported.recordingUnavailable?.retry,
    },
    retryCompletedWithoutRecording: existing.recordingRetryId
      ? false
      : imported.retryCompletedWithoutRecording,
  };
  if ((existing.recordingFirstId || existing.recordingRetryId) && /^excluded_from_/.test(next.recordingRetention ?? "")) {
    delete next.recordingRetention;
  }
  return next;
}

function mergeSessions(existing, imported) {
  const merged = new Map();
  for (const session of existing) {
    const normalized = normalizeStoredSession(session, false);
    if (normalized) {
      merged.set(normalized.sessionId, normalized);
    }
  }
  for (const session of imported) {
    merged.set(session.sessionId, preserveLocalRecordingReferences(merged.get(session.sessionId), session));
  }
  return [...merged.values()]
    .sort((left, right) => new Date(left.completedAt ?? left.startedAt).getTime() - new Date(right.completedAt ?? right.startedAt).getTime())
    .slice(-MAX_SESSIONS);
}

async function commitImport(snapshot, data) {
  const existingActive = snapshot.activeSession ? normalizeStoredSession(snapshot.activeSession, true) : null;
  if (
    existingActive?.completionStatus === "in_progress" &&
    data.activeSession?.sessionId !== existingActive.sessionId
  ) {
    throw new Error("当前设备还有进行中的训练，请先完成或结束后再导入其他进度");
  }
  const sessions = mergeSessions(snapshot.sessions, data.sessions);
  const activeSession = data.activeSession
    ? preserveLocalRecordingReferences(existingActive, data.activeSession)
    : null;
  if (snapshot.backend === "fallback") {
    const current = fallbackRead();
    fallbackWrite({
      ...current,
      settings: data.settings,
      sessions,
      activeSession,
      favorites: data.favorites,
    });
    return;
  }
  const database = await openDatabase();
  await runTransaction(database, ["kv", "sessions"], "readwrite", (transaction) => {
    const kv = transaction.objectStore("kv");
    const sessionStore = transaction.objectStore("sessions");
    sessionStore.clear();
    for (const session of sessions) {
      sessionStore.put(session);
    }
    kv.put(data.settings, "settings");
    kv.put(data.favorites, "favorites");
    kv.put(activeSession, "activeSession");
  });
}

export async function loadSettings() {
  try {
    return normalizeSettings(await getKey("settings", {}), { allowPartial: true });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings({ ...DEFAULT_SETTINGS, ...settings }, { allowPartial: true });
  await setKey("settings", normalized);
  try {
    globalThis.localStorage?.setItem("speak-clearly-appearance", JSON.stringify({ reducedMotion: normalized.reducedMotion }));
  } catch {
    // Appearance is a best-effort pre-paint hint; the durable setting is already stored.
  }
}

export async function loadFavorites() {
  const value = await getKey("favorites", []);
  return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string" && CARD_MAP.has(id)) : []);
}

export async function saveFavorites(favorites) {
  const values = [...new Set([...favorites].filter((id) => typeof id === "string" && CARD_MAP.has(id)))];
  await setKey("favorites", values);
}

export async function loadActiveSession() {
  const value = await getKey("activeSession", null);
  return value ? normalizeStoredSession(value, true) : null;
}

export async function saveActiveSession(session) {
  await setKey("activeSession", session);
}

export async function clearActiveSession() {
  await setKey("activeSession", null);
}

export async function loadSessions() {
  try {
    const database = await openDatabase();
    const sessions = await readSessionsFromDatabase(database);
    return sessions.map((session) => normalizeStoredSession(session)).filter(Boolean);
  } catch {
    return fallbackRead().sessions?.map((session) => normalizeStoredSession(session)).filter(Boolean) ?? [];
  }
}

export async function saveSession(session) {
  let database;
  try {
    database = await openDatabase();
  } catch {
    const data = fallbackRead();
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const index = sessions.findIndex((item) => item.sessionId === session.sessionId);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    data.sessions = sessions.slice(-MAX_SESSIONS);
    fallbackWrite(data);
    return;
  }
  await runTransaction(database, "sessions", "readwrite", (transaction) => {
    transaction.objectStore("sessions").put(session);
  });
}

export async function saveCompletedSession(session) {
  let database;
  try {
    database = await openDatabase();
  } catch {
    const data = fallbackRead();
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const index = sessions.findIndex((item) => item.sessionId === session.sessionId);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    data.sessions = sessions.slice(-MAX_SESSIONS);
    data.activeSession = session;
    fallbackWrite(data);
    return;
  }
  await runTransaction(database, ["sessions", "kv"], "readwrite", (transaction) => {
    transaction.objectStore("sessions").put(session);
    transaction.objectStore("kv").put(session, "activeSession");
  });
}

export async function saveRecording(id, blob) {
  if (!id || !(blob instanceof Blob)) {
    throw new Error("无效的录音数据");
  }
  const database = await openDatabase();
  await runTransaction(database, "recordings", "readwrite", (transaction) =>
    transaction.objectStore("recordings").put({ id, blob, createdAt: new Date().toISOString(), size: blob.size, type: blob.type }),
  );
  return id;
}

export async function replaceActiveSessionRecording({ session, slot, recordingId, blob }) {
  if (!session?.sessionId || !["first", "retry"].includes(slot) || !recordingId || !(blob instanceof Blob)) {
    throw new Error("无效的录音保存请求");
  }
  const referenceKey = slot === "first" ? "recordingFirstId" : "recordingRetryId";
  const database = await openDatabase();
  const nextSession = {
    ...session,
    [referenceKey]: recordingId,
    recordingUnavailable: { ...session.recordingUnavailable, [slot]: false },
  };
  let lifecycleError = null;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(["kv", "recordings"], "readwrite");
    const kv = transaction.objectStore("kv");
    const recordings = transaction.objectStore("recordings");
    const request = kv.get("activeSession");
    request.onsuccess = () => {
      const storedSession = request.result;
      if (storedSession?.sessionId !== session.sessionId) {
        lifecycleError = new Error("当前训练已变化，录音未保存");
        transaction.abort();
        return;
      }
      const previousId = storedSession[referenceKey];
      recordings.put({
        id: recordingId,
        blob,
        createdAt: new Date().toISOString(),
        size: blob.size,
        type: blob.type,
      });
      if (previousId && previousId !== recordingId) {
        recordings.delete(previousId);
      }
      kv.put(nextSession, "activeSession");
    };
    request.onerror = () => {
      lifecycleError = request.error ?? new Error("无法核对当前训练状态");
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(lifecycleError ?? transaction.error ?? new Error("录音保存事务失败"));
    transaction.onabort = () => reject(lifecycleError ?? transaction.error ?? new Error("录音保存事务已中止"));
  });
  return nextSession;
}

export async function archiveSessionWithoutRecordings(session, { clearActive = false, retention = "discarded_incomplete" } = {}) {
  const stripped = {
    ...session,
    recordingFirstId: null,
    recordingRetryId: null,
    recordingRetention: retention,
  };
  let database;
  try {
    database = await openDatabase();
  } catch {
    const data = fallbackRead();
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const index = sessions.findIndex((item) => item.sessionId === stripped.sessionId);
    if (index >= 0) {
      sessions[index] = stripped;
    } else {
      sessions.push(stripped);
    }
    data.sessions = sessions.slice(-MAX_SESSIONS);
    if (clearActive && data.activeSession?.sessionId === stripped.sessionId) {
      data.activeSession = null;
    }
    fallbackWrite(data);
    return stripped;
  }
  await runTransaction(database, ["sessions", "recordings", "kv"], "readwrite", (transaction) => {
    transaction.objectStore("sessions").put(stripped);
    const recordings = transaction.objectStore("recordings");
    if (session.recordingFirstId) {
      recordings.delete(session.recordingFirstId);
    }
    if (session.recordingRetryId) {
      recordings.delete(session.recordingRetryId);
    }
    if (clearActive) {
      const kv = transaction.objectStore("kv");
      const activeRequest = kv.get("activeSession");
      activeRequest.onsuccess = () => {
        if (activeRequest.result?.sessionId === stripped.sessionId) {
          kv.put(null, "activeSession");
        }
      };
    }
  });
  return stripped;
}

export async function loadRecording(id) {
  if (!id || id === "unavailable") {
    return null;
  }
  try {
    const database = await openDatabase();
    return await runTransaction(database, "recordings", "readonly", (transaction) =>
      requestValue(transaction.objectStore("recordings").get(id)),
    );
  } catch {
    return null;
  }
}

export async function deleteRecording(id) {
  if (!id) {
    return;
  }
  const database = await openDatabase();
  await runTransaction(database, "recordings", "readwrite", (transaction) => {
    transaction.objectStore("recordings").delete(id);
  });
}

export async function storageSummary() {
  const sessions = await loadSessions();
  let recordingCount = 0;
  let recordingBytes = 0;
  try {
    const database = await openDatabase();
    const records = await runTransaction(database, "recordings", "readonly", (transaction) =>
      requestValue(transaction.objectStore("recordings").getAll()),
    );
    recordingCount = records.length;
    recordingBytes = records.reduce((sum, item) => sum + (item.size ?? item.blob?.size ?? 0), 0);
  } catch {
    // Metadata remains available even if recording storage cannot be inspected.
  }
  return { sessionCount: sessions.length, recordingCount, recordingBytes };
}

function sanitizeSessionForExport(session) {
  if (!session) {
    return null;
  }
  const copy = structuredClone(session);
  copy.recordingFirstId = null;
  copy.recordingRetryId = null;
  copy.recordingUnavailable = {
    ...copy.recordingUnavailable,
    first: Boolean(copy.recordingUnavailable?.first || session.recordingFirstId),
    retry: Boolean(copy.recordingUnavailable?.retry || session.recordingRetryId),
  };
  copy.retryCompletedWithoutRecording = Boolean(copy.retryCompletedWithoutRecording || session.recordingRetryId);
  if (session.recordingFirstId || session.recordingRetryId) {
    copy.recordingRetention = "excluded_from_export";
  }
  return copy;
}

export async function exportLocalData() {
  const [settings, sessions, activeSession, favorites] = await Promise.all([
    loadSettings(),
    loadSessions(),
    loadActiveSession(),
    loadFavorites(),
  ]);
  const activeHasRecording = Boolean(activeSession?.recordingFirstId || activeSession?.recordingRetryId);
  return {
    format: "speak-clearly-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: activeHasRecording
      ? "录音文件和含录音引用的进行中进度因体积和隐私原因未包含在 JSON 导出中；已完成记录保留文字数据。"
      : "录音文件因体积和隐私原因未包含在 JSON 导出中。",
    settings,
    sessions: sessions.map(sanitizeSessionForExport),
    activeSession: activeHasRecording ? null : sanitizeSessionForExport(activeSession),
    favorites: [...favorites],
  };
}

export async function importLocalData(data) {
  const normalized = normalizeImportDocument(data);
  const snapshot = await readCurrentSnapshot();
  await commitImport(snapshot, normalized);
}

export async function clearAllData() {
  let databaseError = null;
  try {
    if (databaseHandle) {
      databaseHandle.close();
      databaseHandle = null;
    } else if (databasePromise) {
      const database = await databasePromise.catch(() => null);
      database?.close();
    }
    databasePromise = null;
    if (globalThis.indexedDB) {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("无法删除本地数据库"));
        request.onblocked = () => reject(new Error("数据库仍被其他页面占用，请关闭其他应用页面后重试"));
      });
    }
  } catch (error) {
    databaseError = error;
  } finally {
    databasePromise = null;
    databaseHandle = null;
    try {
      fallbackClear();
    } catch (error) {
      databaseError ??= error;
    }
  }
  if (databaseError) {
    throw databaseError;
  }
}

export const __storageTestables = Object.freeze({
  normalizeImportDocument,
  normalizeSession,
  sanitizeSessionForExport,
});
