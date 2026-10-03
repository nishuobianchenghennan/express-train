/**
 * 实战回合的界面与控制器。
 *
 * 渲染函数返回 HTML 字符串，由 app.js 的外壳统一挂载；
 * 计时与打断提示通过定时器直接更新 DOM，避免每 200ms 重渲染整页。
 */
import { ARENA_CARD_MAP, CHECKS, FAMILIES } from "./scenarios.js";
import { INDUSTRIES, INDUSTRY_MAP } from "./industries.js";
import {
  LEARN_SECONDS,
  OVERTIME_GRACE_SECONDS,
  advanceDrill,
  arenaStats,
  createDrill,
  drillOutcome,
  phaseSeconds,
  phaseSequence,
  pressureText,
  suggestFocus,
  takeSlot,
  validatePhase,
} from "./engine.js";

const TICK_MS = 200;
const STEP_GROUPS = [
  { label: "准备", phases: ["brief", "prep1"] },
  { label: "开口", phases: ["take1"] },
  { label: "回听", phases: ["check1"] },
  { label: "补课", phases: ["learn"] },
  { label: "追问重讲", phases: ["prep2", "take2"] },
  { label: "复盘", phases: ["check2", "done"] },
];
const TIMED_PHASES = new Set(["prep1", "take1", "learn", "prep2", "take2"]);

