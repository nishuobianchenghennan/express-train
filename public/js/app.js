import { CARD_BANK_VERSION, DOMAINS, METRICS, PROTOCOLS, SCENES, STRUCTURES, TASK_CARDS, TASK_TYPES } from "./data/cards.js";
import { icon } from "./icons.js";
import {
  annualPlanAlternative,
  annualPlanEntryForDate,
  createAnnualPlan,
  selectTask,
} from "./core/selection.js";
import {
  advanceStage,
  buildRuleFeedback,
  createSession,
  currentElapsed,
  extendTimer,
  orderedStages,
  previousPreparationStage,
  stageLabel,
  startTraining,
  timerRemaining,
  toggleTimer,
  totalEstimatedMinutes,
  validateStage,
} from "./core/session.js";
import { calculateStats, filterHistory } from "./core/stats.js";
import {
  archiveSessionWithoutRecordings,
  clearActiveSession,
  clearAllData,
  DEFAULT_SETTINGS,
  exportLocalData,
  importLocalData,
  loadActiveSession,
  loadFavorites,
  loadRecording,
  loadSessions,
  loadSettings,
  replaceActiveSessionRecording,
  saveActiveSession as writeActiveSession,
  saveCompletedSession,
  saveFavorites,
  saveSettings,
  storageSummary,
} from "./storage.js";

const root = document.querySelector("#app");
const cardMap = new Map(TASK_CARDS.map((card) => [card.id, card]));
const validViews = new Set(["home", "library", "history", "ability", "settings", "train"]);
const validCompletionStatuses = new Set(["completed", "skipped", "abandoned"]);
const generalMetricIds = Object.entries(METRICS)
  .filter(([, metric]) => metric.general)
  .map(([id]) => id);
const ANNUAL_PLAN_SEED = 42;
const annualPlanCache = new Map();
const sensitiveFlagLabels = Object.freeze({
  finance: "财务与金钱",
  health: "健康信息",
  mental_health: "情绪与心理支持",
});
const exclusiveActions = new Set([
  "setting-mode",
  "onboarding-mode",
  "start-home",
  "start-training",
  "skip-sensitive-task",
  "confirm-swap",
  "confirm-abandon",
  "advance-stage",
  "start-recording",
  "finish-session",
  "close-complete",
  "toggle-favorite",
  "start-card",
  "start-focus",
  "export-data",
  "install-app",
  "confirm-clear-data",
  "complete-onboarding",
]);

const state = {
  settings: { ...DEFAULT_SETTINGS },
  sessions: [],
  favorites: new Set(),
  activeSession: null,
  view: "home",
  homeMode: "full",
  homeScene: "",
  libraryFilters: { query: "", scene: "", domain: "", difficulty: "", favorites: "" },
  historyFilters: {
    query: "",
    scene: "",
    domain: "",
    taskType: "",
    structureId: "",
    difficulty: "",
    retry: "",
    problem: "",
    migration: "",
    completionStatus: "",
  },
  storage: { sessionCount: 0, recordingCount: 0, recordingBytes: 0 },
  modal: null,
  modalOpener: null,
  pendingFocus: null,
  pendingAnnouncement: "",
  installPrompt: null,
  recordingRuntime: null,
  audioUrls: [],
  renderVersion: 0,
  saveStatus: "saved",
};

let saveTimer;
let pendingActiveSave = null;
let activeSaveTail = Promise.resolve();
let saveRevision = 0;
let actionInFlight = false;
let clockTimer;
let toastTimer;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value, options = { month: "short", day: "numeric" }) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知日期";
  }
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function formatDateTime(value) {
  return formatDate(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function annualPlanForDate(value = new Date()) {
  const year = Number(dateKey(value).slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new Error("年度计划日期无效");
  }
  if (!annualPlanCache.has(year)) {
    annualPlanCache.set(year, createAnnualPlan(TASK_CARDS, { year, seed: ANNUAL_PLAN_SEED }));
  }
  return annualPlanCache.get(year);
}

function annualEntryForDate(value = new Date()) {
  return annualPlanEntryForDate(annualPlanForDate(value), value);
}

function cardIsSensitive(card) {
  return Boolean(card?.sensitiveFlags?.length);
}

function sensitiveFlagText(card) {
  return (card?.sensitiveFlags ?? [])
    .map((flag) => sensitiveFlagLabels[flag] ?? flag)
    .join("、");
}

function formatDuration(seconds = 0) {
  const absolute = Math.max(0, Math.round(Math.abs(seconds)));
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function plural(value, unit) {
  return `${value} ${unit}`;
}

function selected(value, expected) {
  return value === expected ? " selected" : "";
}

function checked(value) {
  return value ? " checked" : "";
}

function safeToken(value, registry) {
  return registry[value] ? value : "unknown";
}

function safeCompletionStatus(value) {
  return validCompletionStatuses.has(value) ? value : "abandoned";
}

function saveStateMarkup() {
  if (state.saveStatus === "saving") {
    return `${icon("clock")}正在保存`;
  }
  if (state.saveStatus === "error") {
    return `${icon("alert")}保存失败`;
  }
  return `${icon("check")}进度已保存`;
}

function setSaveStatus(status) {
  state.saveStatus = status;
  const indicator = root.querySelector(".save-state");
  if (indicator) {
    indicator.classList.toggle("is-error", status === "error");
    indicator.innerHTML = saveStateMarkup();
  }
}

function queueActiveSave(session, { reportFailure = false } = {}) {
  const snapshot = structuredClone(session);
  const revision = ++saveRevision;
  setSaveStatus("saving");
  const operation = activeSaveTail.then(() => writeActiveSession(snapshot));
  activeSaveTail = operation.catch(() => {});
  operation.then(
    () => {
      if (revision === saveRevision) {
        setSaveStatus("saved");
      }
    },
    () => {
      if (revision === saveRevision) {
        setSaveStatus("error");
      }
      if (reportFailure) {
        showToast("本地进度保存失败，请先不要关闭页面。", "danger");
      }
    },
  );
  return operation;
}

function cancelScheduledActiveSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  pendingActiveSave = null;
}

function flushScheduledActiveSave(options = {}) {
  clearTimeout(saveTimer);
  saveTimer = null;
  const pending = pendingActiveSave;
  pendingActiveSave = null;
  if (pending) {
    return queueActiveSave(pending, options);
  }
  if (state.activeSession && state.saveStatus === "error") {
    return queueActiveSave(state.activeSession, options);
  }
  return activeSaveTail;
}

function saveActiveNow(session) {
  cancelScheduledActiveSave();
  return queueActiveSave(session);
}

function describeControl(element) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  return {
    action: element.dataset.action ?? "",
    view: element.dataset.view ?? "",
    value: element.dataset.value ?? "",
    cardId: element.dataset.cardId ?? "",
    sessionId: element.dataset.sessionId ?? "",
    slot: element.dataset.slot ?? "",
    text: element.textContent?.trim().slice(0, 80) ?? "",
  };
}

function findDescribedControl(descriptor) {
  if (!descriptor) {
    return null;
  }
  const candidates = [...root.querySelectorAll("[data-action]")].filter((element) =>
    ["action", "view", "value", "cardId", "sessionId", "slot"].every((key) =>
      !descriptor[key] || element.dataset[key] === descriptor[key],
    ),
  );
  return candidates.find((element) => !descriptor.text || element.textContent?.trim().slice(0, 80) === descriptor.text) ?? candidates[0] ?? null;
}

function focusableElements(container) {
  return [...container.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), audio[controls], [href], [tabindex]")]
    .filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.closest("[inert]") &&
        element.getClientRects().length > 0,
    );
}

function focusMainContent() {
  const main = root.querySelector("#main-content");
  main?.focus({ preventScroll: true });
}

function recordingBusy() {
  return Boolean(state.recordingRuntime);
}

function cardForSession(session = state.activeSession) {
  return session ? cardMap.get(session.taskCardId) : null;
}

function sessionTimestamp(session) {
  return new Date(session.completedAt ?? session.startedAt ?? 0).getTime();
}

function applySettings() {
  document.documentElement.classList.toggle("reduce-motion", state.settings.reducedMotion);
}

function scheduleActiveSave() {
  clearTimeout(saveTimer);
  pendingActiveSave = state.activeSession ? structuredClone(state.activeSession) : null;
  setSaveStatus("saving");
  saveTimer = setTimeout(() => {
    void flushScheduledActiveSave({ reportFailure: true }).catch(() => {});
  }, 180);
}

function updateActive(updater, options = {}) {
  if (!state.activeSession) {
    return;
  }
  const next = typeof updater === "function" ? updater(state.activeSession) : updater;
  state.activeSession = {
    ...next,
    notesUpdatedAt: options.markNotes ? new Date().toISOString() : next.notesUpdatedAt,
  };
  scheduleActiveSave();
  if (options.render) {
    render();
  }
}

function showToast(message, tone = "default") {
  clearTimeout(toastTimer);
  const region = document.querySelector(".toast-region");
  if (!region) {
    return;
  }
  region.innerHTML = `<div class="toast toast-${escapeHtml(tone)}">${tone === "danger" ? icon("alert") : icon("check")}${escapeHtml(message)}</div>`;
  toastTimer = setTimeout(() => {
    const current = document.querySelector(".toast-region");
    if (current) {
      current.innerHTML = "";
    }
  }, 3600);
}

function navigate(view) {
  if (recordingBusy()) {
    showToast(state.recordingRuntime?.status === "saving" ? "录音仍在保存，请稍候。" : "请先停止当前录音。", "danger");
    return;
  }
  const next = validViews.has(view) ? view : "home";
  state.pendingFocus = { type: "main" };
  if (location.hash.slice(1) === next) {
    state.view = next;
    render();
  } else {
    location.hash = next;
  }
}

function navItem(view, label, iconName) {
  const active = state.view === view || (view === "home" && state.view === "train");
  return `<button class="nav-item${active ? " is-active" : ""}" type="button" data-action="navigate" data-view="${view}" aria-current="${active ? "page" : "false"}">${icon(iconName)}<span>${label}</span></button>`;
}

function renderShell(content, options = {}) {
  const training = state.view === "train";
  return `
    <div class="app-shell${training ? " is-training" : ""}">
      <aside class="sidebar" aria-label="主要导航">
        <button class="brand" type="button" data-action="navigate" data-view="home" aria-label="讲明白首页">
          <img src="/icons/icon.svg" alt="" width="38" height="38">
          <span><strong>讲明白</strong><small>表达训练系统</small></span>
        </button>
        <nav class="sidebar-nav">
          ${navItem("home", "今日训练", "home")}
          ${navItem("library", "场景题库", "library")}
          ${navItem("history", "训练历史", "history")}
          ${navItem("ability", "能力档案", "chart")}
        </nav>
        <div class="sidebar-foot">
          <div class="local-note">${icon("archive")}<span>数据保存在当前设备</span></div>
          ${navItem("settings", "设置", "settings")}
        </div>
      </aside>
      <div class="page-column">
        <header class="topbar">
          <button class="mobile-brand" type="button" data-action="navigate" data-view="home" aria-label="讲明白首页">
            <img src="/icons/icon.svg" alt="" width="32" height="32"><strong>讲明白</strong>
          </button>
          <div class="topbar-title">${escapeHtml(options.title ?? "个人综合表达训练")}</div>
          <div class="topbar-meta"><span class="status-dot" aria-hidden="true"></span><span>仅本地</span><time datetime="${dateKey(new Date())}">${formatDate(new Date(), { month: "long", day: "numeric", weekday: "short" })}</time></div>
        </header>
        <main id="main-content" class="main-content${training ? " training-content" : ""}" tabindex="-1">${content}</main>
      </div>
      ${training ? "" : `<nav class="bottom-nav" aria-label="移动端导航">${navItem("home", "今日", "home")}${navItem("library", "题库", "library")}${navItem("history", "历史", "history")}${navItem("ability", "能力", "chart")}${navItem("settings", "设置", "settings")}</nav>`}
    </div>
    ${renderModal()}
    ${!state.settings.onboardingComplete && !state.modal ? renderOnboarding() : ""}
  `;
}

function metricScore(session, id, phase = "first") {
  const source = phase === "retry" ? session.retryScores : session.selfScores;
  return source?.[id];
}

function renderScoreScale(metricId, session, phase) {
  const current = metricScore(session, metricId, phase);
  return `<div class="score-scale" role="radiogroup" aria-label="${escapeHtml(METRICS[metricId].label)}评分">
    ${[1, 2, 3, 4, 5]
      .map(
        (score) => `<label class="score-choice${current === score ? " is-selected" : ""}">
          <input type="radio" name="${phase}-${metricId}" value="${score}" aria-label="${escapeHtml(METRICS[metricId].label)} ${score} 分" data-score-phase="${phase}" data-metric-id="${metricId}"${checked(current === score)}>
          <span>${score}</span>
        </label>`,
      )
      .join("")}
  </div>`;
}

function renderMetricRows(session, card, phase) {
  const sceneMetricIds = card.reviewMetricIds.filter((id) => !generalMetricIds.includes(id));
  const group = (title, ids) => `<section class="score-group">
    <div class="score-group-head"><h3>${title}</h3><span>1 需要纠正 · 5 表现稳定</span></div>
    <div class="score-list">
      ${ids
        .map(
          (id) => `<div class="score-row">
            <div><strong>${escapeHtml(METRICS[id].label)}</strong><small>${escapeHtml(METRICS[id].description)}</small></div>
            ${renderScoreScale(id, session, phase)}
          </div>`,
        )
        .join("")}
    </div>
  </section>`;
  return group("通用观察", generalMetricIds) + group(`${card.sceneLabel}专项观察`, sceneMetricIds);
}

