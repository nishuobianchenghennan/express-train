/**
 * 学习模式的界面与控制器：首页课程路径 + 单课工作台。
 */
import { ARENA_CARD_MAP, CHECKS, FAMILIES, SCENARIO_MAP } from "./scenarios.js";
import { INDUSTRY_MAP } from "./industries.js";
import { LESSON_MAP, LESSONS } from "./lessons.js";
import {
  LESSON_ORDER,
  LESSON_TAKE_GRACE_SECONDS,
  advanceLesson,
  checkKeys,
  createLessonRun,
  lessonProgress,
  lessonTakeSlot,
  missedSteps,
  recommendedLesson,
  stepCoverage,
  stepKey,
  validateLessonPhase,
} from "./lesson-engine.js";
import { createTakeRunner } from "./recorder.js";

const TICK_MS = 250;
const STEP_GROUPS = [
  { label: "看懂场景", phases: ["intro"] },
  { label: "拆解示范", phases: ["model"] },
  { label: "模仿复述", phases: ["retell1", "check1"] },
  { label: "优化再讲", phases: ["retell2", "check2"] },
  { label: "换行业迁移", phases: ["transfer", "check3"] },
  { label: "完成", phases: ["done"] },
];
const TAKE_LABELS = Object.freeze({ retell1: "第一次复述", retell2: "优化后再讲", transfer: "迁移表达" });