function formatClock(totalSeconds) {
  const sign = totalSeconds < 0 ? "+" : "";
  const absolute = Math.max(0, Math.round(Math.abs(totalSeconds)));
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

/** 估算一个回合的总时长（分钟），用于开始前告知用户。 */
export function estimateDrillMinutes(card, mode) {
  const reviewSeconds = 150;
  const base = card.prepSeconds + card.speakSeconds * 2 + reviewSeconds + 20;
  return Math.max(3, Math.ceil((base + (mode === "quick" ? 0 : LEARN_SECONDS)) / 60));
}

/**
 * 创建实战回合控制器。
 *
 * @param {object} ctx 由 app.js 注入的状态与工具函数
 */
export function createArenaController(ctx) {
  const { state, escapeHtml, icon } = ctx;
  let runtime = null;
  let ticker = null;
  let saveTail = Promise.resolve();
  let confirmAbandon = false;
  let advancing = false;
  let noteTimer = null;

  const activeCard = () => ARENA_CARD_MAP.get(state.activeDrill?.cardId);

  function persist(drill) {
    state.activeDrill = drill;
    const snapshot = drill ? structuredClone(drill) : null;
    saveTail = saveTail
      .then(() => ctx.saveDrillProgress(snapshot))
      .catch(() => ctx.showToast("本地进度保存失败，请先不要关闭页面。", "danger"));
    return saveTail;
  }

  function archiveIntoHistory(drill) {
    state.drills = [...state.drills.filter((item) => item.drillId !== drill.drillId), drill];
  }

  function isBusy() {
    return Boolean(runtime);
  }

  async function startDrill(card, options = {}) {
    if (state.activeDrill?.status === "in_progress") {
      ctx.navigate("drill");
      return;
    }
    const drill = createDrill(card, options);
    confirmAbandon = false;
    await persist(drill);
    ctx.navigate("drill");
  }

  async function goToPhase(drill) {
    const next = advanceDrill(drill);
    if (next.status === "completed") archiveIntoHistory(next);
    await persist(next);
    ctx.render();
  }

  async function advance() {
    const drill = state.activeDrill;
    const card = activeCard();
    // 计时器每 200ms 触发一次，推进尚未完成时忽略重复调用
    if (!drill || !card || advancing) return;
    const validation = validatePhase(drill, card);
    if (!validation.valid) {
      ctx.showToast(validation.message, "danger");
      return;
    }
    advancing = true;
    try {
      await goToPhase(drill);
      const phase = state.activeDrill.phase;
      if (phase === "take1" || phase === "take2") await startTake({ record: true });
    } finally {
      advancing = false;
    }
  }

  function stopStream(stream) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  /** 申请麦克风并启动录音器；失败时返回 null，由调用方退化为只计时。 */
  async function openRecorder(current) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      ctx.showToast("当前浏览器不支持录音，已改为只计时。回听检查只能凭记忆，准确度会下降。", "danger");
      return null;
    }
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (runtime !== current) {
        // 等待授权期间用户已改为只计时或离开了本阶段
        stopStream(stream);
        return null;
      }
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) current.chunks.push(event.data);
      });
      recorder.start(250);
      return { stream, recorder };
    } catch (error) {
      stopStream(stream);
      if (runtime === current) {
        ctx.showToast(error?.name === "NotAllowedError" ? "没有麦克风权限，已改为只计时。" : "无法启动录音，已改为只计时。", "danger");
      }
      return null;
    }
  }

  /**
   * 开始一次表达：优先录音，没有麦克风时退化为只计时。
   * 等待麦克风授权期间处于 requesting 状态，计时从真正开始录音时起算。
   */
  async function startTake({ record }) {
    const drill = state.activeDrill;
    const slot = takeSlot(drill?.phase);
    if (!drill || !slot) return;
    if (runtime?.status === "requesting" && !record) {
      // 授权弹窗迟迟未处理时，允许直接改为只计时
      runtime = null;
    }
    if (runtime) return;
    const current = { slot, drillId: drill.drillId, status: "requesting", startedAt: null, recorder: null, stream: null, chunks: [], interruptShown: false, overtimeShown: false };
    runtime = current;
    if (record) {
      ctx.render();
      const opened = await openRecorder(current);
      if (runtime !== current) return;
      if (opened) Object.assign(current, opened);
    }
    current.status = "running";
    current.startedAt = Date.now();
    await persist({ ...state.activeDrill, phaseStartedAt: current.startedAt });
    ctx.render();
  }

  async function finishTake() {
    const current = runtime;
    if (!current || current.status !== "running" || current.finishing) return;
    current.finishing = true;
    const durationSeconds = Math.round((Date.now() - current.startedAt) / 1000);
    let recordingId = null;
    if (current.recorder) {
      const blob = await new Promise((resolve) => {
        current.recorder.addEventListener("stop", () => resolve(new Blob(current.chunks, { type: current.recorder.mimeType || "audio/webm" })), { once: true });
        current.recorder.stop();
      });
      stopStream(current.stream);
      if (blob.size > 0) {
        recordingId = `${current.drillId}-${current.slot}-${Date.now()}`;
        try {
          await ctx.saveRecording(recordingId, blob);
        } catch {
          recordingId = null;
          ctx.showToast("录音保存失败，本次按只计时处理。", "danger");
        }
      }
    }
    runtime = null;
    const drill = state.activeDrill;
    if (!drill || drill.drillId !== current.drillId) return;
    const take = { recordingId, durationSeconds, noRecording: !recordingId };
    await goToPhase({ ...drill, takes: { ...drill.takes, [current.slot]: take } });
  }

  function cancelTake() {
    if (!runtime) return;
    try {
      if (runtime.recorder?.state === "recording") runtime.recorder.stop();
    } catch {
      // 录音器无法正常停止时，下方仍会释放麦克风
    }
    stopStream(runtime.stream);
    runtime = null;
  }

  async function abandon() {
    cancelTake();
    const drill = state.activeDrill;
    if (!drill) return;
    const archived = { ...drill, status: "abandoned", completedAt: null };
    archiveIntoHistory(archived);
    await persist(archived);
    await persist(null);
    confirmAbandon = false;
    ctx.navigate("home");
  }

  async function close() {
    await persist(null);
    ctx.navigate("home");
  }

  function updateDrill(patch, { render = false } = {}) {
    const drill = state.activeDrill;
    if (!drill) return;
    const next = typeof patch === "function" ? patch(drill) : { ...drill, ...patch };
    void persist(next);
    if (render) ctx.render();
  }

  /** 定时刷新计时器、打断提示与自动推进。 */
  function tick() {
    const drill = state.activeDrill;
    const card = activeCard();
    if (!drill || !card || state.view !== "drill") return;
    const clock = ctx.root.querySelector("[data-drill-clock]");
    const progress = ctx.root.querySelector("[data-drill-progress]");
    const now = Date.now();
    if (drill.phase === "take1" || drill.phase === "take2") {
      if (runtime?.status !== "running") return;
      const elapsed = (now - runtime.startedAt) / 1000;
      if (clock) clock.textContent = `${formatClock(elapsed)} / ${formatClock(card.speakSeconds)}`;
      if (progress) progress.value = Math.min(elapsed, card.speakSeconds);
      if (drill.phase === "take1" && !runtime.interruptShown && elapsed >= drill.interruptAt) {
        runtime.interruptShown = true;
        const banner = ctx.root.querySelector("[data-drill-interrupt]");
        if (banner) banner.hidden = false;
        ctx.playTone();
      }
      if (!runtime.overtimeShown && elapsed >= card.speakSeconds) {
        runtime.overtimeShown = true;
        const overtime = ctx.root.querySelector("[data-drill-overtime]");
        if (overtime) overtime.hidden = false;
        ctx.playTone();
      }
      if (elapsed >= card.speakSeconds + OVERTIME_GRACE_SECONDS) void finishTake();
      return;
    }
    if (!drill.phaseStartedAt) return;
    const remaining = phaseSeconds(drill, card) - (now - drill.phaseStartedAt) / 1000;
    if (clock) clock.textContent = formatClock(remaining);
    if (progress) progress.value = Math.max(0, phaseSeconds(drill, card) - remaining);
    if ((drill.phase === "prep1" || drill.phase === "prep2") && remaining <= 0) void advance();
  }

  function syncTicker() {
    const shouldRun = state.view === "drill" && TIMED_PHASES.has(state.activeDrill?.phase);
    if (shouldRun && !ticker) ticker = setInterval(tick, TICK_MS);
    if (!shouldRun && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  async function hydrateAudio(version) {
    const slots = [...ctx.root.querySelectorAll("[data-drill-audio]")];
    await Promise.all(slots.map(async (slot) => {
      const recording = await ctx.loadRecording(slot.dataset.drillAudio);
      if (version !== state.renderVersion || !slot.isConnected) return;
      if (!recording?.blob) {
        slot.innerHTML = "<span>录音未找到。</span>";
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
    if (state.view === "drill") void hydrateAudio(state.renderVersion);
  }

  /** 处理工作台内的点击动作；返回 true 表示已处理。 */
  async function handleAction(action, control) {
    const drill = state.activeDrill;
    const card = activeCard();
    if (action === "drill-start-prep") {
      await goToPhase(drill);
    } else if (action === "drill-advance") {
      await advance();
    } else if (action === "drill-take-start") {
      await startTake({ record: control.dataset.record === "1" });
    } else if (action === "drill-take-finish") {
      await finishTake();
    } else if (action === "drill-check") {
      const slot = control.dataset.slot;
      const value = control.dataset.value === "yes";
      updateDrill((current) => {
        const checks = { ...current.checks, [slot]: { ...current.checks[slot], [control.dataset.check]: value } };
        const next = { ...current, checks };
        // 首轮检查全部判断完后自动建议唯一重讲目标，用户仍可改选
        if (slot === "first" && card.checks.every((id) => typeof checks.first[id] === "boolean") && !current.focusCheckId) {
          next.focusCheckId = suggestFocus(next, card);
        }
        return next;
      }, { render: true });
    } else if (action === "drill-focus") {
      updateDrill({ focusCheckId: control.dataset.check }, { render: true });
    } else if (action === "drill-abandon") {
      confirmAbandon = true;
      ctx.render();
    } else if (action === "drill-abandon-cancel") {
      confirmAbandon = false;
      ctx.render();
    } else if (action === "drill-abandon-confirm") {
      await abandon();
    } else if (action === "drill-close") {
      await close();
    } else if (action === "drill-next") {
      await close();
      ctx.onNextDrill?.();
    } else {
      return false;
    }
    return true;
  }

  /** 处理工作台内的文本输入；返回 true 表示已处理。 */
  function handleInput(target) {
    if (target.matches("[data-drill-note]")) {
      const key = target.dataset.drillNote;
      clearTimeout(noteTimer);
      const value = target.value;
      state.activeDrill = { ...state.activeDrill, notes: { ...state.activeDrill.notes, [key]: value } };
      noteTimer = setTimeout(() => void persist(state.activeDrill), 300);
      return true;
    }
    if (target.matches("[data-drill-lesson]")) {
      clearTimeout(noteTimer);
      state.activeDrill = { ...state.activeDrill, lesson: target.value };
      noteTimer = setTimeout(() => void persist(state.activeDrill), 300);
      return true;
    }
    return false;
  }

  function renderStepper(drill) {
    const groups = STEP_GROUPS.filter((group) => group.phases.some((phase) => phaseSequence(drill.mode).includes(phase)));
    const currentIndex = groups.findIndex((group) => group.phases.includes(drill.phase));
    return `<ol class="drill-steps" aria-label="回合进度">${groups.map((group, index) => `<li class="${index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : ""}"><span>${index + 1}</span>${group.label}</li>`).join("")}</ol>`;
  }

  function renderSituation(card, compact) {
    const industry = INDUSTRY_MAP.get(card.industryId);
    return `<section class="drill-situation${compact ? " is-compact" : ""}" aria-label="情境">
      <div class="drill-tags"><span class="family-tag family-${card.family}">${escapeHtml(card.familyLabel)} · ${escapeHtml(card.scenarioLabel)}</span><span class="industry-tag">${escapeHtml(industry?.label ?? "")}</span><span>限时 ${card.speakSeconds} 秒</span></div>
      <h2>${escapeHtml(card.title)}</h2>
      ${compact ? "" : `<p>${escapeHtml(card.situation)}</p>`}
      <dl><div><dt>对象</dt><dd>${escapeHtml(card.counterpart)}</dd></div><div><dt>目标</dt><dd>${escapeHtml(card.goal)}</dd></div></dl>
    </section>`;
  }

  function renderClock(total, label) {
    return `<div class="drill-clock"><span>${label}</span><strong data-drill-clock>${formatClock(total)}</strong><progress data-drill-progress value="0" max="${total}"></progress></div>`;
  }

  function renderBrief(drill, card) {
    return `${renderSituation(card, false)}
      <section class="drill-panel">
        <h3>${icon("target")}本回合规则</h3>
        <ul class="drill-rules">
          <li>不写稿。准备 ${card.prepSeconds} 秒只想两件事：<strong>第一句话说什么</strong>、<strong>用哪个具体例子</strong>。</li>
          <li>准备时间一到会自动开始录音，讲到一半对方可能会打断你。被打断时要接住，再拉回主线。</li>
          <li>先讲一遍再补课：讲不出来的地方，正是这一回合最值得学的。</li>
        </ul>
        <p class="drill-reason">${icon("shuffle")}${escapeHtml(drill.selectionReason)}${drill.revisitOf ? " · 这次会遇到和上次不同的打断" : ""}</p>
      </section>
      <div class="drill-actions"><button class="button button-primary button-large" type="button" data-action="drill-start-prep">${icon("play")}开始 ${card.prepSeconds} 秒准备</button></div>`;
  }

  function renderPrep(drill, card) {
    const isRetake = drill.phase === "prep2";
    const focus = CHECKS[drill.focusCheckId];
    return `${renderSituation(card, true)}
      <section class="drill-stage-card">
        ${renderClock(phaseSeconds(drill, card), isRetake ? "重讲准备" : "准备时间")}
        ${isRetake
          ? `<div class="drill-pressure is-followup"><span>${icon("alert")}重讲时，开场先回应这句追问</span><strong>${escapeHtml(pressureText(drill.followupId))}</strong></div>
             ${focus ? `<div class="drill-focus-reminder"><span>唯一要改的一项：${escapeHtml(focus.label)}</span><p>${escapeHtml(focus.tip)}</p></div>` : ""}`
          : `<p class="drill-prep-tip">只想第一句话和一个具体例子。不要写稿。</p>`}
      </section>
      <div class="drill-actions"><button class="button button-primary button-large" type="button" data-action="drill-advance">${icon("play")}准备好了，现在开讲</button></div>`;
  }

  function renderTake(drill, card) {
    const isFirst = drill.phase === "take1";
    const focus = CHECKS[drill.focusCheckId];
    const recording = Boolean(runtime?.recorder);
    const running = runtime?.status === "running";
    const requesting = runtime?.status === "requesting";
    const liveLabel = running
      ? `<span class="rec-dot" aria-hidden="true"></span><span>${recording ? "正在录音" : "只计时（未录音）"}</span>`
      : requesting ? "<span>正在请求麦克风权限…</span>" : "<span>还没有开始</span>";
    // 重渲染时保留已经出现过的打断与超时提示
    const hiddenUnless = (shown) => (shown ? "" : " hidden");
    let actions;
    if (running) {
      actions = `<button class="button button-primary button-large" type="button" data-action="drill-take-finish">${icon("check")}讲完了</button>`;
    } else if (requesting) {
      actions = `<button class="button button-ghost" type="button" data-action="drill-take-start" data-record="0">改为只计时，不录音</button>`;
    } else {
      actions = `<button class="button button-primary button-large" type="button" data-action="drill-take-start" data-record="1">${icon("mic")}开始讲（录音）</button><button class="button button-ghost" type="button" data-action="drill-take-start" data-record="0">只计时，不录音</button>`;
    }
    return `${renderSituation(card, true)}
      <section class="drill-stage-card${running ? " is-live" : ""}">
        <div class="drill-live-head">${liveLabel}</div>
        ${renderClock(card.speakSeconds, isFirst ? "首次表达" : "重讲")}
        ${isFirst ? `<div class="drill-pressure" data-drill-interrupt${hiddenUnless(runtime?.interruptShown)} role="alert"><span>${icon("alert")}对方打断了你</span><strong>${escapeHtml(pressureText(drill.interruptId))}</strong><small>先正面接住这句话，再回到你的主线。</small></div>` : `<div class="drill-pressure is-followup"><span>开场先回应</span><strong>${escapeHtml(pressureText(drill.followupId))}</strong></div>${focus ? `<p class="drill-focus-inline">${icon("target")}只改一项：${escapeHtml(focus.label)}</p>` : ""}`}
        <p class="drill-overtime" data-drill-overtime${hiddenUnless(runtime?.overtimeShown)} role="status">时间到了，用一句话收尾。${OVERTIME_GRACE_SECONDS} 秒后自动结束。</p>
      </section>
      <div class="drill-actions">${actions}</div>`;
  }

  function renderCheckList(drill, card, slot) {
    return `<div class="check-list">${card.checks.map((id) => {
      const definition = CHECKS[id];
      const value = drill.checks[slot]?.[id];
      const firstValue = slot === "second" ? drill.checks.first?.[id] : undefined;
      return `<div class="check-row${value === true ? " is-yes" : value === false ? " is-no" : ""}">
        <div><strong>${escapeHtml(definition.label)}${id === drill.focusCheckId && slot === "second" ? `<em>重讲目标</em>` : ""}</strong><p>${escapeHtml(definition.question)}</p>${slot === "second" && typeof firstValue === "boolean" ? `<small>首轮：${firstValue ? "做到" : "没做到"}</small>` : ""}</div>
        <div class="check-toggle" role="group" aria-label="${escapeHtml(definition.label)}"><button type="button" class="${value === true ? "is-active" : ""}" aria-pressed="${value === true}" data-action="drill-check" data-slot="${slot}" data-check="${id}" data-value="yes">做到</button><button type="button" class="${value === false ? "is-active" : ""}" aria-pressed="${value === false}" data-action="drill-check" data-slot="${slot}" data-check="${id}" data-value="no">没做到</button></div>
      </div>`;
    }).join("")}</div>`;
  }

  function renderAudio(take, label) {
    if (take?.recordingId) return `<div class="drill-audio"><span>${label}</span><div data-drill-audio="${escapeHtml(take.recordingId)}">正在载入录音…</div></div>`;
    return `<div class="drill-audio is-empty"><span>${label}</span><p>这次没有录音，只能凭记忆判断，请从严。</p></div>`;
  }

  function renderCheck(drill, card) {
    const isFirst = drill.phase === "check1";
    const slot = isFirst ? "first" : "second";
    const judged = card.checks.every((id) => typeof drill.checks[slot][id] === "boolean");
    const failed = card.checks.filter((id) => drill.checks.first[id] === false);
    const focusOptions = failed.length ? failed : card.checks;
    return `${renderSituation(card, true)}
      <section class="drill-panel">
        <h3>${icon("history")}${isFirst ? "回听首次表达，逐项判断" : "回听重讲，再判断一次"}</h3>
        <p class="drill-hint">先完整回听一遍再判断。<strong>拿不准就算没做到</strong>：多数人会高估自己的表达，从严判断才有用。</p>
        ${isFirst ? `<p class="drill-hint">讲到一半时的打断是：${escapeHtml(pressureText(drill.interruptId))}</p>` : ""}
        <div class="drill-audio-row">${isFirst ? renderAudio(drill.takes.first, "首次表达") : `${renderAudio(drill.takes.first, "首次表达")}${renderAudio(drill.takes.second, "重讲")}`}</div>
        ${renderCheckList(drill, card, slot)}
      </section>
      ${isFirst && judged ? `<section class="drill-panel"><h3>${icon("target")}重讲时只改一项</h3><p class="drill-hint">一次只改一个行为，改得最快。系统已按“没做到”的项建议，你可以改选。</p><div class="focus-options">${focusOptions.map((id) => `<button type="button" class="focus-option${drill.focusCheckId === id ? " is-active" : ""}" aria-pressed="${drill.focusCheckId === id}" data-action="drill-focus" data-check="${id}"><strong>${escapeHtml(CHECKS[id].label)}</strong><span>${escapeHtml(CHECKS[id].tip)}</span></button>`).join("")}</div></section>` : ""}
      ${!isFirst ? `<section class="drill-panel"><label class="field"><span>这一回合带走的一句话（下次开口前读一遍）</span><textarea rows="2" data-drill-lesson placeholder="例如：被质疑时先说“你说得对的部分是……”">${escapeHtml(drill.lesson)}</textarea></label></section>` : ""}
      <div class="drill-actions"><button class="button button-primary button-large" type="button" data-action="drill-advance">${isFirst ? (drill.mode === "quick" ? "进入追问重讲" : "进入限时补课") : "查看本回合结果"}${icon("arrowRight")}</button></div>`;
  }

  function renderLearn(drill, card) {
    const focus = CHECKS[drill.focusCheckId];
    return `${renderSituation(card, true)}
      <section class="drill-stage-card">
        ${renderClock(LEARN_SECONDS, "限时补课")}
        <p class="drill-prep-tip">只补刚才讲不出来的东西。每个问题只写关键词，不写稿；超时不会锁定，但请尽量在 5 分钟内结束。</p>
      </section>
      <section class="drill-panel">
        <h3>${icon("search")}认知补课</h3>
        <div class="learn-list">${card.cognitionPrompts.map((prompt, index) => `<label class="field"><span>${escapeHtml(prompt)}</span><input type="text" maxlength="200" data-drill-note="${index}" value="${escapeHtml(drill.notes[index] ?? "")}" placeholder="只写关键词"></label>`).join("")}</div>
        <div class="search-hints"><span>建议检索（优先看年报、招股书、行业协会等一手资料）：</span>${card.searchHints.map((hint) => `<code>${escapeHtml(hint)}</code>`).join("")}</div>
        ${focus ? `<div class="drill-focus-reminder"><span>重讲唯一目标：${escapeHtml(focus.label)}</span><p>${escapeHtml(focus.tip)}</p></div>` : ""}
      </section>
      <div class="drill-actions"><button class="button button-primary button-large" type="button" data-action="drill-advance">补课结束，接受追问${icon("arrowRight")}</button></div>`;
  }

  function renderDone(drill, card) {
    const outcome = drillOutcome(drill, card);
    const focus = CHECKS[drill.focusCheckId];
    return `${renderSituation(card, true)}
      <section class="drill-result">
        <div class="drill-score"><span>首次</span><strong>${outcome.firstPassed}<small>/${outcome.total}</small></strong></div>
        <div class="drill-score-arrow" aria-hidden="true">${icon("arrowRight")}</div>
        <div class="drill-score is-second"><span>重讲</span><strong>${outcome.secondPassed}<small>/${outcome.total}</small></strong></div>
        <p>${outcome.focusFixed ? `重讲目标「${escapeHtml(focus?.label ?? "")}」已经改过来了。` : focus && drill.checks.second[drill.focusCheckId] === false ? `「${escapeHtml(focus.label)}」还没改过来，系统会安排更多相关场景。` : outcome.improved ? "重讲比首次多做到了几项。" : "这一回合两次表现持平。判断从严是好事，问题看清了才能改。"}</p>
      </section>
      <section class="drill-panel"><h3>逐项对比</h3><div class="compare-table"><div class="compare-head"><span>检查项</span><em>首次</em><em>重讲</em></div>${card.checks.map((id) => `<div><span>${escapeHtml(CHECKS[id].label)}</span><em class="${drill.checks.first[id] ? "is-yes" : "is-no"}">${drill.checks.first[id] ? "做到" : "没做到"}</em><em class="${drill.checks.second[id] ? "is-yes" : "is-no"}">${drill.checks.second[id] ? "做到" : "没做到"}</em></div>`).join("")}</div>
        ${drill.lesson ? `<p class="drill-lesson">带走：${escapeHtml(drill.lesson)}</p>` : ""}
        <p class="drill-hint">${card.checks.some((id) => drill.checks.first[id] === false) && !drill.revisitOf ? "3 天后这张卡会换一个打断再出现，检验这次的改进有没有真正留下来。" : "这一回合已经归档到训练历史。"}</p>
      </section>
      <div class="drill-actions"><button class="button button-primary button-large" type="button" data-action="drill-next">${icon("shuffle")}再来一回合</button><button class="button button-ghost" type="button" data-action="drill-close">回到首页</button></div>`;
  }

  function renderWorkspace() {
    const drill = state.activeDrill;
    const card = activeCard();
    if (!drill || !card) {
      return `<section class="empty-state"><div>${icon("alert")}</div><h1>没有进行中的实战回合</h1><p>回到首页抽一个场景开始。</p><button class="button button-primary" type="button" data-action="navigate" data-view="home">返回首页</button></section>`;
    }
    let body;
    if (drill.phase === "brief") body = renderBrief(drill, card);
    else if (drill.phase === "prep1" || drill.phase === "prep2") body = renderPrep(drill, card);
    else if (drill.phase === "take1" || drill.phase === "take2") body = renderTake(drill, card);
    else if (drill.phase === "check1" || drill.phase === "check2") body = renderCheck(drill, card);
    else if (drill.phase === "learn") body = renderLearn(drill, card);
    else body = renderDone(drill, card);
    const abandonControls = drill.phase === "done"
      ? ""
      : confirmAbandon
        ? `<div class="abandon-confirm"><span>放弃后本回合记为未完成。</span><button class="button button-ghost" type="button" data-action="drill-abandon-cancel">继续训练</button><button class="button button-danger" type="button" data-action="drill-abandon-confirm">确认放弃</button></div>`
        : `<button class="text-button" type="button" data-action="drill-abandon">${icon("x")}放弃本回合</button>`;
    return `<div class="drill-workspace">
      <header class="drill-header"><div><p class="eyebrow">实战回合 · ${drill.mode === "quick" ? "闪电回合" : "完整回合"}</p>${renderStepper(drill)}</div>${abandonControls}</header>
      ${body}
    </div>`;
  }

  return { afterRender, handleAction, handleInput, isBusy, renderWorkspace, startDrill, startTake };
}

/** 训练历史中的实战回合列表。 */
export function renderDrillHistory(drills, { escapeHtml, formatDate }) {
  const items = [...drills].sort((left, right) => new Date(right.completedAt ?? right.startedAt) - new Date(left.completedAt ?? left.startedAt));
  if (!items.length) return "";
  return `<section class="dashboard-section drill-history"><div class="section-heading"><div><p class="eyebrow">实战回合</p><h2>${items.length} 个回合</h2></div></div><div class="drill-history-list">${items.map((drill) => {
    const card = ARENA_CARD_MAP.get(drill.cardId);
    if (!card) return "";
    const outcome = drillOutcome(drill, card);
    const focus = CHECKS[drill.focusCheckId];
    const date = drill.completedAt ?? drill.startedAt;
    return `<details class="drill-history-item"><summary>
      <span class="history-date"><strong>${formatDate(date, { day: "2-digit" })}</strong><span>${formatDate(date, { month: "short" })}</span></span>
      <span class="drill-history-main"><span class="drill-tags"><span class="family-tag family-${card.family}">${escapeHtml(card.scenarioLabel)}</span><span class="industry-tag">${escapeHtml(card.industryLabel)}</span>${drill.revisitOf ? `<span class="status-badge status-ready">复练</span>` : ""}${drill.status === "abandoned" ? `<span class="status-badge status-abandoned">未完成</span>` : ""}</span><strong>${escapeHtml(card.title)}</strong></span>
      <span class="drill-history-score">${drill.status === "completed" ? `${outcome.firstPassed}/${outcome.total} → ${outcome.secondPassed}/${outcome.total}` : "—"}</span>
    </summary><div class="drill-history-body">
      ${focus ? `<p>重讲目标：${escapeHtml(focus.label)}${outcome.focusFixed ? "（已改善）" : ""}</p>` : ""}
      <p>打断：${escapeHtml(pressureText(drill.interruptId))}</p><p>追问：${escapeHtml(pressureText(drill.followupId))}</p>
      ${drill.lesson ? `<p>带走：${escapeHtml(drill.lesson)}</p>` : ""}
      ${Object.values(drill.notes ?? {}).some(Boolean) ? `<p>补课关键词：${escapeHtml(Object.values(drill.notes).filter(Boolean).join(" / "))}</p>` : ""}
    </div></details>`;
  }).join("")}</div></section>`;
}

/** 能力档案中的实战部分：检查项做到率、行业覆盖、场景家族覆盖。 */
export function renderArenaAbility(drills, { escapeHtml, icon }) {
  const stats = arenaStats(drills);
  const rows = Object.entries(stats.rates).sort((left, right) => left[1].firstRate - right[1].firstRate);
  const maxFamily = Math.max(1, ...Object.values(stats.familyCounts));
  return `
    <section class="progress-strip" aria-label="实战概览"><div><span>完成回合</span><strong>${stats.completed}</strong></div><div><span>应变（接住打断）</span><strong>${stats.pressureRate == null ? "—" : `${stats.pressureRate}%`}</strong></div><div><span>重讲改善率</span><strong>${stats.improvementRate}%</strong></div><div><span>行业覆盖</span><strong>${stats.industriesCovered}<small>/ ${stats.industriesTotal}</small></strong></div></section>
    <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">首轮 = 冷启动的真实水平</p><h2>可观察行为做到率</h2></div><span>最近 20 回合</span></div>
      ${rows.length ? `<div class="check-rate-table">${rows.map(([id, entry]) => `<div><div><strong>${escapeHtml(CHECKS[id]?.label ?? id)}</strong><small>${entry.attempts} 次 · ${escapeHtml(CHECKS[id]?.question ?? "")}</small></div><div class="rate-bars"><span><i data-rate-width="${entry.firstRate}"></i></span><em>首轮 ${entry.firstRate}%</em><span class="is-second"><i data-rate-width="${entry.secondRate}"></i></span><em>重讲 ${entry.secondRate}%</em></div></div>`).join("")}</div>` : `<div class="empty-inline"><p>完成第一个实战回合后，这里会显示每个行为的做到率。</p></div>`}
    </section>
    <div class="ability-grid">
      <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">各行各业的认知面</p><h2>行业覆盖</h2></div></div><div class="industry-grid">${INDUSTRIES.map((item) => `<span class="${stats.industryCounts[item.id] ? "is-covered" : ""}">${escapeHtml(item.label)}<small>${stats.industryCounts[item.id] ?? 0}</small></span>`).join("")}</div></section>
      <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">真实场景分布</p><h2>场景家族</h2></div></div><div class="family-coverage">${Object.entries(FAMILIES).map(([id, family]) => `<div><span>${icon("target")}${escapeHtml(family.label)}</span><progress value="${stats.familyCounts[id] ?? 0}" max="${maxFamily}"></progress><strong>${stats.familyCounts[id] ?? 0}</strong></div>`).join("")}</div></section>
    </div>`;
}

/** 将 data-rate-width 百分比写入 CSSOM（CSP 禁止内联 style 属性）。 */
export function applyRateBars(root) {
  root.querySelectorAll("[data-rate-width]").forEach((bar) => {
    bar.style.width = `${Number(bar.dataset.rateWidth) || 0}%`;
  });
}