function renderModeSelector(value, actionPrefix = "home-mode") {
  return `<div class="segmented" role="radiogroup" aria-label="训练模式">
    <button type="button" role="radio" aria-checked="${value === "full"}" tabindex="${value === "full" ? "0" : "-1"}" class="${value === "full" ? "is-active" : ""}" data-action="${actionPrefix}" data-value="full"><span>完整闭环</span><small>约 15–40 分钟</small></button>
    <button type="button" role="radio" aria-checked="${value === "quick"}" tabindex="${value === "quick" ? "0" : "-1"}" class="${value === "quick" ? "is-active" : ""}" data-action="${actionPrefix}" data-value="quick"><span>快速模式</span><small>约 8–12 分钟</small></button>
  </div>`;
}

function renderSceneSelect(value, name = "homeScene") {
  return `<label class="field compact-field"><span>指定场景</span><select name="${name}"><option value="">均衡推荐</option>${Object.entries(SCENES)
    .map(([id, scene]) => `<option value="${id}"${selected(value, id)}>${escapeHtml(scene.label)}</option>`)
    .join("")}</select></label>`;
}

function sceneCoverage(counts, days, compact = false) {
  const maximum = Math.max(1, ...Object.values(counts));
  return `<div class="coverage-list${compact ? " compact" : ""}">${Object.entries(SCENES)
    .map(([id, scene]) => {
      const value = counts[id] ?? 0;
      return `<div class="coverage-row"><span>${escapeHtml(scene.label)}</span><progress value="${value}" max="${maximum}" aria-label="${escapeHtml(scene.label)} ${days} 天训练 ${value} 次"></progress><strong>${value}</strong></div>`;
    })
    .join("")}</div>`;
}

function renderHome() {
  const stats = calculateStats(state.sessions, TASK_CARDS, METRICS);
  const annualEntry = annualEntryForDate();
  const completedToday = state.sessions.filter(
    (session) => session.completionStatus === "completed" && dateKey(session.completedAt) === dateKey(new Date()),
  ).length;
  const activeCard = cardForSession();
  const statusTitle = state.activeSession
    ? state.activeSession.stage === "complete"
      ? "今天的训练已完成"
      : "有一项训练等待继续"
    : completedToday > 0
      ? "今日闭环已完成"
      : "今天，讲明白一件事";
  const primaryAction = state.activeSession
    ? `<button class="button button-primary button-large" type="button" data-action="resume-session">${icon(state.activeSession.stage === "complete" ? "chart" : "play")}<span>${state.activeSession.stage === "complete" ? "查看本次总结" : `继续${escapeHtml(stageLabel(state.activeSession.protocol, state.activeSession.stage))}`}</span></button>`
    : `<button class="button button-primary button-large" type="button" data-action="start-home">${icon("play")}<span>${completedToday > 0 ? "再练一题" : "开始今日训练"}</span></button>`;

  const content = `
    <div class="page-heading">
      <div><p class="eyebrow">今日训练</p><h1>${statusTitle}</h1><p>${state.activeSession ? escapeHtml(activeCard?.title ?? state.activeSession.title) : "从场景化任务卡出发，自行搜索、组织、表达、复盘并立即重讲。"}</p></div>
      <div class="streak-box"><span>连续完成</span><strong>${stats.streak.current}</strong><small>天 · 最长 ${stats.streak.best} 天</small></div>
    </div>

    <section class="today-workspace" aria-labelledby="today-title">
      <div class="today-copy">
        <div class="status-line"><span class="status-badge ${state.activeSession ? "status-active" : completedToday ? "status-done" : "status-ready"}">${state.activeSession ? "进行中" : completedToday ? "已完成" : "待开始"}</span><span>${state.activeSession ? `${escapeHtml(activeCard?.sceneLabel ?? "训练")} · ${state.activeSession.mode === "quick" ? "快速模式" : "完整闭环"}` : state.homeScene ? `题库 ${TASK_CARDS.length} 张 · 指定场景自适应` : `年度第 ${annualEntry?.dayNumber ?? "—"} / 365 题 · 本地固定计划`}</span></div>
        <h2 id="today-title">${state.activeSession ? escapeHtml(activeCard?.topicLabel ?? state.activeSession.topicLabel) : state.homeScene ? "按指定场景选择一张适合当前等级的题" : escapeHtml(annualEntry?.card.topicLabel ?? "系统规定路径，你完成思考")}</h2>
        <p>${state.activeSession ? `进度已自动保存在当前设备。预计总时长 ${totalEstimatedMinutes(state.activeSession)} 分钟。` : state.homeScene ? "指定场景会继续使用自适应选题，并结合等级、近期覆盖与重复约束。" : `今日题来自 365 张固定题库；同一年、同一天在本设备上始终一致。${annualEntry ? ` 今日场景：${escapeHtml(annualEntry.card.sceneLabel)}。` : ""}`}</p>
      </div>
      <div class="today-controls">
        ${state.activeSession ? "" : renderModeSelector(state.homeMode)}
        ${state.activeSession ? "" : renderSceneSelect(state.homeScene)}
        ${primaryAction}
        ${state.activeSession && state.activeSession.stage !== "complete" ? `<button class="button button-ghost" type="button" data-action="open-abandon">${icon("x")}结束并记录未完成</button>` : ""}
      </div>
    </section>

    <section class="focus-band" aria-labelledby="focus-title">
      <div class="focus-icon">${icon("target")}</div>
      <div><p class="eyebrow">当前唯一训练重点</p><h2 id="focus-title">${escapeHtml(stats.focus.label)}</h2><p>${escapeHtml(stats.focus.reason)}</p></div>
      <button class="button button-secondary" type="button" data-action="navigate" data-view="ability">查看依据${icon("chevronRight")}</button>
    </section>

    <div class="home-dashboard">
      <section class="dashboard-section" aria-labelledby="coverage-title">
        <div class="section-heading"><div><p class="eyebrow">滚动 7 天</p><h2 id="coverage-title">本周场景覆盖</h2></div><span class="metric-number">${Object.values(stats.sceneCounts7).filter(Boolean).length}<small>/ 10 类</small></span></div>
        ${sceneCoverage(stats.sceneCounts7, 7, true)}
      </section>
      <section class="dashboard-section" aria-labelledby="loop-title">
        <div class="section-heading"><div><p class="eyebrow">滚动 28 天</p><h2 id="loop-title">完整训练闭环</h2></div><span class="metric-number">${stats.completeLoops28}</span></div>
        <div class="metric-grid">
          <div><span>重讲改善率</span><strong>${stats.improvementRate}%</strong></div>
          <div><span>结构多样性</span><strong>${stats.structureDiversity30}</strong></div>
          <div><span>来源达成率</span><strong>${stats.sourceComplianceRate}%</strong></div>
          <div><span>本周完成天数</span><strong>${stats.completionDays7}</strong></div>
        </div>
        <button class="text-button" type="button" data-action="navigate" data-view="history">查看全部训练记录${icon("arrowRight")}</button>
      </section>
    </div>
  `;
  return renderShell(content, { title: "今日训练" });
}

function renderTaskPreview(session, card) {
  const stageEntries = Object.entries(session.stageMinutes);
  const sensitiveNotice = cardIsSensitive(card)
    ? `<section class="sensitive-task-notice" aria-labelledby="sensitive-task-title">
        <div>${icon("info")}</div>
        <div><p class="eyebrow">完全自愿 · ${escapeHtml(sensitiveFlagText(card))}</p><h2 id="sensitive-task-title">你可以不解释原因，立即换一张</h2><p>是否练习由你决定。跳过不会占用普通“换一次题”的额度，也不会影响连续完成或训练评价；如果下一张仍不合适，可以继续跳过。</p></div>
        <button class="button button-secondary" type="button" data-action="skip-sensitive-task">立即跳过这张</button>
      </section>`
    : "";
  return `
    <div class="training-header-row">
      <button class="icon-button" type="button" data-action="navigate" data-view="home" title="返回首页" aria-label="返回首页">${icon("chevronLeft")}</button>
      <div><p class="eyebrow">今日任务 · ${escapeHtml(PROTOCOLS[card.protocol].label)}</p><h1>先看清任务，再开始计时</h1></div>
      <span class="save-state${state.saveStatus === "error" ? " is-error" : ""}">${saveStateMarkup()}</span>
    </div>
    <article class="task-preview">
      <div class="task-preview-main">
        <div class="card-meta"><span class="scene-tag scene-${card.scene}">${escapeHtml(card.sceneLabel)}</span><span class="domain-tag domain-${card.domain}">${escapeHtml(card.domainLabel)}</span><span>L${card.difficulty}</span><span>${session.mode === "quick" ? "快速模式" : "完整闭环"}</span></div>
        <p class="topic-label">${escapeHtml(card.topicLabel)}</p>
        <h2>${escapeHtml(card.title)}</h2>
        <div class="task-facts">
          <div><span>目标受众</span><strong>${escapeHtml(card.audience)}</strong></div>
          <div><span>沟通目的</span><strong>${escapeHtml(card.purpose)}</strong></div>
          <div><span>主要能力</span><strong>${escapeHtml(card.primarySkill)}</strong></div>
          <div><span>情境背景</span><strong>${escapeHtml(card.context)}</strong></div>
        </div>
      </div>
      <aside class="task-preview-side">
        <div class="estimate"><span>${icon("clock")}预计总时长</span><strong>${totalEstimatedMinutes(session)}<small> 分钟</small></strong></div>
        <ol class="protocol-preview">
          ${stageEntries.map(([stage, minutes]) => `<li><span>${escapeHtml(stageLabel(card.protocol, stage))}</span><strong>${minutes} 分钟</strong></li>`).join("")}
        </ol>
      </aside>
    </article>
    ${sensitiveNotice}
    <section class="criteria-section">
      <div><p class="eyebrow">完成标准</p><h2>本轮做到这些就算完成</h2></div>
      <ul class="check-list">${card.completionCriteria.map((item) => `<li>${icon("check")}<span>${escapeHtml(item)}</span></li>`).join("")}</ul>
    </section>
    <div class="action-bar preview-actions">
      <button class="button button-ghost" type="button" data-action="open-swap"${session.swapUsed ? " disabled" : ""}>${icon("shuffle")}<span>${session.swapUsed ? "本轮已换过一次" : "换一次题"}</span></button>
      <button class="button button-primary button-large" type="button" data-action="start-training">开始第一阶段${icon("arrowRight")}</button>
    </div>
  `;
}

function renderStageProgress(session) {
  const stages = orderedStages().filter((stage) => stage !== "complete");
  return `<ol class="stage-progress" aria-label="训练阶段">
    ${stages
      .map((stage, index) => {
        const active = session.stage === stage;
        const done = session.stageIndex > index;
        return `<li class="${active ? "is-active" : done ? "is-done" : ""}"${active ? ' aria-current="step"' : ""}><span>${done ? icon("check") : index + 1}</span><small>${escapeHtml(stageLabel(session.protocol, stage))}</small></li>`;
      })
      .join("")}
  </ol>`;
}

function renderTimer(session) {
  const timer = session.timer;
  const remaining = timerRemaining(timer);
  const elapsed = currentElapsed(timer);
  const maximum = Math.max(timer?.durationSeconds ?? 1, elapsed, 1);
  const over = remaining < 0;
  const running = Boolean(timer?.runningSince);
  return `<section class="stage-timer${over ? " is-over" : ""}" aria-label="阶段计时器">
    <div class="timer-readout"><span>${over ? "已超时" : running ? "剩余时间" : elapsed > 0 ? "已暂停" : "阶段计时"}</span><strong data-timer-text>${over ? "+" : ""}${formatDuration(remaining)}</strong><small>目标 ${formatDuration(timer?.durationSeconds ?? 0)}</small></div>
    <progress data-timer-progress value="${Math.min(elapsed, maximum)}" max="${maximum}" aria-label="已用时间"></progress>
    <div class="timer-actions">
      <button class="button button-secondary" type="button" data-action="toggle-timer">${icon(running ? "pause" : "play")}<span>${running ? "暂停" : elapsed > 0 ? "继续" : "开始计时"}</span></button>
      <button class="button button-ghost" type="button" data-action="extend-timer">${icon("plus")}延长 5 分钟</button>
    </div>
  </section>`;
}

function timingGuidanceForSession(session, card) {
  if (card.protocol === "interactive_communication") {
    return card.structureSteps.map((step, index) => `第 ${index + 1} 轮附近：${step}`);
  }
  const totalSeconds = (session.stageMinutes.firstDelivery ?? 0) * 60;
  const slice = Math.max(1, Math.floor(totalSeconds / card.structureSteps.length));
  return card.structureSteps.map((step, index) => {
    const start = index * slice;
    const end = index === card.structureSteps.length - 1 ? totalSeconds : (index + 1) * slice;
    return `${start}-${end} 秒：${step}`;
  });
}

function renderStageShell(session, card, body, sidebar = "") {
  return `
    <div class="training-header-row compact">
      <button class="icon-button" type="button" data-action="navigate" data-view="home" title="暂时离开" aria-label="暂时离开训练">${icon("chevronLeft")}</button>
      <div><p class="eyebrow">${escapeHtml(card.sceneLabel)} · ${escapeHtml(card.topicLabel)}</p><h1>${escapeHtml(stageLabel(card.protocol, session.stage))}</h1></div>
      <span class="save-state${state.saveStatus === "error" ? " is-error" : ""}">${saveStateMarkup()}</span>
    </div>
    ${renderStageProgress(session)}
    <div class="stage-layout">
      <div class="stage-primary">${body}</div>
      <aside class="stage-sidebar">${renderTimer(session)}${sidebar}</aside>
    </div>
  `;
}

