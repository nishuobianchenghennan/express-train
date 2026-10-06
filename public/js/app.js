import { DOMAINS, METRICS, PROTOCOLS, SCENES, STRUCTURES, TASK_CARDS, TASK_TYPES } from "./legacy/cards.js";
import { icon } from "./icons.js";
import { calculateStats, filterHistory } from "./legacy/stats.js";
import { legacyCheckRates, legacyDrillOutcome } from "./legacy/engines.js";
import { LESSON_MAP as LEGACY_LESSON_MAP } from "./legacy/lessons.js";
import { CHECKS as LEGACY_CHECKS } from "./legacy/scenarios.js";
import { CHECKS } from "./curriculum/checks.js";
import { CAREER_STAGES } from "./curriculum/ids.js";
import { LINES, LINE_WEIGHTS } from "./curriculum/contexts.js";
import { PARADIGM_MAP, PRACTICE_CARDS, PRACTICE_CARD_MAP } from "./curriculum/index.js";
import { drawSequence, dueRevisits, practiceStats, revisitSelection, selectPracticeCard, weaknessLabel } from "./arena/engine.js";
import { applyRateBars, createArenaController, estimateDrillMinutes, renderDrillHistory, renderPracticeAbility } from "./arena/ui.js";
import { learnedParadigms, recentlyLearned, recommendedLesson } from "./arena/lesson-engine.js";
import { createLessonController, renderCurriculumMap } from "./arena/lesson-ui.js";
import {
  archiveLegacyInProgress,
  clearAllData,
  DEFAULT_SETTINGS,
  exportLocalData,
  importLocalData,
  loadActiveDrill,
  loadActiveLesson,
  loadDrills,
  loadLessonRuns,
  loadRecording,
  loadSessions,
  loadSettings,
  saveDrillProgress,
  saveLessonProgress,
  saveRecording,
  saveSettings,
  storageSummary,
} from "./storage.js";

const root = document.querySelector("#app");
const cardMap = new Map(TASK_CARDS.map((card) => [card.id, card]));
const validViews = new Set(["home", "lessons", "history", "ability", "settings", "drill", "lesson"]);
const validCompletionStatuses = new Set(["completed", "skipped", "abandoned"]);
const TOPIC_DRAW_DURATION_MS = 5_000;
const BUSY_NAVIGATION_MESSAGE = "正在表达中，请先点“讲完了”。";
/** “当前阶段”设置的文案：决定四条线的出题比例。 */
const CAREER_STAGE_NAMES = Object.freeze({ phd: "博士在读", bridge: "准备转化", founder: "已创业" });
/**
 * 按 LINE_WEIGHTS 生成出题比例提示，避免文案与权重配置脱节。
 * 线名取前两个字作简称（学术线 → 学术、生活社交线 → 生活）。
 */
function stageWeightHint(stageId) {
  return Object.entries(LINE_WEIGHTS[stageId] ?? {})
    .map(([lineId, weight]) => `${(LINES[lineId]?.label ?? lineId).slice(0, 2)} ${weight}%`)
    .join(" · ");
}
const CAREER_STAGE_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(CAREER_STAGE_NAMES).map(([id, label]) => [id, Object.freeze({ label, hint: stageWeightHint(id) })]),
));
// 单张候选卡宽度 220px + 间距 12px，轮播位移按此步长计算
const TOPIC_CARD_STRIDE_PX = 232;
const TOPIC_IDLE_LOOP_MS = 30_000;
// 抽题减速曲线：前段快速掠过，末段缓慢停靠到中奖卡
const TOPIC_DRAW_EASING = "cubic-bezier(0.15, 0.55, 0.1, 1)";
const exclusiveActions = new Set([
  "setting-mode",
  "start-home",
  "explore-topics",
  "drill-start-prep",
  "drill-advance",
  "drill-take-finish",
  "drill-close",
  "drill-next",
  "lesson-start",
  "lesson-advance",
  "lesson-take-finish",
  "lesson-close",
  "lesson-next",
  "lesson-practice",
  "start-revisit",
  "setting-stage",
  "onboarding-stage",
  "export-data",
  "install-app",
  "confirm-clear-data",
  "complete-onboarding",
]);

const state = {
  settings: { ...DEFAULT_SETTINGS },
  sessions: [],
  view: "home",
  homeMode: "full",
  topicDraw: null,
  activeDrill: null,
  drills: [],
  activeLesson: null,
  lessonRuns: [],
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
  audioUrls: [],
  renderVersion: 0,
};

let actionInFlight = false;
let topicDrawRevision = 0;
// 空闲轮播的共享时间原点，保证重渲染后从当前位置续播而不是回到起点
const topicIdleEpoch = performance.now();
let toastTimer;
const arena = createArenaController({
  root,
  state,
  escapeHtml,
  icon,
  render: () => render(),
  navigate: (view) => navigate(view),
  showToast: (message, tone) => showToast(message, tone),
  playTone: () => {
    if (state.settings.soundEnabled) playGentleTone();
  },
  saveRecording,
  loadRecording,
  saveDrillProgress,
  onNextDrill: () => void runTopicDraw().catch((error) => showToast(error?.message || "抽题失败，请重试。", "danger")),
});
const lessons = createLessonController({
  root,
  state,
  escapeHtml,
  icon,
  render: () => render(),
  navigate: (view) => navigate(view),
  showToast: (message, tone) => showToast(message, tone),
  saveRecording,
  loadRecording,
  saveLessonProgress,
  onPracticeParadigm: (paradigmId) => void practiceParadigm(paradigmId).catch((error) => showToast(error?.message || "无法开始练习，请重试。", "danger")),
});

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

function formatBytes(bytes = 0) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

function sessionTimestamp(session) {
  return new Date(session.completedAt ?? session.startedAt ?? 0).getTime();
}