function formatClock(totalSeconds) {
  const absolute = Math.max(0, Math.round(totalSeconds));
  return `${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

/**
 * 创建学习模式控制器。
 *
 * @param {object} ctx 由 app.js 注入的状态与工具函数
 */
export function createLessonController(ctx) {
  const { state, escapeHtml, icon } = ctx;
  const takes = createTakeRunner({
    showToast: (message, tone) => ctx.showToast(message, tone),
    onChange: () => ctx.render(),
    saveRecording: (id, blob) => ctx.saveRecording(id, blob),
  });
  let ticker = null;
  let saveTail = Promise.resolve();
  let textTimer = null;
  let confirmAbandon = false;

  const activeLesson = () => LESSON_MAP.get(state.activeLesson?.scenarioId);

  function persist(run) {
    state.activeLesson = run;
    const snapshot = run ? structuredClone(run) : null;
    saveTail = saveTail
      .then(() => ctx.saveLessonProgress(snapshot))
      .catch(() => ctx.showToast("本地进度保存失败，请先不要关闭页面。", "danger"));
    return saveTail;
  }

  function archive(run) {
    state.lessonRuns = [...state.lessonRuns.filter((item) => item.runId !== run.runId), run];
  }

  async function startLesson(scenarioId) {
    if (state.activeLesson?.status === "in_progress") {
      if (state.activeLesson.scenarioId === scenarioId) {
        ctx.navigate("lesson");
        return;
      }
      ctx.showToast("还有一课没有完成，请先完成或放弃当前课程。", "danger");
      ctx.navigate("lesson");
      return;
    }
    const lesson = LESSON_MAP.get(scenarioId);
    if (!lesson) return;
    confirmAbandon = false;
    await persist(createLessonRun(lesson, { runs: state.lessonRuns }));
    ctx.navigate("lesson");
  }

  async function goToNext(run) {
    const next = advanceLesson(run);
    if (next.status === "completed") archive(next);
    await persist(next);
    ctx.render();
    globalThis.scrollTo?.({ top: 0, behavior: "auto" });
  }

  async function advance() {
    const run = state.activeLesson;
    if (!run) return;
    const validation = validateLessonPhase(run);
    if (!validation.valid) {
      ctx.showToast(validation.message, "danger");
      return;
    }
    await goToNext(run);
  }

  async function startTake(record) {
    const run = state.activeLesson;
    const slot = lessonTakeSlot(run?.phase);
    if (!run || !slot || slot !== run.phase) return;
    const started = await takes.start({ record, id: `${run.runId}-${slot}` });
    if (started) ctx.render();
  }

  async function finishTake() {
    const run = state.activeLesson;
    const slot = run?.phase;
    const result = await takes.finish();
    if (!result || !LESSON_TAKE_SLOTS.has(slot) || state.activeLesson?.runId !== run.runId) return;
    const current = state.activeLesson;
    await goToNext({ ...current, takes: { ...current.takes, [slot]: result.take } });
  }

  async function abandon() {
    takes.cancel();
    const run = state.activeLesson;
    if (!run) return;
    const archived = { ...run, status: "abandoned", completedAt: null };
    archive(archived);
    await persist(archived);
    await persist(null);
    confirmAbandon = false;
    ctx.navigate("home");
  }

  async function close() {
    await persist(null);
    ctx.navigate("home");
  }

  function tick() {
    const run = state.activeLesson;
    const lesson = activeLesson();
    if (!run || !lesson || state.view !== "lesson") return;
    const elapsed = takes.elapsedSeconds();
    if (elapsed == null) return;
    const target = ARENA_CARD_MAP.get(run.phase === "transfer" ? run.transferCardId : run.exampleCardId).speakSeconds;
    const clock = ctx.root.querySelector("[data-lesson-clock]");
    if (clock) clock.textContent = formatClock(elapsed);
    const over = ctx.root.querySelector("[data-lesson-over]");
    if (over && elapsed > target) over.hidden = false;
    // 复述不设硬性时限，超过建议时长两倍后自动结束，避免忘记停止
    if (elapsed > target * 2 + LESSON_TAKE_GRACE_SECONDS) void finishTake();
  }

  function syncTicker() {
    const shouldRun = state.view === "lesson" && takes.isRunning();
    if (shouldRun && !ticker) ticker = setInterval(tick, TICK_MS);
    if (!shouldRun && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  async function hydrateAudio(version) {
    const slots = [...ctx.root.querySelectorAll("[data-lesson-audio]")];
    await Promise.all(slots.map(async (slot) => {
      const recording = await ctx.loadRecording(slot.dataset.lessonAudio);
      if (version !== state.renderVersion || !slot.isConnected) return;
      if (!recording?.blob) {
        slot.textContent = "录音未找到。";
        return;
      }
      const url = URL.createObjectURL(recording.blob);
      state.audioUrls.push(url);
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = url;
      slot.replaceChildren(audio);
    }));
  }

  function afterRender() {
    syncTicker();
    tick();
    if (state.view === "lesson") void hydrateAudio(state.renderVersion);
  }

  function updateRun(patch, { render = false } = {}) {
    const run = state.activeLesson;
    if (!run) return;
    const next = typeof patch === "function" ? patch(run) : { ...run, ...patch };
    void persist(next);
    if (render) ctx.render();
  }

  async function handleAction(action, control) {
    if (action === "lesson-start") {
      await startLesson(control.dataset.scenario);
    } else if (action === "lesson-resume") {
      ctx.navigate("lesson");
    } else if (action === "lesson-advance") {
      await advance();
    } else if (action === "lesson-take-start") {
      await startTake(control.dataset.record === "1");
    } else if (action === "lesson-take-finish") {
      await finishTake();
    } else if (action === "lesson-check") {
      const slot = control.dataset.slot;
      updateRun((run) => ({ ...run, checks: { ...run.checks, [slot]: { ...run.checks[slot], [control.dataset.key]: control.dataset.value === "yes" } } }), { render: true });
    } else if (action === "lesson-abandon") {
      confirmAbandon = true;
      ctx.render();
    } else if (action === "lesson-abandon-cancel") {
      confirmAbandon = false;
      ctx.render();
    } else if (action === "lesson-abandon-confirm") {
      await abandon();
    } else if (action === "lesson-close") {
      await close();
    } else if (action === "lesson-practice") {
      const scenarioId = state.activeLesson?.scenarioId;
      await close();
      ctx.onPracticeScenario?.(scenarioId);
    } else if (action === "lesson-next") {
      await close();
      await startLesson(recommendedLesson(state.lessonRuns).scenarioId);
    } else {
      return false;
    }
    return true;
  }

  function handleInput(target) {
    if (!target.matches("[data-lesson-text]")) return false;
    clearTimeout(textTimer);
    state.activeLesson = { ...state.activeLesson, lesson: target.value };
    textTimer = setTimeout(() => void persist(state.activeLesson), 300);
    return true;
  }

  // ---------- 渲染 ----------

  function renderStepper(run) {
    const currentIndex = STEP_GROUPS.findIndex((group) => group.phases.includes(run.phase));
    return `<ol class="drill-steps" aria-label="学习进度">${STEP_GROUPS.map((group, index) => `<li class="${index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : ""}"><span>${index + 1}</span>${group.label}</li>`).join("")}</ol>`;
  }

  function renderCard(card, { compact = false, label = "示范场景" } = {}) {
    const industry = INDUSTRY_MAP.get(card.industryId);
    return `<section class="drill-situation${compact ? " is-compact" : ""}">
      <div class="drill-tags"><span class="family-tag family-${card.family}">${escapeHtml(label)} · ${escapeHtml(card.scenarioLabel)}</span><span class="industry-tag">${escapeHtml(industry?.label ?? "")}</span><span>建议 ${card.speakSeconds} 秒</span></div>
      <h2>${escapeHtml(card.title)}</h2>
      ${compact ? "" : `<p>${escapeHtml(card.situation)}</p>`}
      <dl><div><dt>对象</dt><dd>${escapeHtml(card.counterpart)}</dd></div><div><dt>目标</dt><dd>${escapeHtml(card.goal)}</dd></div></dl>
    </section>`;
  }

  function renderSteps(lesson, { phrases = true, purposes = true, highlight = new Set() } = {}) {
    return `<ol class="structure-steps">${lesson.steps.map((item, index) => `<li class="step-${index}${highlight.has(index) ? " is-missed" : ""}"><span class="step-index">${index + 1}</span><div><strong>${escapeHtml(item.label)}</strong>${purposes ? `<p>${escapeHtml(item.purpose)}</p>` : ""}${phrases ? `<em>句式：${escapeHtml(item.phrase)}</em>` : ""}</div></li>`).join("")}</ol>`;
  }

  function renderModelBreakdown(lesson) {
    return `<div class="model-breakdown">${lesson.model.map((item) => `<div class="model-line step-${item.step}"><span class="step-chip step-${item.step}">${item.step + 1} ${escapeHtml(lesson.steps[item.step].label)}</span><p>${escapeHtml(item.text)}</p><small>${icon("info")}${escapeHtml(item.why)}</small></div>`).join("")}</div>`;
  }

  function modelText(lesson) {
    return lesson.model.map((item) => item.text).join("");
  }

  function renderIntro(run, lesson) {
    const card = ARENA_CARD_MAP.get(run.exampleCardId);
    return `${renderCard(card)}
      <section class="drill-panel lesson-insight">
        <div><h3>${icon("alert")}这个场景难在哪</h3><p>${escapeHtml(lesson.hard)}</p></div>
        <div><h3>${icon("target")}对方此刻在想什么</h3><p>${escapeHtml(lesson.listener)}</p></div>
      </section>
      <section class="drill-panel">
        <p class="eyebrow">表达结构</p>
        <h3 class="structure-title">${escapeHtml(lesson.structure)}</h3>
        <p class="lesson-why">${escapeHtml(lesson.why)}</p>
        ${renderSteps(lesson)}
      </section>
      <div class="drill-actions"><button class="button button-primary button-large" type="button" data-action="lesson-advance">看示范回答${icon("arrowRight")}</button></div>`;
  }

  function renderModel(run, lesson) {
    const card = ARENA_CARD_MAP.get(run.exampleCardId);
    return `${renderCard(card, { compact: true })}
      <section class="drill-panel">
        <p class="eyebrow">示范回答 · 先完整读一遍，最好读出声</p>
        <blockquote class="model-full">${escapeHtml(modelText(lesson))}</blockquote>
        <p class="drill-hint">示范中的人名、数字和经历都是模拟的，用来展示结构，不代表真实数据。</p>
      </section>
      <section class="drill-panel">
        <h3>${icon("list")}逐句拆解：每一句在做什么、为什么有效</h3>
        ${renderModelBreakdown(lesson)}
      </section>
      <section class="drill-panel weak-example">
        <h3>${icon("x")}对比：常见的糟糕说法</h3>
        <blockquote>${escapeHtml(lesson.weak.text)}</blockquote>
        <ul>${lesson.weak.problems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
      <div class="drill-actions"><button class="button button-primary button-large" type="button" data-action="lesson-advance">${icon("check")}我理解了，开始复述</button></div>`;
  }

  function renderTakeControls() {
    if (takes.isRunning()) {
      return `<button class="button button-primary button-large" type="button" data-action="lesson-take-finish">${icon("check")}讲完了</button>`;
    }
    if (takes.isRequesting()) {
      return `<button class="button button-ghost" type="button" data-action="lesson-take-start" data-record="0">改为只计时，不录音</button>`;
    }
    return `<button class="button button-primary button-large" type="button" data-action="lesson-take-start" data-record="1">${icon("mic")}开始讲（录音）</button><button class="button button-ghost" type="button" data-action="lesson-take-start" data-record="0">只计时，不录音</button>`;
  }

  function renderTake(run, lesson) {
    const slot = run.phase;
    const isTransfer = slot === "transfer";
    const card = ARENA_CARD_MAP.get(isTransfer ? run.transferCardId : run.exampleCardId);
    const missed = slot === "retell2" ? new Set(missedSteps(run, "retell1").map((item) => item.index)) : new Set();
    const running = takes.isRunning();
    const intro = slot === "retell1"
      ? "示范已经收起来了。用你自己的话把示范回答复述一遍：不用逐字背，但要按结构走完每一步。下面保留了完整提示。"
      : slot === "retell2"
        ? "这次提示减少了：只剩步骤名，句式要靠你自己想。上一次漏掉的步骤已经标红，这次一定要讲到。"
        : "同一个结构，换一个行业。没有示范，只有步骤名。先花 20 秒想清楚：每一步在这个新场景里该换成什么内容？";
    const scaffold = slot === "retell1"
      ? renderSteps(lesson, { purposes: false })
      : renderSteps(lesson, { phrases: false, purposes: false, highlight: missed });
    return `${renderCard(card, { compact: !isTransfer, label: isTransfer ? "迁移场景" : "示范场景" })}
      ${isTransfer ? `<section class="drill-panel"><h3>${icon("shuffle")}迁移提示</h3><p>${escapeHtml(lesson.transfer)}</p></section>` : ""}
      <section class="drill-stage-card${running ? " is-live" : ""}">
        <p class="drill-prep-tip">${escapeHtml(intro)}</p>
        <div class="drill-live-head">${running ? `<span class="rec-dot" aria-hidden="true"></span><span>${takes.current?.recorder ? "正在录音" : "只计时（未录音）"}</span>` : takes.isRequesting() ? "<span>正在请求麦克风权限…</span>" : `<span>${TAKE_LABELS[slot]}</span>`}</div>
        <div class="drill-clock"><span>用时 · 建议 ${formatClock(card.speakSeconds)} 内讲完</span><strong data-lesson-clock>00:00</strong></div>
        <p class="drill-overtime" data-lesson-over hidden>已超过建议时长，试着用一句话收尾。</p>
        <div class="scaffold"><p class="eyebrow">${slot === "retell1" ? "提示：步骤 + 句式" : "提示：只剩步骤名"}</p>${scaffold}</div>
      </section>
      <div class="drill-actions">${renderTakeControls()}</div>`;
  }

  function renderAudio(take, label) {
    if (take?.recordingId) return `<div class="drill-audio"><span>${label}</span><div data-lesson-audio="${escapeHtml(take.recordingId)}">正在载入录音…</div></div>`;
    return `<div class="drill-audio is-empty"><span>${label}</span><p>这次没有录音，只能凭记忆判断，请从严。</p></div>`;
  }

  function renderToggle(slot, key, value) {
    return `<div class="check-toggle" role="group"><button type="button" class="${value === true ? "is-active" : ""}" aria-pressed="${value === true}" data-action="lesson-check" data-slot="${slot}" data-key="${key}" data-value="yes">做到</button><button type="button" class="${value === false ? "is-active" : ""}" aria-pressed="${value === false}" data-action="lesson-check" data-slot="${slot}" data-key="${key}" data-value="no">没做到</button></div>`;
  }

  function renderCheck(run, lesson) {
    const slot = lessonTakeSlot(run.phase);
    const isTransfer = slot === "transfer";
    const card = ARENA_CARD_MAP.get(isTransfer ? run.transferCardId : run.exampleCardId);
    const previous = slot === "retell2" ? "retell1" : slot === "transfer" ? "retell2" : null;
    const stepRows = lesson.steps.map((item, index) => {
      const key = stepKey(index);
      const value = run.checks[slot][key];
      const before = previous ? run.checks[previous][key] : undefined;
      return `<div class="check-row${value === true ? " is-yes" : value === false ? " is-no" : ""}"><div><strong><span class="step-chip step-${index}">${index + 1}</span>${escapeHtml(item.label)}</strong><p>我讲出了这一步吗？${escapeHtml(item.purpose)}</p>${typeof before === "boolean" ? `<small>上一次：${before ? "做到" : "没做到"}</small>` : ""}</div>${renderToggle(slot, key, value)}</div>`;
    }).join("");
    const keyRows = isTransfer
      ? card.checks.map((id) => {
        const value = run.checks.transfer[id];
        return `<div class="check-row${value === true ? " is-yes" : value === false ? " is-no" : ""}"><div><strong>${escapeHtml(CHECKS[id].label)}</strong><p>${escapeHtml(CHECKS[id].question)}</p></div>${renderToggle(slot, id, value)}</div>`;
      }).join("")
      : "";
    const judged = checkKeys(run, run.phase).every((key) => typeof run.checks[slot][key] === "boolean");
    const missed = judged ? missedSteps(run, slot) : [];
    const nextLabel = run.phase === "check1" ? "优化后再讲一遍" : run.phase === "check2" ? "换一个行业迁移" : "完成这一课";
    return `${renderCard(card, { compact: true, label: isTransfer ? "迁移场景" : "示范场景" })}
      <section class="drill-panel">
        <h3>${icon("history")}回听${TAKE_LABELS[slot]}，对照结构自查</h3>
        <p class="drill-hint">先完整回听一遍再判断。<strong>拿不准就算没做到</strong>。</p>
        <div class="drill-audio-row">${renderAudio(run.takes[slot], TAKE_LABELS[slot])}</div>
        <div class="check-list">${stepRows}</div>
        ${isTransfer ? `<p class="eyebrow check-subhead">这个场景的关键行为</p><div class="check-list">${keyRows}</div>` : ""}
        <details class="structure-reference"><summary>${icon("book")}${isTransfer ? "参考：示范场景的回答（不同行业，同一结构）" : "对照示范回答"}</summary>${renderModelBreakdown(lesson)}</details>
      </section>
      ${judged ? `<section class="drill-panel"><h3>${icon("target")}下一次怎么优化</h3>${missed.length ? `<ul class="fix-list">${missed.map((item) => `<li><strong>补上「${escapeHtml(item.label)}」</strong><span>可以这样说：${escapeHtml(item.phrase)}</span></li>`).join("")}</ul>` : `<p>结构的每一步都讲到了。${run.phase === "check3" ? "你已经能把这个结构迁移到新行业。" : "下一次试着讲得更自然、更像自己的话。"}</p>`}</section>` : ""}
      ${run.phase === "check3" ? `<section class="drill-panel"><label class="field"><span>这一课带走的一句话（例如这个结构最关键的一步）</span><textarea rows="2" data-lesson-text placeholder="例如：坏消息先说结论，再分开已知和未知">${escapeHtml(run.lesson)}</textarea></label></section>` : ""}
      <div class="drill-actions"><button class="button button-primary button-large" type="button" data-action="lesson-advance">${nextLabel}${icon("arrowRight")}</button></div>`;
  }

  function renderDone(run, lesson) {
    const rows = ["retell1", "retell2", "transfer"].map((slot) => {
      const coverage = stepCoverage(run, slot);
      return `<div class="drill-score${slot === "transfer" ? " is-second" : ""}"><span>${TAKE_LABELS[slot]}</span><strong>${coverage.hit}<small>/${coverage.total}</small></strong></div>`;
    }).join(`<div class="drill-score-arrow" aria-hidden="true">${icon("arrowRight")}</div>`);
    const transferCard = ARENA_CARD_MAP.get(run.transferCardId);
    const keyPassed = transferCard.checks.filter((id) => run.checks.transfer[id] === true).length;
    return `<section class="drill-result">${rows}<p>结构步骤覆盖：从模仿到迁移。迁移场景的关键行为做到 ${keyPassed}/${transferCard.checks.length} 项。</p></section>
      <section class="drill-panel">
        <p class="eyebrow">你学会的结构</p>
        <h3 class="structure-title">${escapeHtml(lesson.structure)}</h3>
        ${renderSteps(lesson, { purposes: false })}
        ${run.lesson ? `<p class="drill-lesson">带走：${escapeHtml(run.lesson)}</p>` : ""}
        <p class="drill-hint">下一步建议去实践模式：没有示范、没有提示，还会被打断和追问，检验这个结构能不能在压力下用出来。</p>
      </section>
      <div class="drill-actions"><button class="button button-primary button-large" type="button" data-action="lesson-practice">${icon("play")}去实践模式练这个场景</button><button class="button button-secondary" type="button" data-action="lesson-next">学下一课${icon("arrowRight")}</button><button class="button button-ghost" type="button" data-action="lesson-close">回到首页</button></div>`;
  }

  function renderWorkspace() {
    const run = state.activeLesson;
    const lesson = activeLesson();
    if (!run || !lesson) {
      return `<section class="empty-state"><div>${icon("book")}</div><h1>没有进行中的课程</h1><p>回到首页，在学习模式中选一课开始。</p><button class="button button-primary" type="button" data-action="navigate" data-view="home">返回首页</button></section>`;
    }
    let body;
    if (run.phase === "intro") body = renderIntro(run, lesson);
    else if (run.phase === "model") body = renderModel(run, lesson);
    else if (LESSON_TAKE_SLOTS.has(run.phase)) body = renderTake(run, lesson);
    else if (run.phase === "done") body = renderDone(run, lesson);
    else body = renderCheck(run, lesson);
    const order = LESSON_ORDER.findIndex((item) => item.scenarioId === lesson.scenarioId) + 1;
    const abandonControls = run.phase === "done"
      ? ""
      : confirmAbandon
        ? `<div class="abandon-confirm"><span>放弃后这一课记为未完成。</span><button class="button button-ghost" type="button" data-action="lesson-abandon-cancel">继续学习</button><button class="button button-danger" type="button" data-action="lesson-abandon-confirm">确认放弃</button></div>`
        : `<button class="text-button" type="button" data-action="lesson-abandon">${icon("x")}放弃这一课</button>`;
    return `<div class="drill-workspace">
      <header class="drill-header"><div><p class="eyebrow">学习模式 · 第 ${order} / ${LESSONS.length} 课 · ${escapeHtml(SCENARIO_MAP.get(lesson.scenarioId).label)}</p>${renderStepper(run)}</div>${abandonControls}</header>
      ${body}
    </div>`;
  }

  return { afterRender, handleAction, handleInput, isBusy: () => takes.isBusy(), renderWorkspace, startLesson };
}

const LESSON_TAKE_SLOTS = new Set(["retell1", "retell2", "transfer"]);

/** 学习模式首页：推荐下一课 + 按场景家族排列的课程路径。 */
export function renderLearnHome({ runs, activeRun }, { escapeHtml, icon }) {
  const progress = lessonProgress(runs);
  const learnedCount = Object.keys(progress).length;
  const next = recommendedLesson(runs);
  const nextScenario = SCENARIO_MAP.get(next.scenarioId);
  const activeLesson = activeRun?.status === "in_progress" ? LESSON_MAP.get(activeRun.scenarioId) : null;
  const hero = activeLesson
    ? `<div class="lesson-hero"><div><p class="eyebrow">进行中</p><h2>${escapeHtml(SCENARIO_MAP.get(activeLesson.scenarioId).label)}：${escapeHtml(activeLesson.structure)}</h2><p>进度已保存，回到课程会从当前步骤继续。</p></div><button class="button button-primary button-large" type="button" data-action="lesson-resume">${icon("play")}继续这一课</button></div>`
    : `<div class="lesson-hero"><div><p class="eyebrow">${learnedCount ? "推荐下一课" : "从这里开始"}</p><h2>${escapeHtml(nextScenario.label)}：${escapeHtml(next.structure)}</h2><p>${escapeHtml(next.hard)}</p></div><button class="button button-primary button-large" type="button" data-action="lesson-start" data-scenario="${next.scenarioId}">${icon("book")}开始这一课 · 约 12 分钟</button></div>`;
  const groups = Object.entries(FAMILIES).map(([familyId, family]) => {
    const items = LESSON_ORDER.filter((item) => SCENARIO_MAP.get(item.scenarioId).family === familyId);
    return `<section class="lesson-group"><h3><span class="family-tag family-${familyId}">${escapeHtml(family.label)}</span><small>${escapeHtml(family.description)}</small></h3><div class="lesson-grid">${items.map((item) => {
      const scenario = SCENARIO_MAP.get(item.scenarioId);
      const done = progress[item.scenarioId];
      return `<button type="button" class="lesson-tile${done ? " is-learned" : ""}${item === next && !activeLesson ? " is-next" : ""}" data-action="lesson-start" data-scenario="${item.scenarioId}"><span class="lesson-tile-head"><strong>${escapeHtml(scenario.label)}</strong><span>L${scenario.difficulty}</span></span><span class="lesson-structure">${escapeHtml(item.structure)}</span><span class="lesson-status">${done ? `${icon("check")}已学 ${done.completed} 次` : "未学"}</span></button>`;
    }).join("")}</div></section>`;
  }).join("");
  return `<section class="learn-home">
    <div class="learn-intro"><div><p class="eyebrow">学习模式 · 先模仿，再迁移</p><p>每一课学一个场景的表达结构：看懂场景 → 拆解示范回答 → 收起示范复述 → 对照自查后再讲 → 换一个行业迁移。</p></div></div>
    ${hero}
    ${groups}
  </section>`;
}