function renderHelp(session, card) {
  const level = session.helpLevels?.[session.stage] ?? 0;
  if (level === 0) {
    return `<section class="help-panel collapsed"><div><h3>卡住时按层求助</h3><p>每次只打开一层，系统仍不会提供主题答案或成稿。</p></div><button class="button button-ghost" type="button" data-action="unlock-help">我卡住了</button></section>`;
  }
  const unanswered = card.researchPrompts.filter((prompt) => !session.researchChecks?.[prompt]);
  const content = [
    `<strong>第 1 层 · 重述目标</strong><p>本轮要面向“${escapeHtml(card.audience)}”，完成“${escapeHtml(card.purpose)}”。</p>`,
    `<strong>第 2 层 · 未回答的问题</strong><ul>${(unanswered.length ? unanswered : card.researchPrompts).slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    `<strong>第 3 层 · 检索词方向</strong><p>组合检索“${escapeHtml(card.topicLabel)} + 定义 / 机制 / 证据 / 反方 / 局限”，再根据受众缩小范围。</p>`,
    `<strong>第 4 层 · 来源类型</strong><p>优先寻找原始规则、政府或大学页面、专业机构、论文或可靠书籍，并核对发布日期与适用对象。</p>`,
    `<strong>第 5 层 · 结构问题</strong><p>开头要解决听众的什么疑问？中段哪条证据真正支撑主旨？结尾需要保留什么边界？</p>`,
    `<strong>第 6 层 · 降级选择</strong><p>可以回到首页结束并记录未完成，或下一次使用快速模式和更低难度题卡。</p>`,
  ];
  return `<section class="help-panel"><div class="help-head"><div><p class="eyebrow">分层帮助 ${level} / 6</p><h3>只提供下一步问题</h3></div>${level < 6 ? `<button class="button button-ghost" type="button" data-action="unlock-help">再打开一层</button>` : ""}</div><div class="help-levels">${content.slice(0, level).map((item) => `<div>${item}</div>`).join("")}</div></section>`;
}

function renderResearch(session, card) {
  const requiresSources = ["standard", "sensitive"].includes(card.sourceMode);
  const sourceRows = session.sources ?? [];
  const body = `
    <section class="stage-intro">
      <p class="eyebrow">只给检索任务，不给检索结果</p>
      <h2>${escapeHtml(card.title)}</h2>
      <p>${escapeHtml(card.context)}</p>
    </section>
    <section class="workspace-section">
      <div class="section-heading"><div><h2>${requiresSources ? "自主检索清单" : card.sourceMode === "given" ? "背景核对清单" : "准备问题"}</h2><p>勾选仅代表你已处理过这个问题，不代表存在标准答案。</p></div><span class="count-badge" data-research-count>${Object.values(session.researchChecks ?? {}).filter(Boolean).length} / ${card.researchPrompts.length}</span></div>
      <div class="prompt-checks">${card.researchPrompts
        .map(
          (prompt, index) => `<label><input type="checkbox" data-research-prompt="${index}"${checked(session.researchChecks?.[prompt])}><span><strong>问题 ${index + 1}</strong>${escapeHtml(prompt)}</span></label>`,
        )
        .join("")}</div>
    </section>
    <section class="workspace-section">
      <div class="section-heading"><div><h2>${requiresSources ? "来源记录" : "证据与边界记录"}</h2><p>${requiresSources ? "至少记录来源名称、链接，以及它实际支持了什么。" : "把已知事实、个人观察和推测分开。"}</p></div>${requiresSources ? `<button class="button button-secondary" type="button" data-action="add-source">${icon("plus")}添加来源</button>` : ""}</div>
      ${requiresSources ? `<div class="source-list">${sourceRows.length ? sourceRows.map((source, index) => renderSourceRow(source, index)).join("") : `<div class="empty-inline"><p>还没有来源记录。</p><button class="button button-secondary" type="button" data-action="add-source">${icon("plus")}添加第一个来源</button></div>`}</div>` : `<div class="boundary-note">${card.sourceRequirements.map((item) => `<p>${icon("check")}<span>${escapeHtml(item)}</span></p>`).join("")}</div>`}
      <label class="confirmation-check"><input type="checkbox" data-session-field="sourceRequirementsMet"${checked(session.sourceRequirementsMet)}><span>我已按本题要求区分事实、观点与推测，并记录必要的反方或边界。</span></label>
    </section>
    ${renderHelp(session, card)}
    <div class="action-bar"><button class="button button-ghost" type="button" data-action="open-abandon">结束并记录未完成</button><button class="button button-primary" type="button" data-action="advance-stage">进入${escapeHtml(stageLabel(card.protocol, "organize"))}${icon("arrowRight")}</button></div>
  `;
  const sidebar = `<section class="side-note"><h3>来源要求</h3><ul>${card.sourceRequirements.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="side-note distinction"><h3>记录时始终区分</h3><dl><div><dt>事实</dt><dd>可由来源核验</dd></div><div><dt>观点</dt><dd>作者或你的判断</dd></div><div><dt>推测</dt><dd>仍需验证的解释</dd></div></dl></section>`;
  return renderStageShell(session, card, body, sidebar);
}

function renderSourceRow(source, index) {
  return `<fieldset class="source-row"><legend>来源 ${index + 1}</legend><div class="source-grid">
    <label class="field"><span>来源名称</span><input type="text" value="${escapeHtml(source.name ?? "")}" data-source-index="${index}" data-source-field="name" placeholder="机构、作者或材料名称"></label>
    <label class="field"><span>来源类型</span><select data-source-index="${index}" data-source-field="kind"><option value="fact"${selected(source.kind, "fact")}>事实或研究</option><option value="viewpoint"${selected(source.kind, "viewpoint")}>观点或解释</option><option value="counter"${selected(source.kind, "counter")}>反方或边界</option></select></label>
    <label class="field source-url"><span>链接或出版信息</span><input type="text" value="${escapeHtml(source.url ?? "")}" data-source-index="${index}" data-source-field="url" placeholder="https://… 或书名、版本、页码"></label>
    <label class="field source-support"><span>它支持了什么</span><textarea rows="2" data-source-index="${index}" data-source-field="support" placeholder="只记录你核验到的作用，不抄写搜索摘要">${escapeHtml(source.support ?? "")}</textarea></label>
  </div><button class="icon-button source-remove" type="button" data-action="remove-source" data-index="${index}" title="删除来源" aria-label="删除来源 ${index + 1}">${icon("trash")}</button></fieldset>`;
}

function organizeWarnings(session, card) {
  const notes = card.organizingTemplate.map((key) => session.userNotes?.[key]?.trim()).filter(Boolean);
  const warnings = [];
  if (notes.length < 3) {
    warnings.push("至少完成三个整理项，避免只凭一个想法开始表达。");
  }
  if (notes.some((note) => note.length > 220)) {
    warnings.push("有一项笔记过长。把它压缩为关键词，避免形成可照读稿件。");
  }
  if (!session.sourceRequirementsMet) {
    warnings.push("尚未确认来源与边界要求，表达时不要扩大结论范围。");
  }
  if (warnings.length === 0) {
    warnings.push("必要项已具备。现在删除不服务受众和目的的内容。");
  }
  return warnings;
}

function renderOrganize(session, card) {
  const filled = card.organizingTemplate.filter((item) => session.userNotes?.[item]?.trim()).length;
  const body = `
    <section class="stage-intro">
      <p class="eyebrow">由你填写内容，系统只检查缺项</p><h2>${escapeHtml(card.structureName)}</h2>
      <p>推荐结构只代表当前场景、受众、目的和时长下的适配方案，不是这个话题的唯一结构。</p>
    </section>
    <section class="structure-map" aria-label="推荐结构">
      ${card.structureSteps.map((step, index) => `<div><span>${index + 1}</span><strong>${escapeHtml(step)}</strong><small>${escapeHtml(timingGuidanceForSession(session, card)[index] ?? "")}</small></div>`).join("")}
    </section>
    <section class="workspace-section">
      <div class="section-heading"><div><h2>空白整理模板</h2><p>只写关键词、证据位置和逻辑关系，不写可照读全文。</p></div><span class="count-badge" data-organize-count>${filled} / ${card.organizingTemplate.length}</span></div>
      <div class="notes-grid">${card.organizingTemplate
        .map(
          (item, index) => `<label class="field note-field"><span><b>${index + 1}</b>${escapeHtml(item)}</span><textarea rows="4" data-note-key="${escapeHtml(item)}" placeholder="用自己的关键词填写…">${escapeHtml(session.userNotes?.[item] ?? "")}</textarea></label>`,
        )
        .join("")}</div>
    </section>
    <section class="organize-check" data-organize-check><h3>进入表达前的提问式检查</h3>${organizeWarnings(session, card).map((item) => `<p>${icon("info")}<span>${escapeHtml(item)}</span></p>`).join("")}</section>
    ${renderHelp(session, card)}
    <div class="action-bar"><button class="button button-ghost" type="button" data-action="previous-preparation">${icon("chevronLeft")}返回${escapeHtml(stageLabel(card.protocol, "research"))}</button><button class="button button-primary" type="button" data-action="advance-stage">进入第一次表达${icon("arrowRight")}</button></div>
  `;
  const sidebar = `<section class="side-note"><h3>本轮输出限制</h3><ul>${card.constraints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="side-note"><h3>主要训练能力</h3><p>${escapeHtml(card.primarySkill)}</p><div class="mini-tags">${card.secondarySkills.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>`;
  return renderStageShell(session, card, body, sidebar);
}

function renderRecorder(session, slot) {
  const isFirst = slot === "first";
  const recordingId = isFirst ? session.recordingFirstId : session.recordingRetryId;
  const unavailable = session.recordingUnavailable?.[slot];
  const runtime = state.recordingRuntime;
  const active = runtime?.slot === slot && runtime?.recorder?.state === "recording";
  const requesting = runtime?.slot === slot && ["requesting", "starting"].includes(runtime?.status);
  const saving = runtime?.slot === slot && runtime?.status === "saving";
  const busy = requesting || saving;
  return `<section class="recorder-panel${active ? " is-recording" : ""}">
    <div class="recorder-status"><span class="record-dot" aria-hidden="true"></span><div><strong>${active ? "正在录音" : requesting ? "正在请求麦克风" : saving ? "正在保存录音" : recordingId ? "录音已保存在当前设备" : "录音尚未开始"}</strong><small>${active ? "完成后停止录音，计时器不会强制中断。" : busy ? "请保持当前页面，完成后即可继续。" : recordingId ? "可重新录制，新的录音会替换本阶段记录。" : "浏览器将请求麦克风权限。"}</small></div></div>
    <div class="recorder-actions">
      ${active ? `<button class="button button-danger" type="button" data-action="stop-recording">${icon("square")}停止并保存</button>` : `<button class="button button-primary" type="button" data-action="start-recording" data-slot="${slot}"${busy ? " disabled" : ""}>${icon("mic")}<span>${recordingId ? "重新录制" : isFirst ? "开始首次录音" : "开始重讲录音"}</span></button>`}
      ${recordingId ? `<div class="audio-slot" data-recording-id="${escapeHtml(recordingId)}"><span>正在读取本地录音…</span></div>` : ""}
    </div>
    <label class="device-fallback"><input type="checkbox" data-recording-unavailable="${slot}"${checked(unavailable)}${runtime ? " disabled" : ""}><span>当前设备或环境无法录音，仍记录本次口头完成</span></label>
  </section>`;
}

function renderDelivery(session, card) {
  const body = `
    <section class="delivery-focus">
      <p class="eyebrow">完整笔记已收起 · 只保留结构关键词</p><h2>${escapeHtml(card.title)}</h2><p>面向：${escapeHtml(card.audience)}</p>
      <div class="delivery-keywords">${card.structureSteps.map((step, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(step)}</strong></div>`).join("")}</div>
    </section>
    ${renderRecorder(session, "first")}
    <div class="gentle-note">${icon("clock")}<p>到达目标时间后，系统只会温和提示。请完成当前句并自然收束，不会强制停止。</p></div>
    <div class="action-bar"><button class="button button-ghost" type="button" data-action="navigate" data-view="home">暂时离开</button><button class="button button-primary" type="button" data-action="advance-stage">结束首次表达，进入复盘${icon("arrowRight")}</button></div>
  `;
  const sidebar = `<section class="side-note"><h3>本轮只观察</h3><p>${escapeHtml(card.primarySkill)}</p></section><section class="side-note"><h3>完成标准</h3><ul>${card.completionCriteria.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
  return renderStageShell(session, card, body, sidebar);
}

function selfEvaluationComplete(session, card) {
  return (
    card.reviewMetricIds.every((id) => Number.isFinite(session.selfScores?.[id])) &&
    session.mainProblem?.trim() &&
    session.effectiveAction?.trim() &&
    session.retryFocus?.trim()
  );
}

function renderReview(session, card) {
  const feedback = session.feedbackRevealed ? buildRuleFeedback(session, card, METRICS) : [];
  const body = `
    <section class="stage-intro">
      <p class="eyebrow">先完成自评，再查看系统提示</p><h2>回听第一次表达，寻找可观察证据</h2>
      <p>不要评价“我有没有天赋”。标出哪一段、哪一句、哪个动作让表达更清楚或更难理解。</p>
    </section>
    <section class="playback-section"><div><h3>第一次录音</h3><p>建议先完整听一遍，再开始打分。</p></div>${session.recordingFirstId ? `<div class="audio-slot wide" data-recording-id="${escapeHtml(session.recordingFirstId)}"><span>正在读取本地录音…</span></div>` : `<p class="muted">本次已标记为无录音口头完成。</p>`}</section>
    ${renderMetricRows(session, card, "first")}
    <section class="reflection-fields">
      <label class="field"><span>本次最明显的问题</span><textarea rows="3" data-session-text="mainProblem" placeholder="写可观察行为，例如：背景讲了太久，45 秒后才出现结论">${escapeHtml(session.mainProblem)}</textarea></label>
      <label class="field"><span>本次做得相对有效的一个动作</span><textarea rows="3" data-session-text="effectiveAction" placeholder="例如：用具体例子解释了抽象概念">${escapeHtml(session.effectiveAction)}</textarea></label>
      <label class="field focus-field"><span>下一次只改哪一个问题</span><textarea rows="3" data-session-text="retryFocus" placeholder="只写一个动作，例如：前 20 秒直接给出判断">${escapeHtml(session.retryFocus)}</textarea></label>
    </section>
    <section class="feedback-lock${session.feedbackRevealed ? " is-open" : ""}">
      <div class="feedback-lock-head">${icon(session.feedbackRevealed ? "check" : "archive")}<div><h3>${session.feedbackRevealed ? "规则提示已开放" : "系统提示尚未开放"}</h3><p>${session.feedbackRevealed ? "这些问题只基于你的分项自评和计时记录，不替你写结论。" : "完成全部分项观察和三个复盘问题后再开放。"}</p></div></div>
      ${session.feedbackRevealed ? `<ol>${feedback.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : ""}
    </section>
    <div class="action-bar"><button class="button button-ghost" type="button" data-action="navigate" data-view="home">暂时离开</button>${session.feedbackRevealed ? `<button class="button button-primary" type="button" data-action="advance-stage">带着唯一目标重讲${icon("arrowRight")}</button>` : `<button class="button button-primary" type="button" data-action="reveal-feedback">完成自评，查看规则提示${icon("arrowRight")}</button>`}</div>
  `;
  const sidebar = `<section class="side-note"><h3>评分不是总分</h3><p>每项只记录当次可观察表现。系统不会把分项合并为人格或表达天赋判断。</p></section><section class="side-note"><h3>首次实际时长</h3><strong class="side-number">${formatDuration(session.stageDurations?.firstDelivery ?? 0)}</strong></section>`;
  return renderStageShell(session, card, body, sidebar);
}

function scoreAverage(scores, ids) {
  const values = ids.map((id) => scores?.[id]).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function renderRetry(session, card) {
  const firstAverage = scoreAverage(session.selfScores, card.reviewMetricIds);
  const retryAverage = scoreAverage(session.retryScores, card.reviewMetricIds);
  const body = `
    <section class="retry-focus">
      <p class="eyebrow">本次只改一个问题</p><h2>${escapeHtml(session.retryFocus || "尚未填写唯一改进目标")}</h2>
      <p>保留原题、原结构和原时长。不重新调研，不增加新的观点。</p>
    </section>
    <section class="delivery-focus retry-delivery"><h3>${escapeHtml(card.title)}</h3><div class="delivery-keywords">${card.structureSteps.map((step, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(step)}</strong></div>`).join("")}</div></section>
    ${renderRecorder(session, "retry")}
    ${session.recordingRetryId || session.recordingUnavailable?.retry ? `<section class="comparison-section"><div class="section-heading"><div><h2>重讲后分项观察</h2><p>使用同一标准评分，用于比较变化，不追求一次性满分。</p></div>${retryAverage ? `<span class="delta-badge ${retryAverage >= firstAverage ? "positive" : ""}">${retryAverage >= firstAverage ? "+" : ""}${(retryAverage - firstAverage).toFixed(1)}</span>` : ""}</div>${renderMetricRows(session, card, "retry")}<div class="improvement-choice"><fieldset><legend>是否出现可观察改善？</legend><label><input type="radio" name="observableImprovement" value="yes"${checked(session.observableImprovement === true)}><span>是，能指出具体变化</span></label><label><input type="radio" name="observableImprovement" value="no"${checked(session.observableImprovement === false)}><span>否，问题仍明显存在</span></label></fieldset><label class="confirmation-check"><input type="checkbox" data-session-field="migrationRecommended"${checked(session.migrationRecommended)}><span>建议以后用同一话题做跨场景迁移训练</span></label></div></section>` : ""}
    <div class="action-bar"><button class="button button-ghost" type="button" data-action="navigate" data-view="home">暂时离开</button><button class="button button-primary" type="button" data-action="finish-session">完成训练闭环${icon("check")}</button></div>
  `;
  const sidebar = `<section class="side-note"><h3>对比录音</h3>${session.recordingFirstId ? `<div class="audio-slot stacked" data-recording-id="${escapeHtml(session.recordingFirstId)}"><span>正在读取首次录音…</span></div>` : `<p>首次表达未保存录音。</p>`}${session.recordingRetryId ? `<div class="audio-slot stacked" data-recording-id="${escapeHtml(session.recordingRetryId)}"><span>正在读取重讲录音…</span></div>` : ""}</section><section class="side-note"><h3>不得改变</h3><ul><li>不重新调研</li><li>不增加新观点</li><li>不更换题目与结构</li><li>只观察唯一改进目标</li></ul></section>`;
  return renderStageShell(session, card, body, sidebar);
}

function renderComplete(session, card) {
  const firstAverage = scoreAverage(session.selfScores, card.reviewMetricIds);
  const retryAverage = scoreAverage(session.retryScores, card.reviewMetricIds);
  const delta = retryAverage - firstAverage;
  const totalSeconds = Object.values(session.stageDurations ?? {}).reduce((sum, value) => sum + value, 0);
  return `
    <div class="completion-page">
      <div class="completion-mark">${icon("check")}</div>
      <p class="eyebrow">完整训练闭环已保存</p>
      <h1>${escapeHtml(card.topicLabel)}</h1>
      <p class="completion-lead">系统只保存你亲自完成的来源、笔记、表达和复盘，不替你生成学习结论。</p>
      <div class="completion-summary">
        <div><span>实际训练时长</span><strong>${formatDuration(totalSeconds)}</strong></div>
        <div><span>来源记录</span><strong>${session.sources?.length ?? 0}</strong></div>
        <div><span>重讲变化</span><strong class="${delta > 0 ? "positive-text" : ""}">${delta > 0 ? "+" : ""}${delta.toFixed(1)}</strong></div>
        <div><span>可观察改善</span><strong>${session.observableImprovement ? "已出现" : "未确认"}</strong></div>
      </div>
      <section class="completion-focus"><span>本次唯一改进目标</span><h2>${escapeHtml(session.retryFocus)}</h2><p>${session.migrationRecommended ? "已标记：以后安排同题跨场景迁移。" : "未标记同题迁移。"}</p></section>
      <div class="recording-compare">
        <div><h3>第一次表达</h3>${session.recordingFirstId ? `<div class="audio-slot wide" data-recording-id="${escapeHtml(session.recordingFirstId)}"><span>正在读取录音…</span></div>` : `<p>未保存录音</p>`}</div>
        <div><h3>针对性重讲</h3>${session.recordingRetryId ? `<div class="audio-slot wide" data-recording-id="${escapeHtml(session.recordingRetryId)}"><span>正在读取录音…</span></div>` : `<p>未保存录音</p>`}</div>
      </div>
      <div class="completion-actions"><button class="button button-secondary" type="button" data-action="open-history-session" data-session-id="${escapeHtml(session.sessionId)}">查看完整记录</button><button class="button button-primary button-large" type="button" data-action="close-complete">返回今日训练${icon("arrowRight")}</button></div>
    </div>
  `;
}

function renderTraining() {
  const session = state.activeSession;
  const card = cardForSession(session);
  if (!session || !card) {
    return renderShell(`<section class="empty-state"><div>${icon("alert")}</div><h1>没有可恢复的训练</h1><p>当前题卡可能已被移除，请返回首页重新抽取。</p><button class="button button-primary" type="button" data-action="navigate" data-view="home">返回首页</button></section>`, { title: "训练工作台" });
  }
  let content;
  if (session.stage === "preview") {
    content = renderTaskPreview(session, card);
  } else if (session.stage === "research") {
    content = renderResearch(session, card);
  } else if (session.stage === "organize") {
    content = renderOrganize(session, card);
  } else if (session.stage === "firstDelivery") {
    content = renderDelivery(session, card);
  } else if (session.stage === "review") {
    content = renderReview(session, card);
  } else if (session.stage === "retry") {
    content = renderRetry(session, card);
  } else {
    content = renderComplete(session, card);
  }
  return renderShell(content, { title: "训练工作台" });
}

function libraryFilteredCards() {
  const filters = state.libraryFilters;
  const query = filters.query.trim().toLocaleLowerCase("zh-CN");
  return TASK_CARDS.filter((card) => !filters.scene || card.scene === filters.scene)
    .filter((card) => !filters.domain || card.domain === filters.domain)
    .filter((card) => !filters.difficulty || card.difficulty === Number(filters.difficulty))
    .filter((card) => filters.favorites !== "yes" || state.favorites.has(card.id))
    .filter(
      (card) =>
        !query ||
        [card.id, card.topicLabel, card.title, card.audience, card.purpose, card.sceneLabel, card.domainLabel]
          .join(" ")
          .toLocaleLowerCase("zh-CN")
          .includes(query),
    );
}

function renderCardItem(card) {
  const favorite = state.favorites.has(card.id);
  return `<article class="library-card">
    <div class="library-card-head"><div class="card-meta"><span class="scene-tag scene-${card.scene}">${escapeHtml(card.sceneLabel)}</span><span class="domain-tag domain-${card.domain}">${escapeHtml(card.domainLabel)}</span></div><button class="icon-button${favorite ? " is-favorite" : ""}" type="button" data-action="toggle-favorite" data-card-id="${card.id}" title="${favorite ? "取消收藏" : "收藏题卡"}" aria-label="${favorite ? "取消收藏" : "收藏"} ${escapeHtml(card.topicLabel)}">${icon(favorite ? "heartFilled" : "heart")}</button></div>
    <div class="library-card-body"><p>${escapeHtml(card.topicLabel)}</p><h2>${escapeHtml(card.title)}</h2><dl><div><dt>受众</dt><dd>${escapeHtml(card.audience)}</dd></div><div><dt>协议</dt><dd>${escapeHtml(PROTOCOLS[card.protocol].label)} · L${card.difficulty}</dd></div></dl></div>
    <div class="library-card-actions"><button class="button button-ghost" type="button" data-action="open-card" data-card-id="${card.id}">查看任务</button><button class="button button-secondary" type="button" data-action="start-card" data-card-id="${card.id}">${icon("play")}开始训练</button></div>
  </article>`;
}

function renderLibrary() {
  const cards = libraryFilteredCards();
  const content = `
    <div class="page-heading library-heading"><div><p class="eyebrow">版本 ${CARD_BANK_VERSION}</p><h1>场景化题库</h1><p>每张卡都绑定场景、受众、目的、训练协议、检索任务、结构与评价指标。</p></div><div class="library-count"><strong>${cards.length}</strong><span>/ ${TASK_CARDS.length} 张</span></div></div>
    <section class="filter-bar" aria-label="题库筛选">
      <label class="search-field">${icon("search")}<input type="search" placeholder="搜索话题、任务或受众" value="${escapeHtml(state.libraryFilters.query)}" data-library-filter="query"></label>
      <label><span>场景</span><select data-library-filter="scene"><option value="">全部场景</option>${Object.entries(SCENES).map(([id, item]) => `<option value="${id}"${selected(state.libraryFilters.scene, id)}>${escapeHtml(item.label)}</option>`).join("")}</select></label>
      <label><span>领域</span><select data-library-filter="domain"><option value="">全部领域</option>${Object.entries(DOMAINS).map(([id, item]) => `<option value="${id}"${selected(state.libraryFilters.domain, id)}>${escapeHtml(item.label)}</option>`).join("")}</select></label>
      <label><span>难度</span><select data-library-filter="difficulty"><option value="">全部难度</option>${[1, 2, 3, 4, 5].map((value) => `<option value="${value}"${selected(state.libraryFilters.difficulty, String(value))}>L${value}</option>`).join("")}</select></label>
      <label class="favorite-filter"><input type="checkbox" data-library-filter="favorites" value="yes"${checked(state.libraryFilters.favorites === "yes")}>${icon("heart")}<span>只看收藏</span></label>
    </section>
    ${cards.length ? `<div class="library-grid">${cards.map(renderCardItem).join("")}</div>` : `<section class="empty-state compact"><div>${icon("search")}</div><h2>没有匹配的题卡</h2><p>调整场景、领域或关键词后再试。</p><button class="button button-secondary" type="button" data-action="clear-library-filters">清除筛选</button></section>`}
  `;
  return renderShell(content, { title: "场景题库" });
}

function uniqueProblems() {
  return [...new Set(state.sessions.map((session) => session.mainProblem?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function renderHistoryItem(session) {
  const card = cardMap.get(session.taskCardId);
  const label = session.completionStatus === "completed" ? "完整闭环" : session.completionStatus === "skipped" ? "已换题" : "未完成";
  const sceneToken = safeToken(session.scene, SCENES);
  const domainToken = safeToken(session.domain, DOMAINS);
  const statusToken = safeCompletionStatus(session.completionStatus);
  return `<article class="history-row">
    <div class="history-date"><strong>${formatDate(session.completedAt ?? session.startedAt, { day: "2-digit" })}</strong><span>${formatDate(session.completedAt ?? session.startedAt, { month: "short" })}</span></div>
    <div class="history-main"><div class="card-meta"><span class="scene-tag scene-${sceneToken}">${escapeHtml(session.sceneLabel ?? card?.sceneLabel ?? session.scene ?? "未知场景")}</span><span class="domain-tag domain-${domainToken}">${escapeHtml(session.domainLabel ?? card?.domainLabel ?? session.domain ?? "未知领域")}</span><span class="status-badge status-${statusToken}">${label}</span></div><h2>${escapeHtml(session.title ?? card?.title ?? session.taskCardId)}</h2><p>${session.mainProblem ? `主要问题：${escapeHtml(session.mainProblem)}` : session.skipReason ? `记录原因：${escapeHtml(session.skipReason)}` : "尚无复盘问题记录"}</p></div>
    <div class="history-summary"><span>${escapeHtml(session.structureName ?? card?.structureName ?? "结构未知")}</span><strong>${session.observableImprovement === true ? "重讲有改善" : session.completionStatus === "completed" ? "已完成重讲" : "未进入重讲"}</strong></div>
    <button class="icon-button" type="button" data-action="open-history-session" data-session-id="${escapeHtml(session.sessionId)}" title="查看记录" aria-label="查看训练记录">${icon("chevronRight")}</button>
  </article>`;
}

function renderHistory() {
  const filtered = filterHistory(state.sessions, state.historyFilters);
  const problems = uniqueProblems();
  const content = `
    <div class="page-heading"><div><p class="eyebrow">本地训练档案</p><h1>训练历史</h1><p>查看题卡版本、来源、笔记、两次录音、分项自评和唯一改进目标。</p></div><div class="library-count"><strong>${filtered.length}</strong><span>/ ${state.sessions.length} 条</span></div></div>
    <details class="history-filters" open><summary>${icon("filter")}筛选训练记录</summary><div class="filter-grid">
      <label class="search-field">${icon("search")}<input type="search" placeholder="搜索任务或问题" value="${escapeHtml(state.historyFilters.query)}" data-history-filter="query"></label>
      <label><span>场景</span><select data-history-filter="scene"><option value="">全部场景</option>${Object.entries(SCENES).map(([id, item]) => `<option value="${id}"${selected(state.historyFilters.scene, id)}>${escapeHtml(item.label)}</option>`).join("")}</select></label>
      <label><span>领域</span><select data-history-filter="domain"><option value="">全部领域</option>${Object.entries(DOMAINS).map(([id, item]) => `<option value="${id}"${selected(state.historyFilters.domain, id)}>${escapeHtml(item.label)}</option>`).join("")}</select></label>
      <label><span>任务类型</span><select data-history-filter="taskType"><option value="">全部类型</option>${Object.entries(TASK_TYPES).map(([id, label]) => `<option value="${id}"${selected(state.historyFilters.taskType, id)}>${escapeHtml(label)}</option>`).join("")}</select></label>
      <label><span>结构</span><select data-history-filter="structureId"><option value="">全部结构</option>${Object.entries(STRUCTURES).map(([id, item]) => `<option value="${id}"${selected(state.historyFilters.structureId, id)}>${escapeHtml(item.label)}</option>`).join("")}</select></label>
      <label><span>难度</span><select data-history-filter="difficulty"><option value="">全部难度</option>${[1, 2, 3, 4, 5].map((value) => `<option value="${value}"${selected(state.historyFilters.difficulty, String(value))}>L${value}</option>`).join("")}</select></label>
      <label><span>是否重讲</span><select data-history-filter="retry"><option value="">全部</option><option value="yes"${selected(state.historyFilters.retry, "yes")}>已重讲</option><option value="no"${selected(state.historyFilters.retry, "no")}>未重讲</option></select></label>
      <label><span>主要问题</span><select data-history-filter="problem"><option value="">全部问题</option>${problems.map((value) => `<option value="${escapeHtml(value)}"${selected(state.historyFilters.problem, value)}>${escapeHtml(value)}</option>`).join("")}</select></label>
      <label><span>迁移建议</span><select data-history-filter="migration"><option value="">全部</option><option value="yes"${selected(state.historyFilters.migration, "yes")}>需要迁移</option><option value="no"${selected(state.historyFilters.migration, "no")}>无需迁移</option></select></label>
      <label><span>完成状态</span><select data-history-filter="completionStatus"><option value="">全部状态</option><option value="completed"${selected(state.historyFilters.completionStatus, "completed")}>完整闭环</option><option value="skipped"${selected(state.historyFilters.completionStatus, "skipped")}>已换题</option><option value="abandoned"${selected(state.historyFilters.completionStatus, "abandoned")}>未完成</option></select></label>
      <button class="button button-ghost" type="button" data-action="clear-history-filters">清除筛选</button>
    </div></details>
    ${filtered.length ? `<div class="history-list">${filtered.map(renderHistoryItem).join("")}</div>` : `<section class="empty-state"><div>${icon("history")}</div><h2>${state.sessions.length ? "没有匹配的训练记录" : "还没有训练记录"}</h2><p>${state.sessions.length ? "调整筛选条件后再试。" : "完成一次准备、表达、自评和重讲后，记录会出现在这里。"}</p><button class="button button-primary" type="button" data-action="navigate" data-view="home">开始训练</button></section>`}
  `;
  return renderShell(content, { title: "训练历史" });
}

function renderProtocolCoverage(counts) {
  const maximum = Math.max(1, ...Object.values(counts));
  return `<div class="protocol-grid">${Object.entries(PROTOCOLS).map(([id, protocol]) => { const count = counts[id] ?? 0; return `<div><span>${escapeHtml(protocol.label)}</span><strong>${count}</strong><progress value="${count}" max="${maximum}" aria-label="${escapeHtml(protocol.label)} ${count} 次"></progress><small>${escapeHtml(protocol.description)}</small></div>`; }).join("")}</div>`;
}

function renderAbility() {
  const stats = calculateStats(state.sessions, TASK_CARDS, METRICS);
  const metricEntries = Object.entries(stats.metrics).sort((left, right) => left[1].average - right[1].average);
  const content = `
    <div class="page-heading"><div><p class="eyebrow">能力档案</p><h1>看覆盖与问题，不看笼统总分</h1><p>趋势来自你的分项自评和重讲观察，不进行心理、人格或天赋推断。</p></div><div class="headline-stat"><span>重讲改善率</span><strong>${stats.improvementRate}%</strong><small>${stats.retryCount} 次可比较重讲</small></div></div>
    <section class="focus-band ability-focus"><div class="focus-icon">${icon("target")}</div><div><p class="eyebrow">下周建议训练重点</p><h2>${escapeHtml(stats.focus.label)}</h2><p>${escapeHtml(stats.focus.reason)}</p></div><button class="button button-primary" type="button" data-action="start-focus">开始相关训练${icon("arrowRight")}</button></section>
    <div class="ability-grid">
      <section class="dashboard-section wide"><div class="section-heading"><div><p class="eyebrow">滚动覆盖</p><h2>十类表达场景</h2></div><div class="range-legend"><span><i class="legend-dot seven"></i>7 天</span><span><i class="legend-dot thirty"></i>30 天</span></div></div><div class="dual-coverage">${Object.entries(SCENES).map(([id, scene]) => { const seven = stats.sceneCounts7[id] ?? 0; const thirty = stats.sceneCounts30[id] ?? 0; const max = Math.max(1, ...Object.values(stats.sceneCounts30)); return `<div><span>${escapeHtml(scene.label)}</span><div><progress class="progress-seven" value="${seven}" max="${max}" aria-label="7 天 ${seven} 次"></progress><progress class="progress-thirty" value="${thirty}" max="${max}" aria-label="30 天 ${thirty} 次"></progress></div><strong>${seven} / ${thirty}</strong></div>`; }).join("")}</div></section>
      <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">全部完成记录</p><h2>四类训练协议</h2></div></div>${renderProtocolCoverage(stats.protocolCounts)}</section>
      <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">质量辅助指标</p><h2>闭环稳定性</h2></div></div><div class="large-metrics"><div><strong>${stats.completeLoops28}</strong><span>28 天完整闭环</span></div><div><strong>${stats.sourceComplianceRate}%</strong><span>来源要求达成</span></div><div><strong>${stats.structureDiversity30}</strong><span>30 天结构种类</span></div><div><strong>${stats.streak.best}</strong><span>最长连续天数</span></div></div></section>
    </div>
    <section class="dashboard-section metric-trends"><div class="section-heading"><div><p class="eyebrow">滚动 30 天</p><h2>分项指标趋势</h2></div><span>至少 2 次后用于训练建议</span></div>${metricEntries.length ? `<div class="metric-table">${metricEntries.map(([id, value]) => `<div><div><strong>${escapeHtml(METRICS[id]?.label ?? id)}</strong><small>${value.count} 次观察</small></div><progress value="${value.average}" max="5" aria-label="平均 ${value.average} 分"></progress><span>${value.average}</span><em class="${value.change > 0 ? "positive-text" : value.change < 0 ? "negative-text" : ""}">${value.change > 0 ? "+" : ""}${value.change.toFixed(1)}</em></div>`).join("")}</div>` : `<div class="empty-inline"><p>完成至少两次训练后，这里会显示分项趋势。</p></div>`}</section>
    <section class="dashboard-section problems-section"><div class="section-heading"><div><p class="eyebrow">只识别重复描述</p><h2>反复出现的问题</h2></div></div>${stats.problems.length ? `<div class="problem-list">${stats.problems.map((item) => `<div><span>${escapeHtml(item.problem)}</span><strong>${item.count} 次</strong>${item.count >= 3 ? `<em>建议强化</em>` : ""}</div>`).join("")}</div>` : `<div class="empty-inline"><p>还没有可汇总的重复问题。</p></div>`}</section>
  `;
  return renderShell(content, { title: "能力档案" });
}

function renderSettings() {
  const content = `
    <div class="page-heading"><div><p class="eyebrow">设置</p><h1>训练与本地数据</h1><p>调整日常强度、计时体验、录音保留和数据迁移。</p></div></div>
    <div class="settings-layout">
      <section class="settings-section"><div class="settings-head"><div>${icon("target")}</div><span><h2>训练偏好</h2><p>用于指定场景等自适应训练和首页默认选项；无筛选的今日训练使用固定年度计划。</p></span></div>
        <div class="setting-row range-setting"><label for="level-range"><span>当前训练等级</span><small>L1 熟悉生活题 · L5 多约束迁移</small></label><div><strong id="level-value">L${state.settings.level}</strong><input id="level-range" type="range" min="1" max="5" step="1" value="${state.settings.level}" data-setting="level"></div></div>
        <div class="setting-row stacked"><div><span>首页默认模式</span><small>随时可以在开始前临时切换。</small></div>${renderModeSelector(state.settings.defaultMode, "setting-mode")}</div>
      </section>
      <section class="settings-section"><div class="settings-head"><div>${icon("clock")}</div><span><h2>执行体验</h2><p>计时到点只提示，不强制停止。</p></span></div>
        ${renderToggle("soundEnabled", "计时提示音", "阶段到点时播放一次温和提示。")}
        ${renderToggle("reducedMotion", "减少动态效果", "关闭非必要过渡和闪动。")}
        ${renderToggle("keepRecordings", "完成后保留录音", "关闭后，本次总结离开时删除两次录音，仅保留文字记录。")}
      </section>
      <section class="settings-section data-section"><div class="settings-head"><div>${icon("archive")}</div><span><h2>本地数据</h2><p>训练笔记与录音默认保存在当前浏览器。</p></span></div>
        <div class="storage-summary"><div><span>训练记录</span><strong>${state.storage.sessionCount}</strong></div><div><span>本地录音</span><strong>${state.storage.recordingCount}</strong></div><div><span>录音占用</span><strong>${formatBytes(state.storage.recordingBytes)}</strong></div></div>
        <div class="data-actions"><button class="button button-secondary" type="button" data-action="export-data">${icon("download")}导出 JSON</button><label class="button button-secondary file-button">${icon("upload")}导入 JSON<input type="file" accept="application/json,.json" data-import-file></label>${state.installPrompt ? `<button class="button button-secondary" type="button" data-action="install-app">${icon("download")}安装到设备</button>` : ""}<button class="button button-danger-ghost" type="button" data-action="open-clear-data">${icon("trash")}清除全部本地数据</button></div>
        <p class="data-note">JSON 导出不包含录音文件。导入会合并训练记录，并覆盖设置与收藏。</p>
      </section>
      <section class="settings-section privacy-section"><div class="settings-head"><div>${icon("info")}</div><span><h2>隐私边界</h2><p>本应用不主动收集行为数据，也不接入广告或分析服务。</p></span></div><p>训练笔记与录音默认仅保存在当前设备的浏览器存储中。静态服务器仍可能处理提供网页所必需的基础访问信息，例如 IP 地址和 User-Agent；具体取决于部署环境。</p><p>麦克风只在你点击录音后请求权限。关闭页面前请先停止录音。</p></section>
    </div>
  `;
  return renderShell(content, { title: "设置" });
}

function renderToggle(id, label, description) {
  return `<label class="setting-row toggle-row"><span><b>${escapeHtml(label)}</b><small>${escapeHtml(description)}</small></span><input type="checkbox" role="switch" data-setting="${id}"${checked(state.settings[id])}><i aria-hidden="true"></i></label>`;
}

function renderModal() {
  if (!state.modal) {
    return "";
  }
  if (state.modal.type === "swap") {
    return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="关闭">${icon("x")}</button><p class="eyebrow">本轮仅可换一次</p><h2 id="modal-title">为什么当前题目不适合？</h2><p>原因会作为题卡质量和编排信号保存，不影响连续完成。</p><label class="field"><span>换题原因</span><select data-swap-reason><option value="">请选择</option><option value="已熟悉">已熟悉</option><option value="资料不可得">资料不可得</option><option value="当前不适合">当前不适合</option><option value="题目质量问题">题目质量问题</option><option value="其他">其他</option></select></label><label class="field"><span>补充说明（可选）</span><textarea rows="3" data-swap-note placeholder="简要记录具体原因"></textarea></label><div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">保留当前题</button><button class="button button-primary" type="button" data-action="confirm-swap">记录原因并换题</button></div></section></div>`;
  }
  if (state.modal.type === "abandon") {
    return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="关闭">${icon("x")}</button><p class="eyebrow">如实记录，不惩罚中断</p><h2 id="modal-title">结束本次训练？</h2><p>当前笔记仍会保存为未完成记录，下一次编排会适当降低时长或难度。</p><label class="field"><span>未完成原因</span><select data-abandon-reason><option value="">请选择</option><option value="时间不足">时间不足</option><option value="当前环境不适合">当前环境不适合</option><option value="资料不足">资料不足</option><option value="任务难度不合适">任务难度不合适</option><option value="身体或精力状态">身体或精力状态</option><option value="其他">其他</option></select></label><label class="field"><span>补充说明（可选）</span><textarea rows="3" data-abandon-note></textarea></label><div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">继续训练</button><button class="button button-danger" type="button" data-action="confirm-abandon">结束并保存记录</button></div></section></div>`;
  }
  if (state.modal.type === "card") {
    const card = cardMap.get(state.modal.cardId);
    if (!card) {
      return "";
    }
    return `<div class="modal-backdrop" data-action="close-modal"><section class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="关闭">${icon("x")}</button><div class="card-meta"><span class="scene-tag scene-${card.scene}">${escapeHtml(card.sceneLabel)}</span><span class="domain-tag domain-${card.domain}">${escapeHtml(card.domainLabel)}</span><span>L${card.difficulty}</span><span>${escapeHtml(PROTOCOLS[card.protocol].label)}</span></div><p class="topic-label">${escapeHtml(card.topicLabel)}</p><h2 id="modal-title">${escapeHtml(card.title)}</h2><div class="modal-facts"><div><span>目标受众</span><p>${escapeHtml(card.audience)}</p></div><div><span>沟通目的</span><p>${escapeHtml(card.purpose)}</p></div><div><span>主要能力</span><p>${escapeHtml(card.primarySkill)}</p></div><div><span>预计时长</span><p>${card.estimatedMinutes} 分钟</p></div></div><section><h3>完成标准</h3><ul class="check-list compact">${card.completionCriteria.map((item) => `<li>${icon("check")}<span>${escapeHtml(item)}</span></li>`).join("")}</ul></section><p class="modal-boundary">具体检索问题和推荐结构将在对应训练阶段开放。</p><div class="modal-actions"><button class="button button-ghost" type="button" data-action="toggle-favorite" data-card-id="${card.id}">${icon(state.favorites.has(card.id) ? "heartFilled" : "heart")}${state.favorites.has(card.id) ? "取消收藏" : "收藏题卡"}</button><button class="button button-primary" type="button" data-action="start-card" data-card-id="${card.id}">${icon("play")}开始这张题卡</button></div></section></div>`;
  }
  if (state.modal.type === "history") {
    const session = state.sessions.find((item) => item.sessionId === state.modal.sessionId) ?? (state.activeSession?.sessionId === state.modal.sessionId ? state.activeSession : null);
    return session ? renderHistoryModal(session) : "";
  }
  if (state.modal.type === "clear") {
    return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="关闭">${icon("x")}</button><p class="eyebrow danger-text">不可撤销</p><h2 id="modal-title">清除全部本地数据？</h2><p>训练记录、当前进度、收藏、设置和本地录音都会从这个浏览器中删除。</p><label class="field"><span>输入“清除”确认</span><input type="text" data-clear-confirm autocomplete="off"></label><div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">取消</button><button class="button button-danger" type="button" data-action="confirm-clear-data">永久清除</button></div></section></div>`;
  }
  return "";
}

function renderHistoryModal(session) {
  const card = cardMap.get(session.taskCardId);
  const scoreRows = card
    ? card.reviewMetricIds
        .map((id) => {
          const first = Number.isFinite(session.selfScores?.[id]) ? String(session.selfScores[id]) : "—";
          const retry = Number.isFinite(session.retryScores?.[id]) ? String(session.retryScores[id]) : "—";
          return `<tr><th>${escapeHtml(METRICS[id]?.label ?? id)}</th><td>${escapeHtml(first)}</td><td>${escapeHtml(retry)}</td></tr>`;
        })
        .join("")
    : "";
  const statusToken = safeCompletionStatus(session.completionStatus);
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal modal-record" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="关闭">${icon("x")}</button><div class="record-title"><div><p class="eyebrow">${formatDateTime(session.completedAt ?? session.startedAt)} · 题卡 ${escapeHtml(session.taskCardId)} v${escapeHtml(String(session.taskCardVersion ?? 1))}</p><h2 id="modal-title">${escapeHtml(session.title ?? card?.title ?? session.taskCardId)}</h2></div><span class="status-badge status-${statusToken}">${session.completionStatus === "completed" ? "完整闭环" : session.completionStatus === "skipped" ? "已换题" : "未完成"}</span></div>
    <div class="record-grid"><section><h3>任务元数据</h3><dl><div><dt>场景</dt><dd>${escapeHtml(session.sceneLabel ?? card?.sceneLabel ?? "—")}</dd></div><div><dt>领域</dt><dd>${escapeHtml(session.domainLabel ?? card?.domainLabel ?? "—")}</dd></div><div><dt>协议</dt><dd>${escapeHtml(PROTOCOLS[session.protocol]?.label ?? "—")}</dd></div><div><dt>结构</dt><dd>${escapeHtml(session.structureName ?? card?.structureName ?? "—")}</dd></div><div><dt>模式</dt><dd>${session.mode === "quick" ? "快速模式" : "完整闭环"}</dd></div></dl></section><section><h3>本次复盘</h3><dl><div><dt>主要问题</dt><dd>${escapeHtml(session.mainProblem || "—")}</dd></div><div><dt>有效动作</dt><dd>${escapeHtml(session.effectiveAction || "—")}</dd></div><div><dt>唯一目标</dt><dd>${escapeHtml(session.retryFocus || "—")}</dd></div><div><dt>可观察改善</dt><dd>${session.observableImprovement == null ? "—" : session.observableImprovement ? "是" : "否"}</dd></div><div><dt>迁移建议</dt><dd>${session.migrationRecommended ? "需要" : "不需要"}</dd></div></dl></section></div>
    ${session.skipReason ? `<section class="record-section"><h3>中断或换题原因</h3><p>${escapeHtml(session.skipReason)}</p></section>` : ""}
    ${session.sources?.length ? `<section class="record-section"><h3>来源记录</h3><div class="record-sources">${session.sources.map((source) => `<div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.url || "未记录链接")}</small><p>${escapeHtml(source.support)}</p></div>`).join("")}</div></section>` : ""}
    ${Object.keys(session.userNotes ?? {}).length ? `<section class="record-section"><h3>整理笔记</h3><div class="record-notes">${Object.entries(session.userNotes).filter(([, value]) => value?.trim()).map(([key, value]) => `<div><strong>${escapeHtml(key)}</strong><p>${escapeHtml(value)}</p></div>`).join("")}</div></section>` : ""}
    ${card && session.completionStatus === "completed" ? `<section class="record-section"><h3>分项自评对比</h3><div class="table-scroll"><table><thead><tr><th>指标</th><th>首次</th><th>重讲</th></tr></thead><tbody>${scoreRows}</tbody></table></div></section>` : ""}
    <section class="record-section"><h3>录音对比</h3><div class="recording-compare"><div><h4>第一次表达</h4>${session.recordingFirstId ? `<div class="audio-slot wide" data-recording-id="${escapeHtml(session.recordingFirstId)}"><span>正在读取录音…</span></div>` : `<p>未保留录音</p>`}</div><div><h4>针对性重讲</h4>${session.recordingRetryId ? `<div class="audio-slot wide" data-recording-id="${escapeHtml(session.recordingRetryId)}"><span>正在读取录音…</span></div>` : `<p>未保留录音</p>`}</div></div></section>
    <div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">关闭</button>${card ? `<button class="button button-primary" type="button" data-action="start-card" data-card-id="${card.id}">${icon("rotate")}再练这张题卡</button>` : ""}</div></section></div>`;
}

function renderOnboarding() {
  return `<div class="modal-backdrop onboarding-backdrop"><section class="modal onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" data-modal-panel><img src="/icons/icon.svg" alt="" width="58" height="58"><p class="eyebrow">首次使用</p><h2 id="onboarding-title">系统给路径，你完成思考</h2><div class="principle-list"><div><span>01</span><p><strong>不提供主题答案</strong>检索、判断和结论由你完成。</p></div><div><span>02</span><p><strong>第一次用于暴露问题</strong>每轮只选一个问题立即重讲。</p></div><div><span>03</span><p><strong>数据留在当前设备</strong>笔记与录音默认不上传。</p></div></div><div class="onboarding-choice"><span>首页默认训练模式</span>${renderModeSelector(state.settings.defaultMode, "onboarding-mode")}</div><button class="button button-primary button-large" type="button" data-action="complete-onboarding">进入今日训练${icon("arrowRight")}</button></section></div>`;
}

function render() {
  state.renderVersion += 1;
  for (const url of state.audioUrls) {
    URL.revokeObjectURL(url);
  }
  state.audioUrls = [];
  applySettings();
  const view = state.view;
  if (view === "home") {
    root.innerHTML = renderHome();
  } else if (view === "train") {
    root.innerHTML = renderTraining();
  } else if (view === "library") {
    root.innerHTML = renderLibrary();
  } else if (view === "history") {
    root.innerHTML = renderHistory();
  } else if (view === "ability") {
    root.innerHTML = renderAbility();
  } else {
    root.innerHTML = renderSettings();
  }
  document.title = `${root.querySelector(".topbar-title")?.textContent ?? "讲明白"} · 讲明白`;
  hydrateAudioPlayers(state.renderVersion);
  updateClock();
  const modal = root.querySelector("[data-modal-panel]");
  const shell = root.querySelector(".app-shell");
  const skipLink = document.querySelector(".skip-link");
  const focusRequest = state.pendingFocus;
  const announcement = state.pendingAnnouncement;
  state.pendingFocus = null;
  state.pendingAnnouncement = "";
  if (modal) {
    shell?.setAttribute("inert", "");
    shell?.setAttribute("aria-hidden", "true");
    skipLink?.setAttribute("inert", "");
    skipLink?.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      if (!modal.isConnected) {
        return;
      }
      const active = document.activeElement;
      if (active && modal.contains(active)) {
        return;
      }
      const requested = focusRequest?.type === "control" ? findDescribedControl(focusRequest.descriptor) : null;
      const first = requested && modal.contains(requested) ? requested : focusableElements(modal)[0] ?? modal;
      if (!first.hasAttribute("tabindex")) {
        first.setAttribute("tabindex", "-1");
      }
      first.focus({ preventScroll: true });
    }, 0);
  } else {
    shell?.removeAttribute("inert");
    shell?.removeAttribute("aria-hidden");
    skipLink?.removeAttribute("inert");
    skipLink?.removeAttribute("aria-hidden");
    if (focusRequest?.type === "main") {
      setTimeout(focusMainContent, 0);
    } else if (focusRequest?.type === "control") {
      setTimeout(() => findDescribedControl(focusRequest.descriptor)?.focus({ preventScroll: true }), 0);
    }
  }
  if (announcement) {
    const liveRegion = document.querySelector("[data-stage-announcement]");
    if (liveRegion) {
      liveRegion.textContent = "";
      setTimeout(() => {
        if (liveRegion.isConnected) {
          liveRegion.textContent = announcement;
        }
      }, 0);
    }
  }
}

async function hydrateAudioPlayers(version) {
  const slots = [...root.querySelectorAll("[data-recording-id]")];
  await Promise.all(
    slots.map(async (slot) => {
      const recording = await loadRecording(slot.dataset.recordingId);
      if (version !== state.renderVersion || !slot.isConnected) {
        return;
      }
      if (!recording?.blob) {
        slot.innerHTML = "<span>录音未找到或已被清理。</span>";
        return;
      }
      const url = URL.createObjectURL(recording.blob);
      state.audioUrls.push(url);
      slot.innerHTML = `<audio controls preload="metadata" src="${escapeHtml(url)}">当前浏览器不支持音频播放。</audio>`;
    }),
  );
}

function updateClock() {
  const session = state.activeSession;
  if (!session?.timer || state.view !== "train" || ["preview", "complete"].includes(session.stage)) {
    return;
  }
  const remaining = timerRemaining(session.timer);
  const elapsed = currentElapsed(session.timer);
  const text = root.querySelector("[data-timer-text]");
  const progress = root.querySelector("[data-timer-progress]");
  if (text) {
    text.textContent = `${remaining < 0 ? "+" : ""}${formatDuration(remaining)}`;
  }
  if (progress) {
    progress.max = Math.max(session.timer.durationSeconds, elapsed, 1);
    progress.value = Math.min(elapsed, progress.max);
  }
  root.querySelector(".stage-timer")?.classList.toggle("is-over", remaining < 0);
  if (remaining <= 0 && session.timer.runningSince && !session.timer.notifiedAt) {
    session.timer.notifiedAt = Date.now();
    scheduleActiveSave();
    if (state.settings.soundEnabled) {
      playGentleTone();
    }
    showToast("目标时间已到，请完成当前句并自然收束。", "default");
  }
}

function playGentleTone() {
  try {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(520, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
    oscillator.addEventListener("ended", () => context.close());
  } catch {
    // Audio cues are optional; visual timer feedback remains available.
  }
}

async function startNewSession(card, options = {}) {
  if (state.activeSession && state.activeSession.completionStatus === "in_progress") {
    state.modal = { type: "abandon", pendingCardId: card.id };
    render();
    showToast("先结束当前训练，再开始新题。", "danger");
    return;
  }
  const nextSession = createSession(card, {
    mode: options.mode ?? state.homeMode,
    selectionReason: options.selectionReason ?? "指定题卡",
  });
  await saveActiveNow(nextSession);
  state.activeSession = nextSession;
  navigate("train");
}

async function selectAndStart({ requestedScene = state.homeScene, mode = state.homeMode } = {}) {
  let card;
  let selectionReason;
  if (requestedScene) {
    const result = selectTask({
      cards: TASK_CARDS,
      history: state.sessions,
      settings: state.settings,
      requestedScene,
    });
    card = result.card;
    selectionReason = result.reason;
  } else {
    const annualPlanDate = dateKey(new Date());
    const entry = annualEntryForDate(annualPlanDate);
    if (!entry) {
      throw new Error("今天没有可用的年度题卡");
    }
    card = entry.card;
    const repeatedToday = state.sessions.some(
      (session) =>
        session.completionStatus === "completed" &&
        dateKey(session.completedAt) === annualPlanDate &&
        (session.annualPlanDate === annualPlanDate || session.selectionReason?.startsWith("年度固定计划")),
    );
    const reasonParts = ["年度固定计划"];
    if (entry.date !== annualPlanDate) {
      reasonParts.push("闰日加练");
    }
    if (repeatedToday) {
      reasonParts.push("当日加练");
    }
    reasonParts.push(`第 ${entry.dayNumber} / 365 题`, annualPlanDate);
    selectionReason = reasonParts.join(" · ");
    const nextSession = createSession(card, {
      mode,
      selectionReason,
      annualPlanDate,
      annualPlanDayNumber: entry.dayNumber,
    });
    await saveActiveNow(nextSession);
    state.activeSession = nextSession;
    navigate("train");
    return;
  }
  const nextSession = createSession(card, {
    mode,
    selectionReason,
  });
  await saveActiveNow(nextSession);
  state.activeSession = nextSession;
  navigate("train");
}

async function skipSensitiveTask() {
  if (recordingBusy()) {
    showToast("录音仍在处理，请稍候。", "danger");
    return;
  }
  const current = state.activeSession;
  const currentCard = cardForSession(current);
  if (!current || current.stage !== "preview" || !cardIsSensitive(currentCard)) {
    return;
  }
  const skippedIds = [...new Set([...(current.sensitiveSkippedCardIds ?? []), current.taskCardId])];
  let nextCard;
  let selectionReason;
  let annualPlanDate = null;
  let annualPlanDayNumber = null;
  if (current.annualPlanDate || current.selectionReason?.startsWith("年度固定计划")) {
    annualPlanDate = current.annualPlanDate
      || current.selectionReason.match(/\d{4}-\d{2}-\d{2}/)?.[0]
      || dateKey(current.startedAt);
    const plan = annualPlanForDate(annualPlanDate);
    const entry = annualPlanAlternative(plan, current.taskCardId, skippedIds);
    annualPlanDayNumber = current.annualPlanDayNumber
      ?? plan.find((item) => item.cardId === current.taskCardId)?.dayNumber
      ?? entry?.dayNumber
      ?? null;
    nextCard = entry?.card;
    selectionReason = entry
      ? `年度固定计划 · 自愿跳过敏感任务后的替代题 · 原第 ${annualPlanDayNumber} / 365 题 · ${annualPlanDate}`
      : "";
  } else {
    const result = selectTask({
      cards: TASK_CARDS,
      history: state.sessions,
      settings: state.settings,
      requestedScene: state.homeScene || null,
      excludedIds: skippedIds,
    });
    nextCard = result.card;
    selectionReason = `${result.reason} · 自愿跳过敏感任务后的替代题`;
  }
  if (!nextCard) {
    showToast("暂时没有其他可用题卡，请返回题库选择。", "danger");
    return;
  }
  const nextSession = createSession(nextCard, {
    mode: current.mode,
    selectionReason,
    swapUsed: current.swapUsed,
    sensitiveSkipCount: (current.sensitiveSkipCount ?? 0) + 1,
    sensitiveSkippedCardIds: skippedIds,
    annualPlanDate,
    annualPlanDayNumber,
  });
  await saveActiveNow(nextSession);
  state.activeSession = nextSession;
  render();
  showToast("已立即换题；无需说明原因，也未占用普通换题额度。", "default");
}

async function swapCurrentTask() {
  if (recordingBusy()) {
    showToast("录音仍在处理，请稍候。", "danger");
    return;
  }
  const reasonSelect = root.querySelector("[data-swap-reason]");
  const note = root.querySelector("[data-swap-note]")?.value.trim();
  const reason = reasonSelect?.value;
  if (!reason) {
    showToast("请选择换题原因。", "danger");
    reasonSelect?.focus();
    return;
  }
  const current = state.activeSession;
  const skipped = {
    ...current,
    completionStatus: "skipped",
    completedAt: new Date().toISOString(),
    skipReason: note ? `${reason}：${note}` : reason,
  };
  cancelScheduledActiveSave();
  await activeSaveTail;
  const archived = await archiveSessionWithoutRecordings(skipped, {
    clearActive: true,
    retention: "discarded_incomplete",
  });
  state.sessions.push(archived);
  const result = selectTask({
    cards: TASK_CARDS,
    history: state.sessions,
    settings: state.settings,
    excludedIds: [...new Set([current.taskCardId, ...(current.sensitiveSkippedCardIds ?? [])])],
  });
  state.activeSession = createSession(result.card, {
    mode: current.mode,
    selectionReason: result.reason,
    swapUsed: true,
  });
  state.modal = null;
  state.modalOpener = null;
  await saveActiveNow(state.activeSession);
  render();
  showToast("已记录原因并更换题目。", "default");
}

async function abandonCurrent() {
  if (recordingBusy()) {
    showToast("录音仍在处理，请稍候。", "danger");
    return;
  }
  const reasonSelect = root.querySelector("[data-abandon-reason]");
  const note = root.querySelector("[data-abandon-note]")?.value.trim();
  const reason = reasonSelect?.value;
  if (!reason) {
    showToast("请选择未完成原因。", "danger");
    reasonSelect?.focus();
    return;
  }
  const pendingCardId = state.modal?.pendingCardId;
  const abandoned = {
    ...state.activeSession,
    completionStatus: "abandoned",
    completedAt: new Date().toISOString(),
    skipReason: note ? `${reason}：${note}` : reason,
  };
  cancelScheduledActiveSave();
  await activeSaveTail;
  const archived = await archiveSessionWithoutRecordings(abandoned, {
    clearActive: true,
    retention: "discarded_incomplete",
  });
  state.sessions.push(archived);
  state.activeSession = null;
  state.modal = null;
  state.modalOpener = null;
  state.storage = await storageSummary();
  if (pendingCardId && cardMap.has(pendingCardId)) {
    await startNewSession(cardMap.get(pendingCardId));
  } else {
    navigate("home");
  }
}

function requestStageFocus(session) {
  state.pendingFocus = { type: "main" };
  state.pendingAnnouncement = `已进入${stageLabel(session.protocol, session.stage)}阶段`;
}

async function advanceCurrentStage() {
  if (recordingBusy()) {
    showToast("请先停止录音并等待保存完成。", "danger");
    return;
  }
  const session = state.activeSession;
  const card = cardForSession(session);
  const validation = validateStage(session, card);
  if (!validation.valid) {
    showToast(validation.message, "danger");
    return;
  }
  state.activeSession = advanceStage(session);
  requestStageFocus(state.activeSession);
  await saveActiveNow(state.activeSession);
  render();
  window.scrollTo({ top: 0, behavior: state.settings.reducedMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

async function finishSession() {
  if (recordingBusy()) {
    showToast("请先停止录音并等待保存完成。", "danger");
    return;
  }
  const session = state.activeSession;
  const card = cardForSession(session);
  const validation = validateStage(session, card);
  if (!validation.valid) {
    showToast(validation.message, "danger");
    return;
  }
  const completed = advanceStage(session);
  completed.completionStatus = "completed";
  completed.completedAt = new Date().toISOString();
  completed.retryCompletedWithoutRecording = Boolean(completed.recordingUnavailable?.retry);
  cancelScheduledActiveSave();
  await activeSaveTail;
  try {
    await saveCompletedSession(completed);
  } catch (error) {
    showToast(error?.message || "完成记录保存失败，请重试。", "danger");
    return;
  }
  state.activeSession = completed;
  requestStageFocus(completed);
  const existingIndex = state.sessions.findIndex((item) => item.sessionId === completed.sessionId);
  if (existingIndex >= 0) {
    state.sessions[existingIndex] = completed;
  } else {
    state.sessions.push(completed);
  }
  state.storage = await storageSummary();
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function closeCompletedSession() {
  if (recordingBusy()) {
    showToast("录音仍在保存，请稍候。", "danger");
    return;
  }
  cancelScheduledActiveSave();
  await activeSaveTail;
  const session = state.activeSession;
  if (session && !state.settings.keepRecordings) {
    const stripped = await archiveSessionWithoutRecordings(session, {
      clearActive: true,
      retention: "discarded_by_setting",
    });
    const index = state.sessions.findIndex((item) => item.sessionId === stripped.sessionId);
    if (index >= 0) {
      state.sessions[index] = stripped;
    }
  } else {
    await clearActiveSession();
  }
  state.activeSession = null;
  state.storage = await storageSummary();
  navigate("home");
}

function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function startRecording(slot) {
  if (state.recordingRuntime) {
    return;
  }
  const session = state.activeSession;
  if (!session || !["first", "retry"].includes(slot)) {
    showToast("当前训练状态无法开始录音。", "danger");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast("当前浏览器不支持本地录音，请勾选设备无法录音。", "danger");
    return;
  }
  let stream = null;
  let recorder = null;
  const runtime = {
    slot,
    recorder: null,
    stream: null,
    chunks: [],
    sessionId: session.sessionId,
    status: "requesting",
    cancelled: false,
  };
  state.recordingRuntime = runtime;
  render();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    runtime.stream = stream;
    if (state.recordingRuntime !== runtime || state.activeSession?.sessionId !== session.sessionId) {
      throw new Error("当前训练已变化");
    }
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks = runtime.chunks;
    runtime.recorder = recorder;
    runtime.status = "starting";
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });
    recorder.addEventListener("stop", async () => {
      let message = "";
      let tone = "default";
      try {
        if (runtime.cancelled) {
          return;
        }
        runtime.status = "saving";
        const current = state.activeSession;
        if (current?.sessionId !== runtime.sessionId) {
          throw new Error("当前训练已变化，录音未保存");
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          throw new Error("录音内容为空");
        }
        const recordingId = `${runtime.sessionId}-${slot}-${Date.now()}`;
        cancelScheduledActiveSave();
        await activeSaveTail;
        const nextSession = await replaceActiveSessionRecording({
          session: current,
          slot,
          recordingId,
          blob,
        });
        if (state.activeSession?.sessionId !== runtime.sessionId) {
          throw new Error("当前训练已变化，录音未连接到进度");
        }
        state.activeSession = nextSession;
        state.storage = await storageSummary();
        message = "录音已保存在当前设备。";
      } catch (error) {
        tone = "danger";
        message = error?.message === "录音内容为空" ? "没有检测到可保存的录音，请重新尝试。" : "录音保存失败，请重新尝试。";
      } finally {
        stopMediaStream(stream);
        if (state.recordingRuntime === runtime) {
          state.recordingRuntime = null;
        }
        render();
        if (message) {
          showToast(message, tone);
        }
      }
    });
    if (!state.activeSession.timer?.runningSince) {
      const timedSession = toggleTimer(state.activeSession);
      await saveActiveNow(timedSession);
      state.activeSession = timedSession;
    }
    recorder.start(250);
    runtime.status = "recording";
    render();
  } catch (error) {
    if (runtime) {
      runtime.cancelled = true;
    }
    if (recorder?.state === "recording") {
      try {
        recorder.stop();
      } catch {
        // The stream is stopped below even if the recorder cannot transition cleanly.
      }
    }
    stopMediaStream(stream);
    if (state.recordingRuntime === runtime) {
      state.recordingRuntime = null;
    }
    render();
    showToast(error?.name === "NotAllowedError" ? "未获得麦克风权限。你可以调整权限后重试。" : "无法启动录音，请检查麦克风。", "danger");
  }
}

function stopRecording() {
  const runtime = state.recordingRuntime;
  if (!runtime || runtime.recorder.state !== "recording") {
    return;
  }
  runtime.status = "saving";
  runtime.recorder.stop();
  render();
}

async function toggleFavorite(cardId) {
  const favorites = new Set(state.favorites);
  if (favorites.has(cardId)) {
    favorites.delete(cardId);
  } else {
    favorites.add(cardId);
  }
  await saveFavorites(favorites);
  state.favorites = favorites;
  render();
}

function openModal(modal, opener = document.activeElement) {
  state.modalOpener = describeControl(opener);
  state.modal = modal;
  render();
}

function closeModal(event) {
  if (event?.target?.closest("[data-modal-panel]") && !event.target.closest("[data-action='close-modal']")) {
    return;
  }
  const opener = state.modalOpener;
  state.modal = null;
  state.modalOpener = null;
  state.pendingFocus = opener ? { type: "control", descriptor: opener } : null;
  render();
}

async function updateSetting(id, value) {
  const settings = { ...state.settings, [id]: value };
  await saveSettings(settings);
  state.settings = settings;
  if (id === "defaultMode") {
    state.homeMode = value;
  }
  applySettings();
}

async function exportData() {
  await flushScheduledActiveSave();
  const data = await exportLocalData();
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `讲明白-本地数据-${dateKey(new Date())}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("已导出训练记录与设置，录音未包含。", "default");
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    await flushScheduledActiveSave();
    await importLocalData(data);
    [state.settings, state.sessions, state.activeSession, state.favorites, state.storage] = await Promise.all([
      loadSettings(),
      loadSessions(),
      loadActiveSession(),
      loadFavorites(),
      storageSummary(),
    ]);
    state.homeMode = state.settings.defaultMode;
    applySettings();
    render();
    showToast("数据导入完成。", "default");
  } catch (error) {
    showToast(error.message || "数据导入失败。", "danger");
  }
}

async function startFocusTraining() {
  const stats = calculateStats(state.sessions, TASK_CARDS, METRICS);
  const metricId = stats.focus.id;
  const candidates = TASK_CARDS.filter((card) => card.reviewMetricIds.includes(metricId));
  const result = selectTask({
    cards: candidates.length ? candidates : TASK_CARDS,
    history: state.sessions,
    settings: state.settings,
  });
  await startNewSession(result.card, { mode: state.homeMode, selectionReason: "当前弱项强化" });
}

root.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) {
    return;
  }
  const action = control.dataset.action;
  const exclusive = exclusiveActions.has(action);
  if (exclusive && actionInFlight) {
    return;
  }
  if (exclusive) {
    actionInFlight = true;
    control.disabled = true;
  }
  try {
  if (action === "navigate") {
    navigate(control.dataset.view);
  } else if (action === "home-mode") {
    state.homeMode = control.dataset.value;
    render();
  } else if (action === "setting-mode" || action === "onboarding-mode") {
    const onboardingMode = action === "onboarding-mode";
    await updateSetting("defaultMode", control.dataset.value);
    if (onboardingMode) {
      state.pendingFocus = { type: "control", descriptor: describeControl(control) };
    }
    render();
  } else if (action === "start-home") {
    await selectAndStart();
  } else if (action === "resume-session") {
    navigate("train");
  } else if (action === "start-training") {
    const nextSession = startTraining(state.activeSession);
    await saveActiveNow(nextSession);
    state.activeSession = nextSession;
    requestStageFocus(nextSession);
    render();
  } else if (action === "open-swap") {
    if (!state.activeSession?.swapUsed) {
      openModal({ type: "swap" }, control);
    }
  } else if (action === "skip-sensitive-task") {
    await skipSensitiveTask();
  } else if (action === "confirm-swap") {
    await swapCurrentTask();
  } else if (action === "open-abandon") {
    if (recordingBusy()) {
      showToast("请先停止录音并等待保存完成。", "danger");
    } else {
      openModal({ type: "abandon" }, control);
    }
  } else if (action === "confirm-abandon") {
    await abandonCurrent();
  } else if (action === "close-modal") {
    closeModal(event);
  } else if (action === "toggle-timer") {
    updateActive((session) => toggleTimer(session), { render: true });
  } else if (action === "extend-timer") {
    updateActive((session) => extendTimer(session), { render: true });
    showToast("本阶段已延长 5 分钟，并记录延期。", "default");
  } else if (action === "add-source") {
    updateActive((session) => ({ ...session, sources: [...(session.sources ?? []), { name: "", url: "", support: "", kind: "fact" }] }), { render: true, markNotes: true });
  } else if (action === "remove-source") {
    const index = Number(control.dataset.index);
    updateActive((session) => ({ ...session, sources: session.sources.filter((_, itemIndex) => itemIndex !== index) }), { render: true, markNotes: true });
  } else if (action === "unlock-help") {
    updateActive((session) => ({ ...session, helpLevels: { ...(session.helpLevels ?? {}), [session.stage]: Math.min(6, (session.helpLevels?.[session.stage] ?? 0) + 1) } }), { render: true });
  } else if (action === "previous-preparation") {
    updateActive((session) => {
      const previous = previousPreparationStage(session);
      requestStageFocus(previous);
      return previous;
    }, { render: true });
  } else if (action === "advance-stage") {
    await advanceCurrentStage();
  } else if (action === "start-recording") {
    await startRecording(control.dataset.slot);
  } else if (action === "stop-recording") {
    stopRecording();
  } else if (action === "reveal-feedback") {
    const validation = validateStage(state.activeSession, cardForSession());
    if (!validation.valid) {
      showToast(validation.message, "danger");
    } else {
      updateActive((session) => ({ ...session, feedbackRevealed: true }), { render: true });
    }
  } else if (action === "finish-session") {
    await finishSession();
  } else if (action === "close-complete") {
    await closeCompletedSession();
  } else if (action === "toggle-favorite") {
    await toggleFavorite(control.dataset.cardId);
  } else if (action === "open-card") {
    openModal({ type: "card", cardId: control.dataset.cardId }, control);
  } else if (action === "start-card") {
    const card = cardMap.get(control.dataset.cardId);
    if (card) {
      state.modal = null;
      await startNewSession(card, { mode: state.settings.defaultMode });
    }
  } else if (action === "clear-library-filters") {
    state.libraryFilters = { query: "", scene: "", domain: "", difficulty: "", favorites: "" };
    render();
  } else if (action === "clear-history-filters") {
    state.historyFilters = { query: "", scene: "", domain: "", taskType: "", structureId: "", difficulty: "", retry: "", problem: "", migration: "", completionStatus: "" };
    render();
  } else if (action === "open-history-session") {
    openModal({ type: "history", sessionId: control.dataset.sessionId }, control);
  } else if (action === "start-focus") {
    await startFocusTraining();
  } else if (action === "export-data") {
    await exportData();
  } else if (action === "install-app") {
    await state.installPrompt?.prompt();
    state.installPrompt = null;
    render();
  } else if (action === "open-clear-data") {
    openModal({ type: "clear" }, control);
  } else if (action === "confirm-clear-data") {
    const value = root.querySelector("[data-clear-confirm]")?.value.trim();
    if (value !== "清除") {
      showToast("请输入“清除”确认。", "danger");
      return;
    }
    try {
      cancelScheduledActiveSave();
      await activeSaveTail;
      await clearAllData();
      location.reload();
    } catch (error) {
      showToast(error?.message || "本地数据未能完全清除，请关闭其他应用页面后重试。", "danger");
    }
  } else if (action === "complete-onboarding") {
    await updateSetting("onboardingComplete", true);
    state.pendingFocus = { type: "main" };
    state.pendingAnnouncement = "首次设置已完成，已进入今日训练";
    render();
  }
  } catch (error) {
    showToast(error?.message || "操作未完成，请重试。", "danger");
  } finally {
    if (exclusive) {
      actionInFlight = false;
      if (control.isConnected) {
        control.disabled = false;
      }
    }
  }
});

function updateResearchProgress() {
  const badge = root.querySelector("[data-research-count]");
  const total = root.querySelectorAll("[data-research-prompt]").length;
  const completed = root.querySelectorAll("[data-research-prompt]:checked").length;
  if (badge) {
    badge.textContent = `${completed} / ${total}`;
  }
}

function updateOrganizeLiveFeedback() {
  const card = cardForSession();
  const badge = root.querySelector("[data-organize-count]");
  const panel = root.querySelector("[data-organize-check]");
  if (!card) {
    return;
  }
  const completed = card.organizingTemplate.filter(
    (item) => state.activeSession?.userNotes?.[item]?.trim(),
  ).length;
  if (badge) {
    badge.textContent = `${completed} / ${card.organizingTemplate.length}`;
  }
  if (panel) {
    panel.innerHTML = `<h3>进入表达前的提问式检查</h3>${organizeWarnings(state.activeSession, card)
      .map((item) => `<p>${icon("info")}<span>${escapeHtml(item)}</span></p>`)
      .join("")}`;
  }
}

root.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-source-index]")) {
    const index = Number(target.dataset.sourceIndex);
    const field = target.dataset.sourceField;
    updateActive((session) => {
      const sources = session.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, [field]: target.value } : source);
      return { ...session, sources };
    }, { markNotes: true });
  } else if (target.matches("[data-note-key]")) {
    const key = target.dataset.noteKey;
    updateActive((session) => ({ ...session, userNotes: { ...session.userNotes, [key]: target.value } }), { markNotes: true });
    updateOrganizeLiveFeedback();
  } else if (target.matches("[data-session-text]")) {
    updateActive((session) => ({ ...session, [target.dataset.sessionText]: target.value }), { markNotes: true });
  } else if (target.matches("[data-library-filter='query']")) {
    state.libraryFilters.query = target.value;
    debounceFilterRender(target, "library");
  } else if (target.matches("[data-history-filter='query']")) {
    state.historyFilters.query = target.value;
    debounceFilterRender(target, "history");
  } else if (target.matches("[data-setting='level']")) {
    root.querySelector("#level-value").textContent = `L${target.value}`;
  }
});

let filterTimer;
function debounceFilterRender(target, type) {
  clearTimeout(filterTimer);
  const position = target.selectionStart;
  filterTimer = setTimeout(() => {
    render();
    const selector = type === "library" ? "[data-library-filter='query']" : "[data-history-filter='query']";
    const replacement = root.querySelector(selector);
    replacement?.focus();
    replacement?.setSelectionRange(position, position);
  }, 180);
}

root.addEventListener("change", async (event) => {
  const target = event.target;
  const exclusive = target.matches("[data-setting], [data-import-file]");
  if (exclusive && actionInFlight) {
    render();
    return;
  }
  if (exclusive) {
    actionInFlight = true;
    target.disabled = true;
  }
  try {
  if (target.name === "homeScene") {
    state.homeScene = target.value;
  } else if (target.matches("[data-research-prompt]")) {
    const card = cardForSession();
    const prompt = card.researchPrompts[Number(target.dataset.researchPrompt)];
    updateActive((session) => ({ ...session, researchChecks: { ...session.researchChecks, [prompt]: target.checked } }), { markNotes: true });
    updateResearchProgress();
  } else if (target.matches("[data-session-field]")) {
    updateActive((session) => ({ ...session, [target.dataset.sessionField]: target.checked }), { markNotes: true });
  } else if (target.matches("[data-recording-unavailable]")) {
    const slot = target.dataset.recordingUnavailable;
    updateActive((session) => ({ ...session, recordingUnavailable: { ...session.recordingUnavailable, [slot]: target.checked } }), { markNotes: true, render: state.activeSession?.stage === "retry" });
  } else if (target.matches("[data-score-phase]")) {
    const sourceKey = target.dataset.scorePhase === "retry" ? "retryScores" : "selfScores";
    updateActive((session) => ({ ...session, [sourceKey]: { ...session[sourceKey], [target.dataset.metricId]: Number(target.value) } }), { markNotes: true });
    target.closest(".score-scale")?.querySelectorAll(".score-choice").forEach((choice) => choice.classList.toggle("is-selected", choice.contains(target)));
  } else if (target.name === "observableImprovement") {
    updateActive((session) => ({ ...session, observableImprovement: target.value === "yes" }), { markNotes: true });
  } else if (target.matches("[data-library-filter]")) {
    const key = target.dataset.libraryFilter;
    state.libraryFilters[key] = target.type === "checkbox" ? (target.checked ? "yes" : "") : target.value;
    render();
  } else if (target.matches("[data-history-filter]")) {
    state.historyFilters[target.dataset.historyFilter] = target.value;
    render();
  } else if (target.matches("[data-setting]")) {
    const id = target.dataset.setting;
    const value = target.type === "checkbox" ? target.checked : id === "level" ? Number(target.value) : target.value;
    await updateSetting(id, value);
    render();
  } else if (target.matches("[data-import-file]") && target.files?.[0]) {
    await importData(target.files[0]);
  }
  } catch (error) {
    showToast(error?.message || "更改未保存，请重试。", "danger");
    render();
  } finally {
    if (exclusive) {
      actionInFlight = false;
      if (target.isConnected) {
        target.disabled = false;
      }
    }
  }
});

window.addEventListener("hashchange", () => {
  const requested = location.hash.slice(1);
  state.view = validViews.has(requested) ? requested : "home";
  state.pendingFocus ??= { type: "main" };
  render();
});

window.addEventListener("keydown", (event) => {
  const modeControl = event.target.closest?.(".segmented [role='radio']");
  if (modeControl && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    const controls = [...modeControl.closest("[role='radiogroup']").querySelectorAll("[role='radio']")];
    const current = controls.indexOf(modeControl);
    const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
    const next = controls[(current + direction + controls.length) % controls.length];
    event.preventDefault();
    next?.click();
    return;
  }
  const modal = root.querySelector("[data-modal-panel]");
  if (modal) {
    if (event.key === "Escape") {
      if (state.modal) {
        event.preventDefault();
        closeModal();
      }
      return;
    }
    if (event.key === "Tab") {
      const focusables = focusableElements(modal);
      if (!focusables.length) {
        event.preventDefault();
        modal.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0];
      const last = focusables.at(-1);
      if (!modal.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  if (state.view === "settings") {
    render();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && pendingActiveSave) {
    void flushScheduledActiveSave().catch(() => {});
  }
});

window.addEventListener("pagehide", () => {
  if (pendingActiveSave) {
    void flushScheduledActiveSave().catch(() => {});
  }
});

window.addEventListener("beforeunload", (event) => {
  const hadPendingSave = Boolean(pendingActiveSave);
  const saveInFlight = state.saveStatus === "saving";
  if (hadPendingSave) {
    void flushScheduledActiveSave().catch(() => {});
  }
  if (recordingBusy() || hadPendingSave || saveInFlight) {
    event.preventDefault();
    event.returnValue = "";
  }
});

async function initialize() {
  try {
    [state.settings, state.sessions, state.activeSession, state.favorites, state.storage] = await Promise.all([
      loadSettings(),
      loadSessions(),
      loadActiveSession(),
      loadFavorites(),
      storageSummary(),
    ]);
    state.sessions.sort((left, right) => sessionTimestamp(left) - sessionTimestamp(right));
    state.homeMode = state.settings.defaultMode;
  } catch {
    showToast("无法读取部分本地数据，将以默认设置启动。", "danger");
  }
  const requested = location.hash.slice(1);
  state.view = validViews.has(requested) ? requested : "home";
  if (!location.hash) {
    history.replaceState(null, "", "#home");
  }
  render();
  clockTimer = setInterval(updateClock, 1000);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline installation is optional during local development.
    });
  }
}

initialize();