function applySettings() {
  document.documentElement.classList.toggle("reduce-motion", state.settings.reducedMotion);
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
  if (arena.isBusy() || lessons.isBusy()) {
    showToast(BUSY_NAVIGATION_MESSAGE, "danger");
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
  // 练习工作台归属“今日训练”，课程工作台归属“30 课”
  const active = state.view === view || (view === "home" && state.view === "drill") || (view === "lessons" && state.view === "lesson");
  return `<button class="nav-item${active ? " is-active" : ""}" type="button" data-action="navigate" data-view="${view}" aria-current="${active ? "page" : "false"}">${icon(iconName)}<span>${label}</span></button>`;
}

function renderShell(content, options = {}) {
  const training = ["drill", "lesson"].includes(state.view);
  return `
    <div class="app-shell${training ? " is-training" : ""}">
      <aside class="sidebar" aria-label="主要导航">
        <button class="brand" type="button" data-action="navigate" data-view="home" aria-label="讲明白首页">
          <img src="/icons/icon.svg" alt="" width="38" height="38">
          <span><strong>讲明白</strong><small>30 种表达结构与练习</small></span>
        </button>
        <nav class="sidebar-nav">
          ${navItem("home", "今日训练", "home")}
          ${navItem("lessons", "30 课", "book")}
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
      ${training ? "" : `<nav class="bottom-nav" aria-label="移动端导航">${navItem("home", "训练", "home")}${navItem("lessons", "30 课", "book")}${navItem("history", "历史", "history")}${navItem("ability", "能力", "chart")}${navItem("settings", "设置", "settings")}</nav>`}
    </div>
    ${renderModal()}
    ${!state.settings.onboardingComplete && !state.modal ? renderOnboarding() : ""}
  `;
}

function renderModeSelector(value, actionPrefix = "home-mode") {
  return `<div class="segmented" role="radiogroup" aria-label="训练模式">
    <button type="button" role="radio" aria-checked="${value === "full"}" tabindex="${value === "full" ? "0" : "-1"}" class="${value === "full" ? "is-active" : ""}" data-action="${actionPrefix}" data-value="full"><span>完整回合</span><small>开口 · 补课 · 重讲，约 10 分钟</small></button>
    <button type="button" role="radio" aria-checked="${value === "quick"}" tabindex="${value === "quick" ? "0" : "-1"}" class="${value === "quick" ? "is-active" : ""}" data-action="${actionPrefix}" data-value="quick"><span>闪电回合</span><small>开口 · 重讲，约 4 分钟</small></button>
  </div>`;
}

function resetTopicDraw() {
  topicDrawRevision += 1;
  state.topicDraw = null;
}

function currentTopicDraw() {
  const draw = state.topicDraw;
  return draw && draw.mode === state.homeMode ? draw : null;
}

/** 空闲轮播：按固定步长从精选题中取 8 张，展示四条线与各类语境的广度。 */
function idleTopicCards() {
  const pool = PRACTICE_CARDS.filter((card) => card.status === "active");
  const step = Math.max(1, Math.floor(pool.length / 8) + 1);
  return Array.from({ length: Math.min(8, pool.length) }, (_, index) => pool[(index * step) % pool.length]);
}

function renderTopicDraw(draw) {
  const idleBase = idleTopicCards();
  const cards = draw ? draw.cardIds.map((id) => PRACTICE_CARD_MAP.get(id)).filter(Boolean) : [...idleBase, ...idleBase];
  const winnerIndex = draw?.winnerIndex ?? -1;
  const offset = winnerIndex > 0 ? winnerIndex * TOPIC_CARD_STRIDE_PX : 0;
  const idleOffset = idleBase.length * TOPIC_CARD_STRIDE_PX;
  const status = draw?.status ?? "idle";
  const statusText = status === "spinning"
    ? "正在按阶段比例、弱项和复练计划选择"
    : status === "settled"
      ? "已选出一道练习题"
      : `${PRACTICE_CARDS.length} 道精选题 · 4 条线 · 56 类语境`;
  const stage = status === "spinning" ? 2 : status === "settled" ? 3 : 1;
  const winner = draw?.winnerId ? PRACTICE_CARD_MAP.get(draw.winnerId) : null;
  return `<section class="topic-draw topic-draw-${status}" aria-label="本轮话题抽取">
    <div class="topic-draw-heading"><div><p class="eyebrow">本回合入口</p><h3>抽一道题，直接开口</h3><p>只从已学的结构中出题 · 约 5 秒完成选择</p></div><span class="draw-step-count">${stage}<small>/ 3</small></span></div>
    <ol class="draw-sequence" aria-label="抽题步骤"><li class="${stage >= 1 ? "is-current" : ""}"><span>1</span>浏览</li><li class="${stage >= 2 ? "is-current" : ""}"><span>2</span>定格</li><li class="${stage >= 3 ? "is-current" : ""}"><span>3</span>开口</li></ol>
    <p class="draw-status" aria-live="polite">${icon(status === "settled" ? "check" : status === "spinning" ? "clock" : "shuffle")}${escapeHtml(statusText)}</p>
    <div class="topic-draw-window">
      <div class="topic-draw-marker" aria-hidden="true"></div>
      <div class="topic-draw-track${status === "idle" ? " is-idle" : status === "spinning" ? " is-spinning" : " is-settled"}" data-draw-offset="${offset}" data-idle-offset="${idleOffset}">
        ${cards.map((card, index) => `<article class="topic-draw-card${status === "settled" && index === winnerIndex ? " is-winner" : ""}"><div><span class="line-tag line-${card.line}">${escapeHtml(card.lineLabel)}</span><span>L${card.difficulty}</span></div><strong>${escapeHtml(card.contextLabel)}</strong><p>${escapeHtml(card.title)}</p></article>`).join("")}
      </div>
    </div>
    ${status === "settled" && winner ? `<div class="draw-result"><span>${escapeHtml(draw.selectionReason)}</span><strong>${escapeHtml(winner.title)}</strong><p>${escapeHtml(winner.situation)}</p></div>` : ""}
  </section>`;
}

/**
 * 为抽题轨道挂载位移动画。
 *
 * CSP 为 style-src 'self'，innerHTML 中的内联 style 属性会被浏览器丢弃，
 * 因此位移改由 Web Animations API 与 CSSOM 驱动（二者不受该策略限制）。
 * 动画进度依据时间原点推算，重渲染后从当前位置续播。
 */
function applyTopicDrawMotion() {
  const track = root.querySelector(".topic-draw-track");
  if (!track) return;
  const drawOffset = Number(track.dataset.drawOffset) || 0;
  const idleOffset = Number(track.dataset.idleOffset) || 0;
  const draw = currentTopicDraw();
  const status = draw?.status ?? "idle";
  const settledTransform = `translate3d(-${drawOffset}px, 0, 0)`;
  if (status === "settled") {
    track.style.transform = settledTransform;
    return;
  }
  if (prefersReducedMotion() || typeof track.animate !== "function") return;
  if (status === "spinning") {
    const animation = track.animate(
      [{ transform: "translate3d(0, 0, 0)" }, { transform: settledTransform }],
      { duration: TOPIC_DRAW_DURATION_MS, easing: TOPIC_DRAW_EASING, fill: "forwards" },
    );
    animation.currentTime = Math.min(TOPIC_DRAW_DURATION_MS, performance.now() - (draw.startedAt ?? performance.now()));
    return;
  }
  if (idleOffset <= 0) return;
  const animation = track.animate(
    [{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(-${idleOffset}px, 0, 0)` }],
    { duration: TOPIC_IDLE_LOOP_MS, iterations: Infinity },
  );
  animation.currentTime = (performance.now() - topicIdleEpoch) % TOPIC_IDLE_LOOP_MS;
  // 悬停时暂停，便于阅读候选题目
  const drawWindow = track.closest(".topic-draw-window");
  drawWindow?.addEventListener("pointerenter", () => animation.pause());
  drawWindow?.addEventListener("pointerleave", () => animation.play());
}

/**
 * 首页主按钮：先抽题轮转，定格后才进入训练，保证“浏览 → 定格 → 开始”三步一致。
 *
 * @param {object|null} draw 当前抽题状态
 * @param {object|undefined} card 已定格的练习题，用于估算时长
 * @returns {string} 按钮 HTML
 */
function renderHomeStartAction(draw, card) {
  if (draw?.status === "spinning") {
    return `<button class="button button-primary button-large" type="button" disabled>${icon("clock")}<span>正在抽取题目…</span></button>`;
  }
  const label = draw?.status === "settled" && card ? `开始这一回合 · 约 ${estimateDrillMinutes(card, state.homeMode)} 分钟` : "抽一道练习题";
  return `<button class="button button-primary button-large" type="button" data-action="start-home">${icon(draw?.status === "settled" ? "play" : "shuffle")}<span>${label}</span></button>`;
}

/**
 * 首页“今日计划”：进行中 → 到期复练 → 推荐一课 → 练习抽题 → 概览。
 *
 * @returns {string} 首页 HTML
 */
function renderHome() {
  const stats = practiceStats(state.drills);
  const learned = learnedParadigms(state.lessonRuns);
  const drill = state.activeDrill?.status === "in_progress" ? state.activeDrill : null;
  const drillCard = drill ? PRACTICE_CARD_MAP.get(drill.cardId) : null;
  const lessonRun = state.activeLesson?.status === "in_progress" ? state.activeLesson : null;
  const lessonParadigm = lessonRun ? PARADIGM_MAP.get(lessonRun.paradigmId) : null;
  const nextLesson = recommendedLesson(state.lessonRuns);
  const revisit = dueRevisits(state.drills)[0];
  const revisitCard = revisit ? PRACTICE_CARD_MAP.get(revisit.cardId) : null;
  const draw = currentTopicDraw();
  const drawnCard = draw?.winnerId ? PRACTICE_CARD_MAP.get(draw.winnerId) : null;
  const stage = CAREER_STAGE_LABELS[state.settings.careerStage] ?? CAREER_STAGE_LABELS.phd;
  const todayKey = dateKey(new Date());
  const learnedToday = state.lessonRuns.some((run) => run.schemaVersion === 2 && run.status === "completed" && dateKey(run.completedAt) === todayKey);

  // 进行中的回合优先展示；课程也在进行中时，再补一个简洁的“继续第 N 课”入口
  const lessonTitle = `第 ${escapeHtml(String(lessonParadigm?.order ?? ""))} 课 · ${escapeHtml(lessonParadigm?.title ?? "")}`;
  const continueTitle = drill ? escapeHtml(drillCard?.title ?? drill.title ?? "练习回合") : lessonTitle;
  const continueBlock = drill || lessonRun
    ? `<section class="focus-band"><div class="focus-icon">${icon("play")}</div><div><p class="eyebrow">继续</p><h2>${continueTitle}</h2><p>进度已保存在当前设备。</p></div><button class="button button-primary" type="button" data-action="${drill ? "resume-drill" : "resume-lesson"}">继续${icon("chevronRight")}</button></section>`
    : "";
  const continueLessonBlock = drill && lessonRun
    ? `<section class="focus-band focus-band-quiet"><div class="focus-icon">${icon("book")}</div><div><p class="eyebrow">课程进行中</p><h2>${lessonTitle}</h2></div><button class="button button-secondary" type="button" data-action="resume-lesson">继续第 ${escapeHtml(String(lessonParadigm?.order ?? ""))} 课${icon("chevronRight")}</button></section>`
    : "";
  const revisitBlock = !drill && revisitCard
    ? `<section class="focus-band"><div class="focus-icon">${icon("rotate")}</div><div><p class="eyebrow">到期复练 · ${stats.revisitsDue} 个</p><h2>${escapeHtml(revisitCard.title)}</h2><p>上次首轮有没做到的项。这次会换一组打断和追问，检验改进有没有留下来。</p></div><button class="button button-secondary" type="button" data-action="start-revisit">开始复练${icon("chevronRight")}</button></section>`
    : "";
  const lessonBlock = !lessonRun && (!learned.size || (!learnedToday && learned.size < 30))
    ? `<section class="focus-band"><div class="focus-icon">${icon("book")}</div><div><p class="eyebrow">${learned.size ? "可选 · 今天学一课" : "从这里开始"}</p><h2>第 ${nextLesson.order} 课 · ${escapeHtml(nextLesson.title)}</h2><p>${escapeHtml(nextLesson.structure)}。${escapeHtml(nextLesson.whenToUse)}</p></div><button class="button button-primary" type="button" data-action="lesson-start" data-paradigm="${escapeHtml(nextLesson.id)}">开始这一课${icon("chevronRight")}</button></section>`
    : "";
  const practiceBlock = learned.size && !drill
    ? `<section class="practice-entry" aria-labelledby="today-title">
        <div class="entry-main">
          <div class="entry-kicker"><span class="status-badge ${draw?.status === "settled" ? "status-done" : "status-ready"}">${draw?.status === "settled" ? "已选出题目" : "练习回合"}</span><span>${state.homeMode === "quick" ? "闪电回合" : "完整回合"} · 从已学的 ${learned.size} 种结构中出题</span></div>
          <h2 id="today-title">${drawnCard ? escapeHtml(drawnCard.title) : "抽一道题，30 秒内开口"}</h2>
          <p class="entry-description">${drawnCard ? escapeHtml(drawnCard.goal) : "准备阶段会先引导你判断场景、选对结构；讲完再对照这道题的最优方案。"}</p>
          ${renderTopicDraw(draw)}
        </div>
        <aside class="entry-controls">${renderModeSelector(state.homeMode)}${renderHomeStartAction(draw, drawnCard)}<button class="button button-ghost explore-topics" type="button" data-action="explore-topics">${icon("shuffle")}换一题</button></aside>
      </section>`
    : "";
  const weakness = stats.weakness;
  const weaknessText = weakness
    ? `首轮${weakness.kind === "structure" ? "步骤覆盖率" : "做到率"} ${weakness.rate}%，抽题会优先安排考核这一项的题。`
    : "完成 3 个回合后，系统会根据首轮没做到的项找出弱项。";
  const headline = stats.today ? `今天已完成 ${stats.today} 回合` : learned.size ? "今天先开口一次" : "先学会第一种表达结构";
  const content = `
    <div class="home-intent-bar"><div><p class="eyebrow">今日训练 · ${escapeHtml(stage.label)}</p><h1>${headline}</h1><p>从“不知道怎么开口”到“能说会道”：先学一种结构，再在学术、生活、转化、创业四条线的真实场合里用出来。</p></div><div class="intent-streak"><span>已学结构</span><strong>${learned.size}</strong><small>/ 30</small></div></div>
    ${continueBlock}${continueLessonBlock}${revisitBlock}${lessonBlock}${practiceBlock}
    <section class="focus-band focus-band-quiet" aria-labelledby="focus-title"><div class="focus-icon">${icon("target")}</div><div><p class="eyebrow">当前弱项（按首轮冷启动统计）</p><h2 id="focus-title">${weakness ? escapeHtml(weaknessLabel(weakness)) : "还在观察"}</h2><p>${weaknessText}</p></div><button class="button button-secondary" type="button" data-action="navigate" data-view="ability">查看依据${icon("chevronRight")}</button></section>
    <section class="progress-strip progress-strip-overview" aria-label="训练概览"><div><span>今日回合</span><strong>${stats.today}</strong></div><div><span>近 7 天</span><strong>${stats.last7}</strong></div><div><span>连续天数</span><strong>${stats.streak}</strong></div><div><span>接住打断</span><strong>${stats.pressureRate == null ? "—" : `${stats.pressureRate}%`}</strong></div>${Object.entries(LINES).map(([id, line]) => `<div><span>${escapeHtml(line.label)}</span><strong>${stats.lineCounts[id] ?? 0}</strong></div>`).join("")}</section>
  `;
  return renderShell(content, { title: "今日训练" });
}

/**
 * 30 课页：五个阶段的课程地图，点任意一课开始学习。
 *
 * @returns {string} 课程页 HTML
 */
function renderLessonsPage() {
  const learned = learnedParadigms(state.lessonRuns).size;
  const content = `
    <div class="page-heading"><div><p class="eyebrow">学习路径</p><h1>30 课：表达的全部结构</h1><p>五个阶段：敢开口 → 讲清楚 → 能交锋 → 能推动 → 创业者。每课学一种结构，学完后它就会进入练习题池。</p></div><div class="library-count"><strong>${learned}</strong><span>/ 30 已学</span></div></div>
    ${renderCurriculumMap({ runs: state.lessonRuns, activeRun: state.activeLesson }, { escapeHtml })}
  `;
  return renderShell(content, { title: "30 课" });
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

function legacyRecordTime(record) {
  return new Date(record.completedAt ?? record.startedAt ?? 0).getTime();
}

/** 旧版记录的一行：日期、标题、口径说明与结果，只读。 */
function renderLegacyRow({ date, title, kind, summary }) {
  return `<article class="history-row legacy-row">
    <div class="history-date"><strong>${formatDate(date, { day: "2-digit" })}</strong><span>${formatDate(date, { month: "short" })}</span></div>
    <div class="history-main"><div class="card-meta"><span class="status-badge status-ready">旧版训练</span><span>${escapeHtml(kind)}</span></div><h2>${escapeHtml(title)}</h2></div>
    <div class="history-summary"><span>${escapeHtml(kind)}</span><strong>${escapeHtml(summary)}</strong></div>
  </article>`;
}

/** 旧版实战回合与旧版课程（schemaVersion 1）的只读列表。 */
function renderLegacyDrillAndLessonLists() {
  const newestFirst = (left, right) => legacyRecordTime(right) - legacyRecordTime(left);
  const drills = state.drills.filter((drill) => drill.schemaVersion !== 2).sort(newestFirst);
  const runs = state.lessonRuns.filter((run) => run.schemaVersion !== 2).sort(newestFirst);
  const drillRows = drills.map((drill) => {
    const outcome = drill.status === "completed" ? legacyDrillOutcome(drill) : null;
    const summary = outcome ? `${outcome.firstPassed}/${outcome.total} → ${outcome.secondPassed}/${outcome.total}` : "—";
    return renderLegacyRow({ date: drill.completedAt ?? drill.startedAt, title: drill.title ?? drill.cardId, kind: "旧版实战回合", summary });
  }).join("");
  const lessonRows = runs.map((run) => renderLegacyRow({
    date: run.completedAt ?? run.startedAt,
    title: LEGACY_LESSON_MAP.get(run.scenarioId)?.structure ?? run.scenarioId,
    kind: "旧版课程",
    summary: run.status === "completed" ? "已完成" : "未完成",
  })).join("");
  return `${drills.length ? `<div class="section-heading legacy-heading"><div><p class="eyebrow">旧版训练</p><h2>旧版实战回合</h2></div><span>${drills.length} 条</span></div><div class="history-list">${drillRows}</div>` : ""}
    ${runs.length ? `<div class="section-heading legacy-heading"><div><p class="eyebrow">旧版训练</p><h2>旧版课程</h2></div><span>${runs.length} 条</span></div><div class="history-list">${lessonRows}</div>` : ""}`;
}

/**
 * 训练历史：新版练习回合在上；旧版记录收进只读折叠区。
 *
 * @returns {string} 历史页 HTML
 */
function renderHistory() {
  const filtered = filterHistory(state.sessions, state.historyFilters);
  const problems = uniqueProblems();
  const hasLegacy = state.sessions.length || state.drills.some((drill) => drill.schemaVersion !== 2) || state.lessonRuns.some((run) => run.schemaVersion !== 2);
  const content = `
    <div class="page-heading"><div><p class="eyebrow">本地训练档案</p><h1>训练历史</h1><p>练习回合记录首轮与重讲的逐项检查、遇到的打断与追问；旧版训练记录只读保留在下方。</p></div><div class="library-count"><strong>${state.drills.filter((drill) => drill.schemaVersion === 2).length}</strong><span>个练习回合</span></div></div>
    ${renderDrillHistory(state.drills, { escapeHtml, formatDate }) || `<section class="empty-state"><div>${icon("history")}</div><h2>还没有练习回合</h2><p>学完一课后，完成一次“开口 → 回听 → 重讲”，记录会出现在这里。</p><button class="button button-primary" type="button" data-action="navigate" data-view="home">回到今日训练</button></section>`}
    ${hasLegacy ? `<details class="legacy-ability legacy-history"><summary>${icon("archive")}旧版训练记录（只读）</summary>
    ${renderLegacyDrillAndLessonLists()}
    ${state.sessions.length ? `<div class="section-heading legacy-heading"><div><p class="eyebrow">旧版训练</p><h2>旧版主题训练记录</h2></div><span>${filtered.length} / ${state.sessions.length} 条</span></div>` : ""}
    ${state.sessions.length ? `<details class="history-filters"><summary>${icon("filter")}筛选主题训练记录</summary><div class="filter-grid">
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
    ${filtered.length ? `<div class="history-list">${filtered.map(renderHistoryItem).join("")}</div>` : `<section class="empty-state"><div>${icon("history")}</div><h2>没有匹配的训练记录</h2><p>调整筛选条件后再试。</p></section>`}` : ""}
    </details>` : ""}
  `;
  return renderShell(content, { title: "训练历史" });
}

function renderProtocolCoverage(counts) {
  const maximum = Math.max(1, ...Object.values(counts));
  return `<div class="protocol-grid">${Object.entries(PROTOCOLS).map(([id, protocol]) => { const count = counts[id] ?? 0; return `<div><span>${escapeHtml(protocol.label)}</span><strong>${count}</strong><progress value="${count}" max="${maximum}" aria-label="${escapeHtml(protocol.label)} ${count} 次"></progress><small>${escapeHtml(protocol.description)}</small></div>`; }).join("")}</div>`;
}

function renderAbility() {
  const stats = calculateStats(state.sessions, TASK_CARDS, METRICS);
  const weakness = practiceStats(state.drills).weakness;
  const weakCheck = weakness?.kind === "behavior" ? CHECKS[weakness.id] : null;
  const weakParadigm = weakness?.kind === "structure" ? PARADIGM_MAP.get(weakness.id) : null;
  const weakTip = weakCheck?.tip ?? (weakParadigm ? `按“${weakParadigm.structure}”的顺序把每一步都讲到。` : "");
  const legacyRates = Object.entries(legacyCheckRates(state.drills)).sort((left, right) => left[1].firstRate - right[1].firstRate);
  const metricEntries = Object.entries(stats.metrics).sort((left, right) => left[1].average - right[1].average);
  const content = `
    <div class="page-heading"><div><p class="eyebrow">能力档案</p><h1>看可观察的行为，不看笼统总分</h1><p>每一项都是回听时能回答“做到 / 没做到”的具体行为。首轮代表冷启动的真实水平，重讲代表改正能力。</p></div><div class="headline-stat"><span>弱项</span><strong>${weakness ? escapeHtml(weaknessLabel(weakness)) : "—"}</strong><small>${weakness ? "抽题优先安排" : "完成 3 回合后判断"}</small></div></div>
    ${renderPracticeAbility(state.drills, { escapeHtml, icon })}
    <section class="focus-band ability-focus"><div class="focus-icon">${icon("target")}</div><div><p class="eyebrow">下一回合</p><h2>${weakness ? `练「${escapeHtml(weaknessLabel(weakness))}」` : "继续覆盖四条线"}</h2><p>${weakness ? escapeHtml(weakTip) : "抽题会按当前阶段的比例覆盖四条线，并优先安排你刚学的结构。"}</p></div><button class="button button-primary" type="button" data-action="navigate" data-view="home">去今日训练${icon("arrowRight")}</button></section>
    ${state.sessions.length ? `<details class="legacy-ability"><summary>${icon("book")}旧版主题训练档案（只读，1–5 分自评口径，${state.sessions.length} 条记录）</summary>
    <div class="ability-grid">
      <section class="dashboard-section wide"><div class="section-heading"><div><p class="eyebrow">滚动覆盖</p><h2>十类表达场景</h2></div><div class="range-legend"><span><i class="legend-dot seven"></i>7 天</span><span><i class="legend-dot thirty"></i>30 天</span></div></div><div class="dual-coverage">${Object.entries(SCENES).map(([id, scene]) => { const seven = stats.sceneCounts7[id] ?? 0; const thirty = stats.sceneCounts30[id] ?? 0; const max = Math.max(1, ...Object.values(stats.sceneCounts30)); return `<div><span>${escapeHtml(scene.label)}</span><div><progress class="progress-seven" value="${seven}" max="${max}" aria-label="7 天 ${seven} 次"></progress><progress class="progress-thirty" value="${thirty}" max="${max}" aria-label="30 天 ${thirty} 次"></progress></div><strong>${seven} / ${thirty}</strong></div>`; }).join("")}</div></section>
      <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">全部完成记录</p><h2>四类训练协议</h2></div></div>${renderProtocolCoverage(stats.protocolCounts)}</section>
      <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">质量辅助指标</p><h2>闭环稳定性</h2></div></div><div class="large-metrics"><div><strong>${stats.completeLoops28}</strong><span>28 天完整闭环</span></div><div><strong>${stats.sourceComplianceRate}%</strong><span>来源要求达成</span></div><div><strong>${stats.structureDiversity30}</strong><span>30 天结构种类</span></div><div><strong>${stats.streak.best}</strong><span>最长连续天数</span></div></div></section>
    </div>
    <section class="dashboard-section metric-trends"><div class="section-heading"><div><p class="eyebrow">滚动 30 天</p><h2>分项指标趋势</h2></div><span>至少 2 次后用于训练建议</span></div>${metricEntries.length ? `<div class="metric-table">${metricEntries.map(([id, value]) => `<div><div><strong>${escapeHtml(METRICS[id]?.label ?? id)}</strong><small>${value.count} 次观察</small></div><progress value="${value.average}" max="5" aria-label="平均 ${value.average} 分"></progress><span>${value.average}</span><em class="${value.change > 0 ? "positive-text" : value.change < 0 ? "negative-text" : ""}">${value.change > 0 ? "+" : ""}${value.change.toFixed(1)}</em></div>`).join("")}</div>` : `<div class="empty-inline"><p>完成至少两次训练后，这里会显示分项趋势。</p></div>`}</section>
    <section class="dashboard-section problems-section"><div class="section-heading"><div><p class="eyebrow">只识别重复描述</p><h2>反复出现的问题</h2></div></div>${stats.problems.length ? `<div class="problem-list">${stats.problems.map((item) => `<div><span>${escapeHtml(item.problem)}</span><strong>${item.count} 次</strong>${item.count >= 3 ? `<em>建议强化</em>` : ""}</div>`).join("")}</div>` : `<div class="empty-inline"><p>还没有可汇总的重复问题。</p></div>`}</section>
    </details>` : ""}
    ${legacyRates.length ? `<details class="legacy-ability"><summary>${icon("archive")}旧版实战回合（只读，旧检查项口径）</summary><section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">旧版训练</p><h2>旧版实战回合做到率</h2></div><span>最近 20 回合</span></div><div class="check-rate-table">${legacyRates.map(([id, entry]) => { const check = LEGACY_CHECKS[id] ?? CHECKS[id]; return `<div><div><strong>${escapeHtml(check?.label ?? id)}</strong><small>${entry.attempts} 次 · ${escapeHtml(check?.question ?? "")}</small></div><div class="rate-bars"><span><i data-rate-width="${entry.firstRate}"></i></span><em>首轮 ${entry.firstRate}%</em><span class="is-second"><i data-rate-width="${entry.secondRate}"></i></span><em>重讲 ${entry.secondRate}%</em></div></div>`; }).join("")}</div></section></details>` : ""}
  `;
  return renderShell(content, { title: "能力档案" });
}

function renderSettings() {
  const content = `
    <div class="page-heading"><div><p class="eyebrow">设置</p><h1>训练与本地数据</h1><p>调整当前阶段、计时体验、录音保留和数据迁移。</p></div></div>
    <div class="settings-layout">
      <section class="settings-section"><div class="settings-head"><div>${icon("target")}</div><span><h2>训练偏好</h2><p>当前阶段决定练习题在四条线之间的比例；题目难度随完成量自动提高。</p></span></div>
        <div class="setting-row stacked"><div><span>当前阶段</span><small>决定四条线的出题比例，可以随时改。</small></div>${renderStageSelector("setting-stage")}</div>
        <div class="setting-row stacked"><div><span>首页默认模式</span><small>随时可以在开始前临时切换。</small></div>${renderModeSelector(state.settings.defaultMode, "setting-mode")}</div>
      </section>
      <section class="settings-section"><div class="settings-head"><div>${icon("clock")}</div><span><h2>执行体验</h2><p>计时到点只提示，不强制停止。</p></span></div>
        ${renderToggle("soundEnabled", "计时提示音", "阶段到点时播放一次温和提示。")}
        ${renderToggle("reducedMotion", "减少动态效果", "关闭非必要过渡和闪动。")}
        ${renderToggle("keepRecordings", "完成后保留录音", "关闭后，本次总结离开时删除两次录音，仅保留文字记录。")}
      </section>
      <section class="settings-section data-section"><div class="settings-head"><div>${icon("archive")}</div><span><h2>本地数据</h2><p>训练笔记与录音默认保存在当前浏览器。</p></span></div>
        <div class="storage-summary"><div><span>练习回合</span><strong>${state.drills.filter((drill) => drill.schemaVersion === 2).length}</strong></div><div><span>旧版训练记录</span><strong>${state.storage.sessionCount}</strong></div><div><span>本地录音</span><strong>${state.storage.recordingCount}</strong></div><div><span>录音占用</span><strong>${formatBytes(state.storage.recordingBytes)}</strong></div></div>
        <div class="data-actions"><button class="button button-secondary" type="button" data-action="export-data">${icon("download")}导出 JSON</button><label class="button button-secondary file-button">${icon("upload")}导入 JSON<input type="file" accept="application/json,.json" data-import-file></label>${state.installPrompt ? `<button class="button button-secondary" type="button" data-action="install-app">${icon("download")}安装到设备</button>` : ""}<button class="button button-danger-ghost" type="button" data-action="open-clear-data">${icon("trash")}清除全部本地数据</button></div>
        <p class="data-note">JSON 导出不包含录音文件。导入会合并训练记录并覆盖设置。</p>
      </section>
      <section class="settings-section privacy-section"><div class="settings-head"><div>${icon("info")}</div><span><h2>隐私边界</h2><p>本应用不主动收集行为数据，也不接入广告或分析服务。</p></span></div><p>训练笔记与录音默认仅保存在当前设备的浏览器存储中。静态服务器仍可能处理提供网页所必需的基础访问信息，例如 IP 地址和 User-Agent；具体取决于部署环境。</p><p>麦克风只在你点击录音后请求权限。关闭页面前请先停止录音。</p></section>
    </div>
  `;
  return renderShell(content, { title: "设置" });
}

/**
 * “当前阶段”单选组：设置页与首次引导共用，仅 data-action 不同。
 *
 * @param {string} action 点击时分发的动作名
 * @returns {string} 单选组 HTML
 */
function renderStageSelector(action) {
  const current = state.settings.careerStage;
  return `<div class="segmented" role="radiogroup" aria-label="当前阶段">${CAREER_STAGES.map((id) => `<button type="button" role="radio" aria-checked="${current === id}" tabindex="${current === id ? "0" : "-1"}" class="${current === id ? "is-active" : ""}" data-action="${action}" data-value="${id}"><span>${CAREER_STAGE_LABELS[id].label}</span><small>${CAREER_STAGE_LABELS[id].hint}</small></button>`).join("")}</div>`;
}

function renderToggle(id, label, description) {
  return `<label class="setting-row toggle-row"><span><b>${escapeHtml(label)}</b><small>${escapeHtml(description)}</small></span><input type="checkbox" role="switch" data-setting="${id}"${checked(state.settings[id])}><i aria-hidden="true"></i></label>`;
}

function renderModal() {
  if (!state.modal) {
    return "";
  }
  if (state.modal.type === "history") {
    const session = state.sessions.find((item) => item.sessionId === state.modal.sessionId);
    return session ? renderHistoryModal(session) : "";
  }
  if (state.modal.type === "clear") {
    return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-title" data-modal-panel><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="关闭">${icon("x")}</button><p class="eyebrow danger-text">不可撤销</p><h2 id="modal-title">清除全部本地数据？</h2><p>训练记录、课程进度、当前进度、设置和本地录音都会从这个浏览器中删除。</p><label class="field"><span>输入“清除”确认</span><input type="text" data-clear-confirm autocomplete="off"></label><div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">取消</button><button class="button button-danger" type="button" data-action="confirm-clear-data">永久清除</button></div></section></div>`;
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
    <div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">关闭</button></div></section></div>`;
}

/** 首次引导：训练目标、怎么练、选择当前阶段。 */
function renderOnboarding() {
  return `<div class="modal-backdrop onboarding-backdrop"><section class="modal onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" data-modal-panel><img src="/icons/icon.svg" alt="" width="58" height="58"><p class="eyebrow">首次使用</p><h2 id="onboarding-title">从不会开口，到能说会道</h2><div class="principle-list"><div><span>01</span><p><strong>训练目标</strong>从“不知道怎么开口”练到“能说会道”，终点是能带团队、见投资人、对外讲清楚一件事的创业者。</p></div><div><span>02</span><p><strong>怎么练</strong>先学一种表达结构（共 30 课），再在学术、生活、转化、创业四条线的真实场合里限时开口、被打断、回听自查、重讲。</p></div><div><span>03</span><p><strong>选择当前阶段</strong>它决定四条线的出题比例，之后可以在设置里随时修改。数据只留在当前设备。</p></div></div><div class="onboarding-choice"><span>当前阶段</span>${renderStageSelector("onboarding-stage")}</div><button class="button button-primary button-large" type="button" data-action="complete-onboarding">开始训练${icon("arrowRight")}</button></section></div>`;
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
    applyTopicDrawMotion();
  } else if (view === "drill") {
    root.innerHTML = renderShell(arena.renderWorkspace(), { title: "练习回合" });
  } else if (view === "lesson") {
    root.innerHTML = renderShell(lessons.renderWorkspace(), { title: "学一课" });
  } else if (view === "lessons") {
    root.innerHTML = renderLessonsPage();
  } else if (view === "history") {
    root.innerHTML = renderHistory();
  } else if (view === "ability") {
    root.innerHTML = renderAbility();
  } else {
    root.innerHTML = renderSettings();
  }
  document.title = `${root.querySelector(".topbar-title")?.textContent ?? "讲明白"} · 讲明白`;
  hydrateAudioPlayers(state.renderVersion);
  arena.afterRender();
  lessons.afterRender();
  applyRateBars(root);
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

function prefersReducedMotion() {
  return state.settings.reducedMotion || Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/**
 * 首页抽题：从已学范式中按阶段比例、弱项与复练计划选一道题，轮转 5 秒后定格。
 *
 * @param {{ mode?: string }} options 本次抽题对应的回合模式
 */
async function runTopicDraw({ mode = state.homeMode } = {}) {
  const selection = selectPracticeCard({
    drills: state.drills,
    learned: learnedParadigms(state.lessonRuns),
    recent: recentlyLearned(state.lessonRuns),
    careerStage: state.settings.careerStage,
  });
  if (!selection) {
    showToast("先学完第 1 课，练习题才会出现。", "danger");
    return;
  }
  const sequence = drawSequence({ cards: PRACTICE_CARDS, winner: selection.card });
  const reducedMotion = prefersReducedMotion();
  const revision = ++topicDrawRevision;
  state.topicDraw = {
    mode,
    status: reducedMotion ? "settled" : "spinning",
    startedAt: performance.now(),
    winnerId: selection.card.id,
    winnerIndex: sequence.winnerIndex,
    cardIds: sequence.cards.map((card) => card.id),
    selectionReason: selection.reason,
    revisitOf: selection.revisitOf,
    avoidPressures: selection.avoidPressures,
  };
  state.pendingAnnouncement = reducedMotion ? `已抽中${selection.card.title}` : "题目开始轮转";
  render();
  if (reducedMotion) return;
  await new Promise((resolve) => setTimeout(resolve, TOPIC_DRAW_DURATION_MS));
  if (revision !== topicDrawRevision || state.homeMode !== mode) return;
  state.topicDraw = { ...state.topicDraw, status: "settled" };
  state.pendingAnnouncement = `已抽中${selection.card.title}`;
  render();
}

/** 首页独立的复练入口：直接开始最早到期的一张，不经过抽题。 */
async function startRevisit() {
  const revisit = dueRevisits(state.drills)[0];
  if (!revisit) return;
  const selection = revisitSelection(revisit);
  if (!selection.card) return;
  resetTopicDraw();
  await arena.startDrill(selection.card, {
    mode: state.homeMode,
    selectionReason: selection.reason,
    revisitOf: selection.revisitOf,
    avoidPressures: selection.avoidPressures,
  });
}

/**
 * 学完一课后直接用该范式练一回合：避开这课迁移步骤用过的题卡。
 *
 * @param {string} paradigmId 刚学完的范式 ID
 */
async function practiceParadigm(paradigmId) {
  const lastRun = [...state.lessonRuns].reverse().find((run) => run.schemaVersion === 2 && run.paradigmId === paradigmId);
  const cards = PRACTICE_CARDS.filter((card) => card.paradigmId === paradigmId && card.id !== lastRun?.transferCardId);
  const selection = selectPracticeCard({ cards, drills: state.drills, learned: new Set([paradigmId]), careerStage: state.settings.careerStage });
  if (!selection) return;
  resetTopicDraw();
  await arena.startDrill(selection.card, { mode: state.homeMode, selectionReason: "学完立即练习 · 换一个语境、没有提示、会被打断" });
}

async function startDrawnTopic() {
  const draw = currentTopicDraw();
  const card = draw?.status === "settled" ? PRACTICE_CARD_MAP.get(draw.winnerId) : null;
  if (!card) {
    await runTopicDraw();
    return;
  }
  resetTopicDraw();
  await arena.startDrill(card, {
    mode: draw.mode,
    selectionReason: draw.selectionReason,
    revisitOf: draw.revisitOf,
    avoidPressures: draw.avoidPressures,
  });
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
    resetTopicDraw();
    state.homeMode = value;
  }
  applySettings();
}

async function exportData() {
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
    await importLocalData(data);
    // 导入的旧版进行中训练立即归档，避免旧流程卡在首页
    const archivedLegacy = await archiveLegacyInProgress().catch(() => 0);
    await loadLocalState();
    resetTopicDraw();
    applySettings();
    render();
    showToast(archivedLegacy ? "数据导入完成，旧版训练的进行中进度已归档到历史。" : "数据导入完成。", "default");
  } catch (error) {
    showToast(error.message || "数据导入失败。", "danger");
  }
}

root.addEventListener("click", async (event) => {
  const modalPanel = root.querySelector("[data-modal-panel]");
  const explicitModalControl = event.target.closest("[data-modal-panel] [data-action]");
  if (state.modal && modalPanel?.contains(event.target) && !explicitModalControl) {
    return;
  }
  const control = explicitModalControl ?? event.target.closest("[data-action]");
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
  if (action.startsWith("drill-")) {
    await arena.handleAction(action, control);
  } else if (action.startsWith("lesson-")) {
    await lessons.handleAction(action, control);
  } else if (action === "resume-drill") {
    navigate("drill");
  } else if (action === "resume-lesson") {
    navigate("lesson");
  } else if (action === "start-revisit") {
    await startRevisit();
  } else if (action === "setting-stage" || action === "onboarding-stage") {
    await updateSetting("careerStage", control.dataset.value);
    resetTopicDraw();
    // 重渲染后把焦点还给同一个选项，方向键切换时不丢焦点
    state.pendingFocus = { type: "control", descriptor: describeControl(control) };
    render();
  } else if (action === "navigate") {
    navigate(control.dataset.view);
  } else if (action === "home-mode") {
    if (state.homeMode !== control.dataset.value) resetTopicDraw();
    state.homeMode = control.dataset.value;
    // 与阶段选择一致：重渲染后把焦点还给同一个选项，方向键切换时不丢焦点
    state.pendingFocus = { type: "control", descriptor: describeControl(control) };
    render();
  } else if (action === "setting-mode") {
    await updateSetting("defaultMode", control.dataset.value);
    state.pendingFocus = { type: "control", descriptor: describeControl(control) };
    render();
  } else if (action === "explore-topics") {
    // 抽题动画持续 5 秒，不能占住互斥锁，否则期间其他操作都会被吞掉
    void runTopicDraw().catch((error) => showToast(error?.message || "抽题失败，请重试。", "danger"));
  } else if (action === "start-home") {
    if (currentTopicDraw()?.status !== "settled") {
      void runTopicDraw().catch((error) => showToast(error?.message || "抽题失败，请重试。", "danger"));
    } else {
      await startDrawnTopic();
    }
  } else if (action === "close-modal") {
    closeModal(event);
  } else if (action === "clear-history-filters") {
    state.historyFilters = { query: "", scene: "", domain: "", taskType: "", structureId: "", difficulty: "", retry: "", problem: "", migration: "", completionStatus: "" };
    render();
  } else if (action === "open-history-session") {
    openModal({ type: "history", sessionId: control.dataset.sessionId }, control);
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
      if (control.isConnected) control.disabled = false;
    }
  }
});

root.addEventListener("input", (event) => {
  const target = event.target;
  if (arena.handleInput(target) || lessons.handleInput(target)) {
    return;
  }
  if (target.matches("[data-history-filter='query']")) {
    // 旧版记录搜索：边输入边筛选，防抖后重渲染并恢复光标位置
    state.historyFilters.query = target.value;
    debounceFilterRender(target);
  }
});

let filterTimer;
function debounceFilterRender(target) {
  clearTimeout(filterTimer);
  const position = target.selectionStart;
  filterTimer = setTimeout(() => {
    render();
    const replacement = root.querySelector("[data-history-filter='query']");
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
  if (target.matches("[data-history-filter]")) {
    state.historyFilters[target.dataset.historyFilter] = target.value;
    render();
  } else if (target.matches("[data-setting]")) {
    const id = target.dataset.setting;
    const value = target.type === "checkbox" ? target.checked : target.value;
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

/**
 * 地址栏 hash 变化：页内锚点（如“跳到主要内容”）只移动焦点不切换页面；
 * 表达进行中拒绝离开当前页面；其余未知 hash 回到首页。
 */
window.addEventListener("hashchange", () => {
  let requested = location.hash.slice(1);
  try {
    requested = decodeURIComponent(requested);
  } catch {
    // 非法转义按未知 hash 处理
  }
  const anchor = !validViews.has(requested) && requested ? document.getElementById(requested) : null;
  if (anchor) {
    history.replaceState(null, "", `#${state.view}`);
    if (!anchor.hasAttribute("tabindex")) anchor.setAttribute("tabindex", "-1");
    anchor.focus();
    return;
  }
  const next = validViews.has(requested) ? requested : "home";
  if (next !== state.view && (arena.isBusy() || lessons.isBusy())) {
    history.replaceState(null, "", `#${state.view}`);
    showToast(BUSY_NAVIGATION_MESSAGE, "danger");
    return;
  }
  if (next !== requested) history.replaceState(null, "", `#${next}`);
  state.view = next;
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

window.addEventListener("beforeunload", (event) => {
  if (arena.isBusy() || lessons.isBusy()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

/**
 * 从本地存储读取全部状态。
 *
 * 进行中的回合或课程若不是新版（schemaVersion 2），说明启动归档失败，按无进行中处理。
 */
async function loadLocalState() {
  [state.settings, state.sessions, state.storage, state.drills, state.activeDrill, state.lessonRuns, state.activeLesson] = await Promise.all([
    loadSettings(),
    loadSessions(),
    storageSummary(),
    loadDrills(),
    loadActiveDrill(),
    loadLessonRuns(),
    loadActiveLesson(),
  ]);
  if (state.activeDrill?.schemaVersion !== 2) state.activeDrill = null;
  if (state.activeLesson?.schemaVersion !== 2) state.activeLesson = null;
  state.sessions.sort((left, right) => sessionTimestamp(left) - sessionTimestamp(right));
  state.homeMode = state.settings.defaultMode;
}

async function initialize() {
  // 先归档旧版进行中训练，再读取状态
  const archivedLegacy = await archiveLegacyInProgress().catch(() => 0);
  try {
    await loadLocalState();
  } catch {
    showToast("无法读取部分本地数据，将以默认设置启动。", "danger");
  }
  const requested = location.hash.slice(1);
  state.view = validViews.has(requested) ? requested : "home";
  if (!location.hash) {
    history.replaceState(null, "", "#home");
  }
  render();
  if (archivedLegacy) showToast("旧版训练的进行中进度已归档到历史。");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline installation is optional during local development.
    });
  }
}

initialize();
