/**
 * AI 助手的界面与控制器：画像调研、画像页（记忆）、设置页 AI 区、后台补题与迁移题个性化。
 *
 * 后台补题是由代码编排的工作流：规划器决定练什么，模型只写情境与答案，
 * 服务端与本地各校验一次，合格的题卡才注册进题库；任何一步失败都不影响训练流程。
 */
import {
  CONTEXT_MAP, PARADIGM_MAP, PRACTICE_CARD_MAP, allPracticeCards, generatedExampleCards, isGeneratedCard, registerGeneratedCards, unregisterGeneratedCards,
} from "../curriculum/index.js";
import { LINES } from "../curriculum/contexts.js";
import { behaviorRates, currentWeakness, weaknessLabel } from "../arena/engine.js";
import { learnedParadigms, pickLessonExample, recentlyLearned, recommendedLesson } from "../arena/lesson-engine.js";
import {
  fetchAiConfig, fetchAiStatus, requestFollowups, requestGeneratedCard, requestProfileSynthesis, requestReflection, saveAiConfig,
} from "./client.js";
import { freshGeneratedCards, planExampleGeneration, planPracticeGeneration, planTransferGeneration, pruneGeneratedCards } from "./planner.js";
import {
  FOCUS_OPTIONS, MAX_FACTS, MAX_FOCUS, MAX_PENDING_FACTS, MAX_SITUATIONS, SELF_RATING_DIMENSIONS,
  emptyProfile, focusLabel, normalizeProfile, profileDigest, sameObservation,
} from "./profile.js";
import { REFLECTION_INTERVAL, drillsCompletedSince, recentTrainingLog, trainingDigest } from "./training.js";

// 连续失败两次就暂停后台补题，直到用户点“重试”或修改 AI 设置
const MAX_CONSECUTIVE_FAILURES = 2;
// 一轮后台工作最多生成几张，避免规划异常时无限请求
const MAX_CARDS_PER_RUN = 6;
const WORK_DELAY_MS = 800;
const MEASURED_MIN_ATTEMPTS = 3;
const TRANSFER_PHASES = new Set(["intro", "model"]);
// 隐私说明版本：2 起发送内容包括训练摘要，版本 1 时同意过的用户需要重新确认
const AI_CONSENT_VERSION = 2;
const FACT_SOURCE_LABELS = Object.freeze({ survey: "你添加的", ai: "AI 整理", practice: "练习中发现" });

/**
 * 创建 AI 助手控制器。
 *
 * @param {object} ctx 由 app.js 注入的状态与工具函数
 */
export function createAgentController(ctx) {
  const { state, escapeHtml, icon } = ctx;
  let workTimer = null;
  let working = false;
  let failures = 0;
  let confirmDeleteProfile = false;
  // 上次提炼失败时的回合数
  let reflectionFailedAt = -1;
  // 上次示范生成失败的课；推荐的下一课变化后才再试，不让它挡住其他任务
  let exampleFailedFor = null;
  // 每次课程只尝试一次个性化迁移题
  const transferAttempts = new Set();

  // ---------- 状态 ----------

  function configuredProviders() {
    return (state.ai.status?.providers ?? []).filter((provider) => provider.configured);
  }

  function available() {
    return configuredProviders().length > 0;
  }

  /** 本次使用的服务：设置里选的且已配置，否则用服务端默认。 */
  function providerId() {
    const configured = configuredProviders();
    if (configured.some((provider) => provider.id === state.settings.aiProvider)) return state.settings.aiProvider;
    return state.ai.status?.defaultProvider ?? configured[0]?.id ?? "";
  }

  function providerLabel() {
    const provider = configuredProviders().find((item) => item.id === providerId());
    return provider ? `${provider.label}（${provider.model}）` : "模型服务";
  }

  /** 同意的是当前版本的隐私说明。 */
  function consented() {
    return state.settings.aiEnabled && state.settings.aiConsentVersion >= AI_CONSENT_VERSION;
  }

  /** 同意过旧版说明、但还没确认新版：AI 暂停，提示重新确认。 */
  function consentOutdated() {
    return available() && state.settings.aiEnabled && state.settings.aiConsentVersion < AI_CONSENT_VERSION;
  }

  function enabled() {
    return available() && consented();
  }

  function currentDigest() {
    const weakness = currentWeakness(state.drills);
    return profileDigest(state.profile, { weakness: weakness ? weaknessLabel(weakness) : "" });
  }

  /** 训练摘要每次现算；出题时带上本题结构，得到各步覆盖率。 */
  function currentTraining(paradigmId = null) {
    return trainingDigest({ drills: state.drills, lessonRuns: state.lessonRuns, paradigmId });
  }

  /** 进行中的回合与课程也算“用过”，避免把正在练的题当成新题。 */
  function usageRecords() {
    return {
      drills: state.activeDrill ? [...state.drills, state.activeDrill] : state.drills,
      lessonRuns: state.activeLesson ? [...state.lessonRuns, state.activeLesson] : state.lessonRuns,
    };
  }

  function freshCount() {
    return freshGeneratedCards({ cards: allPracticeCards(), ...usageRecords() }).length;
  }

  /** 后台状态变化时只刷新没有输入框的页面，避免打断正在输入的内容（设置页正在填 AI 配置时也不刷新）。 */
  function refreshIndicators() {
    if (state.modal || !["home", "settings"].includes(state.view)) return;
    if (state.view === "settings" && state.ai.configForm) return;
    ctx.render();
  }

  async function init() {
    state.ai.status = await fetchAiStatus();
    refreshIndicators();
    schedule();
  }

  // ---------- 后台补题 ----------

  /** 安排一次后台工作；AI 未开启、正在工作或连续失败时什么也不做。可以在每次渲染后调用。 */
  function schedule() {
    if (!enabled() || working || failures >= MAX_CONSECUTIVE_FAILURES) return;
    clearTimeout(workTimer);
    workTimer = setTimeout(() => void work(), WORK_DELAY_MS);
  }

  /** 是否该提炼练习观察：有画像、待确认的没满，且上次提炼后又完成了足够多的回合。 */
  function reflectionDue() {
    const profile = state.profile;
    if (!profile || profile.pendingFacts.length >= MAX_PENDING_FACTS) return false;
    // 提炼失败后，等再完成一个回合才重试，不让它挡住补题
    if (state.drills.length === reflectionFailedAt) return false;
    return drillsCompletedSince(state.drills, profile.reflectedAt) >= REFLECTION_INTERVAL;
  }

  /**
   * 需要预先生成示范的课：推荐的下一课还没有没用过的 AI 示范时返回它。
   * 这一课正在学时不生成（本次已经定下示范，新生成的要等下次才用得上）。
   */
  function exampleTarget() {
    const paradigm = recommendedLesson(state.lessonRuns);
    const run = state.activeLesson;
    if (!paradigm || paradigm.id === exampleFailedFor) return null;
    if (run?.status === "in_progress" && run.paradigmId === paradigm.id) return null;
    const runs = run ? [...state.lessonRuns, run] : state.lessonRuns;
    return pickLessonExample(paradigm, { runs }) ? null : paradigm;
  }

  /** 下一项任务：先为进行中的课程准备迁移题，再预生成下一课的示范，然后提炼练习观察，最后补练习题的缓冲。 */
  function nextJob() {
    const run = state.activeLesson;
    // 迁移题已经是生成题（之前换过）时不再生成，否则每次刷新页面都会重新生成并替换
    if (run?.status === "in_progress" && TRANSFER_PHASES.has(run.phase) && !transferAttempts.has(run.runId)
      && !isGeneratedCard(PRACTICE_CARD_MAP.get(run.transferCardId))) {
      transferAttempts.add(run.runId);
      const paradigm = PARADIGM_MAP.get(run.paradigmId);
      const exampleLine = run.exampleCardId ? PRACTICE_CARD_MAP.get(run.exampleCardId)?.line : undefined;
      const spec = paradigm ? planTransferGeneration({ paradigm, profile: state.profile, cards: allPracticeCards(), drills: state.drills, exampleLine }) : null;
      if (spec) return { kind: "transfer", runId: run.runId, spec };
    }
    const lesson = exampleTarget();
    if (lesson) {
      const spec = planExampleGeneration({
        paradigm: lesson,
        profile: state.profile,
        cards: [...allPracticeCards(), ...generatedExampleCards()],
        drills: state.drills,
        careerStage: state.settings.careerStage,
      });
      if (spec) return { kind: "example", paradigmId: lesson.id, spec };
    }
    if (reflectionDue()) return { kind: "reflect" };
    const spec = planPracticeGeneration({
      profile: state.profile,
      learned: learnedParadigms(state.lessonRuns),
      recent: recentlyLearned(state.lessonRuns),
      cards: allPracticeCards(),
      ...usageRecords(),
      careerStage: state.settings.careerStage,
      weakness: currentWeakness(state.drills),
    });
    return spec ? { kind: "practice", spec } : null;
  }

  /** 注册并保存一张生成题卡；超过上限时清理最旧且没被引用的题卡。 */
  async function addGeneratedCard(raw) {
    const [registered] = registerGeneratedCards([raw]);
    if (!registered) throw new Error("生成的题目没有通过本地校验，已丢弃。");
    const { drills, lessonRuns } = usageRecords();
    const { keep, removedIds } = pruneGeneratedCards([...state.generatedCards, raw], { drills, lessonRuns });
    unregisterGeneratedCards(removedIds);
    state.generatedCards = keep;
    await ctx.saveGeneratedCards(keep);
    return registered;
  }

  /**
   * 提炼练习观察：模型只提议，结果放进“待确认”，用户在画像页采纳后才进入记忆。
   * 无论有没有新观察，都记下这次提炼的时间，之后再完成若干回合才会再次提炼。
   */
  async function reflect() {
    const { observations } = await requestReflection({
      provider: providerId(),
      profile: currentDigest(),
      training: currentTraining(),
      log: recentTrainingLog(state.drills),
      // 待确认的也算已知，避免同一条观察反复出现
      facts: [...state.profile.facts, ...state.profile.pendingFacts].map((fact) => fact.text),
      // 忽略或删除过的观察告诉模型不要再提
      dismissed: state.profile.dismissedFacts.map((item) => item.text),
    });
    // 请求期间用户可能采纳、忽略了观察或删除了画像：以当前画像为准合并
    const current = state.profile;
    if (!current) return;
    const now = new Date().toISOString();
    // 模型偶尔还会原样提出已知或被否定的观察，这里再挡一次
    const known = [...current.facts, ...current.pendingFacts, ...current.dismissedFacts].map((item) => item.text);
    const fresh = observations.filter((item) => !known.some((text) => sameObservation(text, item.text)));
    const pending = [...current.pendingFacts, ...fresh.map((item) => ({ text: item.text, evidence: item.evidence, createdAt: now }))].slice(-MAX_PENDING_FACTS);
    state.profile = await ctx.saveProfile(normalizeProfile({ ...current, reflectedAt: now, pendingFacts: pending, updatedAt: now }));
  }

  async function runJob(job) {
    if (job.kind === "reflect") {
      await reflect();
      return;
    }
    const { card } = await requestGeneratedCard({
      provider: providerId(),
      spec: job.spec,
      profile: currentDigest(),
      training: currentTraining(job.spec.paradigmId),
    });
    const registered = await addGeneratedCard(card);
    if (job.kind === "transfer") ctx.swapTransferCard(job.runId, registered.id);
  }

  async function work() {
    if (working || !enabled()) return;
    // 先规划再动界面：没有任务时直接返回，不触发渲染（渲染后会再次 schedule，否则会空转循环）
    let job = nextJob();
    if (!job) return;
    working = true;
    state.ai.generating = true;
    refreshIndicators();
    try {
      for (let count = 0; job && count < MAX_CARDS_PER_RUN; count += 1) {
        try {
          await runJob(job);
          failures = 0;
          state.ai.lastError = "";
        } catch (error) {
          failures += 1;
          state.ai.lastError = error?.message || "生成失败。";
          if (job.kind === "reflect") reflectionFailedAt = state.drills.length;
          if (job.kind === "example") exampleFailedFor = job.paradigmId;
        }
        refreshIndicators();
        job = enabled() && failures < MAX_CONSECUTIVE_FAILURES ? nextJob() : null;
      }
    } finally {
      working = false;
      state.ai.generating = false;
      refreshIndicators();
    }
  }

  // ---------- 画像调研 ----------

  function draftFromProfile(profile) {
    const base = profile ?? emptyProfile();
    return {
      identity: base.identity,
      focus: [...base.focus],
      situations: Array.from({ length: MAX_SITUATIONS }, (_, index) => ({
        id: base.situations[index]?.id ?? "",
        text: base.situations[index]?.text ?? "",
        when: base.situations[index]?.when ?? "",
      })),
      selfRating: { ...base.selfRating },
      depth: base.depth,
      avoid: base.avoid,
      ifThen: base.ifThen,
      summary: base.summary,
      followups: base.followups.map((item) => ({ ...item })),
      busy: "",
    };
  }

  function filledSituations(draft) {
    return draft.situations.filter((item) => item.text.trim());
  }

  /** 发给服务端的问卷：用文字标签而不是内部 ID，模型更容易理解。 */
  function surveyPayload(draft) {
    return {
      identity: draft.identity.trim(),
      focus: draft.focus.map(focusLabel),
      situations: filledSituations(draft).map((item) => ({ text: item.text.trim(), when: item.when.trim() })),
      selfRating: SELF_RATING_DIMENSIONS.filter((dimension) => draft.selfRating[dimension.id]).map((dimension) => ({ label: dimension.label, value: draft.selfRating[dimension.id] })),
      depth: draft.depth,
      avoid: draft.avoid.trim(),
      ifThen: draft.ifThen.trim(),
    };
  }

  /**
   * 由问卷草稿（和可选的 AI 合成结果）组装画像。
   * 没有 AI 合成时保留上一版画像中 AI 写的摘要、记忆与语境映射（场合文字没变的才保留映射）。
   */
  function profileFromDraft(draft, synthesized = null) {
    const previous = state.profile;
    const now = new Date().toISOString();
    const situations = filledSituations(draft).map((item, index) => {
      const old = previous?.situations.find((entry) => entry.id === item.id && entry.text === item.text.trim());
      const mapped = synthesized ? synthesized.situationContexts.find((entry) => entry.index === index)?.contextId ?? null : old?.contextId ?? null;
      return { id: item.id || undefined, text: item.text.trim(), when: item.when.trim(), contextId: mapped };
    });
    const userFacts = (previous?.facts ?? []).filter((fact) => fact.source !== "ai");
    const aiFacts = synthesized
      ? synthesized.facts.map((text) => ({ text, source: "ai", createdAt: now }))
      : (previous?.facts ?? []).filter((fact) => fact.source === "ai");
    return normalizeProfile({
      ...emptyProfile(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      identity: draft.identity,
      focus: draft.focus,
      focusChecks: synthesized ? synthesized.focusChecks : previous?.focusChecks ?? [],
      situations,
      selfRating: draft.selfRating,
      depth: draft.depth,
      avoid: draft.avoid,
      ifThen: synthesized?.ifThen || draft.ifThen,
      summary: synthesized ? synthesized.summary : draft.summary,
      facts: [...userFacts, ...aiFacts].slice(0, MAX_FACTS),
      followups: draft.followups.map(({ question, answer }) => ({ question, answer })),
      // 重新调研不影响练习观察的节奏和待确认列表
      reflectedAt: previous?.reflectedAt ?? null,
      pendingFacts: previous?.pendingFacts ?? [],
      dismissedFacts: previous?.dismissedFacts ?? [],
    });
  }

  async function persistProfile(profile, message) {
    state.profile = await ctx.saveProfile(profile);
    state.profileDraft = null;
    confirmDeleteProfile = false;
    ctx.showToast(message, "default");
    ctx.render();
    schedule();
  }

  async function askFollowups(draft) {
    if (!enabled()) {
      ctx.showToast("请先勾选同意把画像和训练摘要发送给模型服务。", "danger");
      return;
    }
    draft.busy = "ask";
    ctx.render();
    try {
      const { questions } = await requestFollowups({ provider: providerId(), survey: surveyPayload(draft) });
      draft.followups = questions.map((item) => ({ question: item.question, why: item.why, answer: "" }));
      if (!questions.length) ctx.showToast("AI 觉得问卷已经够具体了，可以直接整理画像。", "default");
    } catch (error) {
      ctx.showToast(error.message, "danger");
    } finally {
      draft.busy = "";
      if (state.profileDraft === draft) ctx.render();
    }
  }

  async function synthesize(draft) {
    if (!enabled()) {
      ctx.showToast("请先勾选同意把画像和训练摘要发送给模型服务。", "danger");
      return;
    }
    draft.busy = "synthesize";
    ctx.render();
    try {
      const result = await requestProfileSynthesis({
        provider: providerId(),
        survey: surveyPayload(draft),
        followups: draft.followups.map(({ question, answer }) => ({ question, answer })),
      });
      // 不再让用户手选阶段：由 AI 按身份与真实场合判断，决定四条线的出题比例
      if (result.careerStage) await ctx.setCareerStage(result.careerStage);
      await persistProfile(profileFromDraft(draft, result), "画像已整理并保存，新题会按画像生成。");
    } catch (error) {
      draft.busy = "";
      ctx.showToast(error.message, "danger");
      if (state.profileDraft === draft) ctx.render();
    }
  }

  /**
   * 修改画像的部分字段（记忆、待确认观察）并保存。
   * 被点的按钮会随重渲染消失，focusAction 指定渲染后把焦点交给哪个动作的按钮（同名的第一个），键盘操作不丢位置。
   */
  async function updateProfile(changes, message, focusAction) {
    const profile = normalizeProfile({ ...state.profile, ...changes, updatedAt: new Date().toISOString() });
    state.profile = await ctx.saveProfile(profile);
    ctx.showToast(message, "default");
    if (focusAction) state.pendingFocus = { type: "control", descriptor: { action: focusAction } };
    ctx.render();
  }

  /** 记下用户否定的练习观察，之后提炼时不再提出。 */
  function withDismissed(text) {
    return [...state.profile.dismissedFacts, { text, dismissedAt: new Date().toISOString() }];
  }

  /** 处理完一条待确认观察后，焦点交给下一条；没有了就交给“添加记忆”。 */
  function nextPendingFocus() {
    return state.profile.pendingFacts.length > 1 ? "profile-pending-accept" : "profile-fact-add";
  }

  // ---------- 设置页填写模型服务 ----------

  // 表单字段：[服务, 字段]；密钥单独处理（留空表示不修改，保存后不再显示）
  const CONFIG_FIELDS = Object.freeze([
    ["anthropic", "model"],
    ["openai", "label"], ["openai", "baseUrl"], ["openai", "model"], ["openai", "jsonMode"], ["openai", "extraBody"],
  ]);

  function configValues(info) {
    const values = { anthropic: { apiKey: "" }, openai: { apiKey: "" } };
    for (const [provider, field] of CONFIG_FIELDS) values[provider][field] = info[provider][field].value;
    if (!values.openai.jsonMode) values.openai.jsonMode = "json_schema";
    return values;
  }

  async function openConfigForm() {
    const form = { loading: true, saving: false, error: "", info: null, values: null, initial: null, clearKey: { anthropic: false, openai: false } };
    state.ai.configForm = form;
    ctx.render();
    try {
      form.info = await fetchAiConfig();
      form.values = configValues(form.info);
      form.initial = structuredClone(form.values);
    } catch (error) {
      form.error = error.message;
    } finally {
      form.loading = false;
      if (state.ai.configForm === form) ctx.render();
    }
  }

  /** 只提交改过的字段：没动过的 .env 值不会被复制进网页配置。 */
  function configUpdate(form) {
    const update = { anthropic: {}, openai: {} };
    for (const [provider, field] of CONFIG_FIELDS) {
      if (form.values[provider][field] !== form.initial[provider][field]) update[provider][field] = form.values[provider][field];
    }
    for (const provider of ["anthropic", "openai"]) {
      if (form.values[provider].apiKey.trim()) update[provider].apiKey = form.values[provider].apiKey;
      if (form.clearKey[provider]) update[provider].clearKey = true;
    }
    return update;
  }

  async function saveConfigForm(form) {
    form.saving = true;
    form.error = "";
    ctx.render();
    try {
      await saveAiConfig(configUpdate(form));
      state.ai.status = await fetchAiStatus();
      state.ai.configForm = null;
      failures = 0;
      exampleFailedFor = null;
      reflectionFailedAt = -1;
      state.ai.lastError = "";
      ctx.showToast("AI 配置已保存，立即生效。", "default");
      ctx.render();
      schedule();
    } catch (error) {
      form.saving = false;
      form.error = error.message;
      if (state.ai.configForm === form) ctx.render();
    }
  }

  /** 处理 profile-* 与 ai-* 动作；返回 true 表示已处理。 */
  async function handleAction(action, control) {
    const draft = state.profileDraft;
    if (action === "profile-start") {
      state.profileDraft = draftFromProfile(state.profile);
      confirmDeleteProfile = false;
      ctx.navigate("profile");
    } else if (action === "profile-cancel") {
      state.profileDraft = null;
      ctx.render();
    } else if (action === "profile-focus" && draft) {
      const id = control.dataset.value;
      if (draft.focus.includes(id)) draft.focus = draft.focus.filter((item) => item !== id);
      else if (draft.focus.length >= MAX_FOCUS) ctx.showToast(`最多选 ${MAX_FOCUS} 个，先取消一个再选。`, "danger");
      else draft.focus = [...draft.focus, id];
      ctx.render();
    } else if (action === "profile-rate" && draft) {
      draft.selfRating = { ...draft.selfRating, [control.dataset.dim]: Number(control.dataset.value) };
      ctx.render();
    } else if (action === "profile-depth" && draft) {
      draft.depth = control.dataset.value === "light" ? "light" : "deep";
      ctx.render();
    } else if (action === "profile-ask" && draft && !draft.busy) {
      await askFollowups(draft);
    } else if (action === "profile-synthesize" && draft && !draft.busy) {
      await synthesize(draft);
    } else if (action === "profile-save" && draft && !draft.busy) {
      await persistProfile(profileFromDraft(draft), "画像已保存。");
    } else if (action === "profile-fact-delete" && state.profile) {
      const fact = state.profile.facts.find((item) => item.id === control.dataset.factId);
      if (!fact) return true;
      await updateProfile({
        facts: state.profile.facts.filter((item) => item.id !== fact.id),
        // 删掉的是从练习中提炼的观察时，同样不再提出
        dismissedFacts: fact.source === "practice" ? withDismissed(fact.text) : state.profile.dismissedFacts,
      }, "已删除这条记忆。", state.profile.facts.length > 1 ? "profile-fact-delete" : "profile-fact-add");
    } else if (action === "profile-fact-add" && state.profile) {
      const input = ctx.root.querySelector("[data-profile-new-fact]");
      const text = input?.value.trim() ?? "";
      if (!text) return true;
      if (state.profile.facts.length >= MAX_FACTS) {
        ctx.showToast(`最多记住 ${MAX_FACTS} 条，先删掉一条再添加。`, "danger");
        return true;
      }
      await updateProfile({ facts: [...state.profile.facts, { text, source: "survey", createdAt: new Date().toISOString() }] }, "已记下。", "profile-fact-add");
    } else if (action === "profile-pending-accept" && state.profile) {
      const item = state.profile.pendingFacts.find((entry) => entry.id === control.dataset.pendingId);
      if (!item) return true;
      if (state.profile.facts.length >= MAX_FACTS) {
        ctx.showToast(`最多记住 ${MAX_FACTS} 条，先删掉一条再采纳。`, "danger");
        return true;
      }
      await updateProfile({
        facts: [...state.profile.facts, { text: item.text, source: "practice", createdAt: new Date().toISOString() }],
        pendingFacts: state.profile.pendingFacts.filter((entry) => entry.id !== item.id),
      }, "已记下，之后出题会参考。", nextPendingFocus());
    } else if (action === "profile-pending-dismiss" && state.profile) {
      const item = state.profile.pendingFacts.find((entry) => entry.id === control.dataset.pendingId);
      if (!item) return true;
      await updateProfile({
        pendingFacts: state.profile.pendingFacts.filter((entry) => entry.id !== item.id),
        dismissedFacts: withDismissed(item.text),
      }, "已忽略这条观察，之后不会再提。", nextPendingFocus());
    } else if (action === "profile-delete" && state.profile) {
      if (!confirmDeleteProfile) {
        confirmDeleteProfile = true;
        ctx.render();
        return true;
      }
      confirmDeleteProfile = false;
      state.profile = await ctx.saveProfile(null);
      state.profileDraft = null;
      ctx.showToast("画像已删除。已经生成的题目仍保留在题库里。", "default");
      ctx.render();
    } else if (action === "ai-retry") {
      failures = 0;
      exampleFailedFor = null;
      reflectionFailedAt = -1;
      state.ai.lastError = "";
      ctx.render();
      schedule();
    } else if (action === "ai-config-open") {
      await openConfigForm();
    } else if (action === "ai-config-cancel") {
      state.ai.configForm = null;
      ctx.render();
    } else if (action === "ai-config-clear-key" && state.ai.configForm?.values) {
      const provider = control.dataset.provider;
      state.ai.configForm.clearKey[provider] = !state.ai.configForm.clearKey[provider];
      ctx.render();
    } else if (action === "ai-config-save" && state.ai.configForm?.values && !state.ai.configForm.saving) {
      await saveConfigForm(state.ai.configForm);
    } else {
      return action.startsWith("profile-") || action.startsWith("ai-");
    }
    return true;
  }

  /** 问卷与 AI 配置表单的输入只写进草稿、不重渲染，避免打断输入；返回 true 表示已处理。 */
  function handleInput(target) {
    if (target.matches("[data-ai-config]")) {
      const [provider, field] = target.dataset.aiConfig.split(".");
      const values = state.ai.configForm?.values?.[provider];
      if (values && field in values) values[field] = target.value;
      return true;
    }
    const draft = state.profileDraft;
    if (!draft) return false;
    if (target.matches("[data-profile-field]")) {
      draft[target.dataset.profileField] = target.value;
      return true;
    }
    if (target.matches("[data-profile-situation]")) {
      const item = draft.situations[Number(target.dataset.profileSituation)];
      if (item) item[target.dataset.part === "when" ? "when" : "text"] = target.value;
      return true;
    }
    if (target.matches("[data-profile-followup]")) {
      const item = draft.followups[Number(target.dataset.profileFollowup)];
      if (item) item.answer = target.value;
      return true;
    }
    return false;
  }

  /** AI 同意开关与服务选择；返回 true 表示已处理。 */
  async function handleChange(target) {
    if (target.matches("[data-ai-consent]")) {
      // 勾选即同意当前版本的说明；先记版本再开启，避免中途按旧版同意生效
      if (target.checked) await ctx.updateSetting("aiConsentVersion", AI_CONSENT_VERSION);
      await ctx.updateSetting("aiEnabled", target.checked);
      failures = 0;
      state.ai.lastError = "";
      ctx.render();
      schedule();
      return true;
    }
    if (target.matches("[data-ai-provider]")) {
      await ctx.updateSetting("aiProvider", target.value);
      failures = 0;
      state.ai.lastError = "";
      ctx.render();
      schedule();
      return true;
    }
    return false;
  }

  // ---------- 渲染 ----------

  function renderConsentToggle() {
    const outdated = consentOutdated() ? `<em class="ai-consent-notice">发送内容有更新（新增训练摘要），AI 已暂停，重新勾选后继续。</em>` : "";
    return `<label class="setting-row toggle-row"><span><b>允许把画像和训练摘要发送给 ${escapeHtml(providerLabel())}</b><small>用于 AI 追问、整理画像、生成课程示范和练习题、提炼练习观察。调研时发送你的问卷回答；出题和提炼观察时发送画像摘要和训练摘要（学到第几课、各步覆盖率、行为弱项、最近练过的题目和你写下的“带走的一句话”）。不发送录音。可以随时关闭。</small>${outdated}</span><input type="checkbox" role="switch" data-ai-consent${consented() ? " checked" : ""}><i aria-hidden="true"></i></label>`;
  }

  function renderSurveyAi(draft) {
    if (!available()) {
      return `<section class="settings-section survey-section"><h2>7. AI 追问与整理</h2><p class="drill-hint">本机服务端还没有配置模型服务。现在保存，画像只包含你填写的内容；配置好后可以回来让 AI 追问并整理画像（配置方法见 README）。</p></section>`;
    }
    const followups = draft.followups.length
      ? `<div class="followup-list">${draft.followups.map((item, index) => `<label class="field"><span>${escapeHtml(item.question)}</span>${item.why ? `<small class="field-hint">${escapeHtml(item.why)}</small>` : ""}<textarea rows="2" maxlength="400" data-profile-followup="${index}" placeholder="写一两句就够">${escapeHtml(item.answer ?? "")}</textarea></label>`).join("")}</div>`
      : `<p class="drill-hint">AI 会读你的回答，追问 2–3 个细节，比如对方是谁、利害是什么、最近一次卡在哪里。</p>`;
    const askLabel = draft.busy === "ask" ? "AI 正在想追问…" : draft.followups.length ? "换一组追问" : "让 AI 追问 2–3 个细节";
    return `<section class="settings-section survey-section"><h2>7. AI 追问与整理</h2>
      ${renderConsentToggle()}
      ${consented() ? `${followups}<div class="drill-actions"><button class="button button-secondary" type="button" data-action="profile-ask"${draft.busy ? " disabled" : ""}>${icon("brain")}${askLabel}</button></div>` : ""}
    </section>`;
  }

  function renderSurvey(draft) {
    const ratingRows = SELF_RATING_DIMENSIONS.map((dimension) => `<div class="rating-row"><span>${escapeHtml(dimension.label)}</span><div class="rating-options" role="radiogroup" aria-label="${escapeHtml(dimension.label)}">${[1, 2, 3, 4, 5].map((value) => {
      const active = draft.selfRating[dimension.id] === value;
      return `<button type="button" role="radio" aria-checked="${active}" class="${active ? "is-active" : ""}" data-action="profile-rate" data-dim="${dimension.id}" data-value="${value}">${value}</button>`;
    }).join("")}</div></div>`).join("");
    const depthOption = (value, label, hint) => `<button type="button" role="radio" aria-checked="${draft.depth === value}" class="${draft.depth === value ? "is-active" : ""}" data-action="profile-depth" data-value="${value}"><span>${label}</span><small>${hint}</small></button>`;
    const busyText = draft.busy === "synthesize" ? "AI 正在整理画像…" : "";
    const aiReady = enabled();
    return `
      <div class="page-heading"><div><p class="eyebrow">画像调研 · 约 3 分钟</p><h1>先让系统了解你</h1><p>回答越具体，题目越贴近你。所有内容只存在这台设备上；只有你同意后，摘要才会发送给 AI。</p></div></div>
      <div class="survey">
        <section class="settings-section survey-section"><h2>1. 你现在是谁</h2>
          <p class="drill-hint">写清你的身份和正在做的事。AI 整理画像时会据此判断学术、生活、转化、创业四条线的出题比例，示范和练习里的人物也按你的身份来写。</p>
          <label class="field"><span>一句话介绍你自己</span><input type="text" maxlength="120" data-profile-field="identity" value="${escapeHtml(draft.identity)}" placeholder="例如：物理博一，研究方向是机器学习，打算以后创业"></label>
        </section>
        <section class="settings-section survey-section"><h2>2. 最想提高什么（最多 ${MAX_FOCUS} 个）</h2>
          <div class="chip-group">${FOCUS_OPTIONS.map((option) => { const active = draft.focus.includes(option.id); return `<button type="button" class="chip${active ? " is-active" : ""}" aria-pressed="${active}" data-action="profile-focus" data-value="${option.id}">${escapeHtml(option.label)}</button>`; }).join("")}</div>
        </section>
        <section class="settings-section survey-section"><h2>3. 接下来真实要面对的场合</h2>
          <p class="drill-hint">写具体：对谁、什么场合、为什么重要。例如“下个月组会汇报实验进展，导师很在意数据可靠性”。题目会优先按这些场合来出。</p>
          ${draft.situations.map((item, index) => `<div class="situation-row"><input type="text" maxlength="120" aria-label="场合 ${index + 1}" data-profile-situation="${index}" data-part="text" value="${escapeHtml(item.text)}" placeholder="场合 ${index + 1}"><input type="text" maxlength="30" aria-label="场合 ${index + 1} 的时间" data-profile-situation="${index}" data-part="when" value="${escapeHtml(item.when)}" placeholder="大概什么时候"></div>`).join("")}
        </section>
        <section class="settings-section survey-section"><h2>4. 给现在的自己打个分</h2>
          <p class="drill-hint">1 分很吃力，5 分很自如。自评通常偏高；练过几个回合后，画像页会把它和实测结果并排对比。</p>
          ${ratingRows}
        </section>
        <section class="settings-section survey-section"><h2>5. 题目偏好</h2>
          <div class="segmented" role="radiogroup" aria-label="题目深浅">${depthOption("deep", "贴近我的真实细节", "人和事都按我的处境来写")}${depthOption("light", "只借用我的领域", "情境保持通用，少一些代入")}</div>
          <label class="field"><span>不想练的话题（可不填）</span><input type="text" maxlength="120" data-profile-field="avoid" value="${escapeHtml(draft.avoid)}" placeholder="例如：家庭关系、感情话题"></label>
        </section>
        <section class="settings-section survey-section"><h2>6. 练习计划</h2>
          <p class="drill-hint">写成“如果……，我就……”，比“每天练习”更容易坚持。</p>
          <label class="field"><span>我的计划</span><input type="text" maxlength="120" data-profile-field="ifThen" value="${escapeHtml(draft.ifThen)}" placeholder="如果每天晚饭后打开电脑，我就先练一回合"></label>
        </section>
        ${state.profile ? `<section class="settings-section survey-section"><h2>画像摘要</h2><label class="field"><span>可以直接修改；重新让 AI 整理时会覆盖</span><textarea rows="3" maxlength="300" data-profile-field="summary">${escapeHtml(draft.summary)}</textarea></label></section>` : ""}
        ${renderSurveyAi(draft)}
        <div class="drill-actions">
          ${aiReady ? `<button class="button button-primary button-large" type="button" data-action="profile-synthesize"${draft.busy ? " disabled" : ""}>${icon("brain")}${busyText || "让 AI 整理画像并保存"}</button><button class="button button-secondary" type="button" data-action="profile-save"${draft.busy ? " disabled" : ""}>直接保存，不用 AI 整理</button>` : `<button class="button button-primary button-large" type="button" data-action="profile-save">${icon("check")}保存画像</button>`}
          ${state.profile ? `<button class="button button-ghost" type="button" data-action="profile-cancel"${draft.busy ? " disabled" : ""}>取消</button>` : ""}
        </div>
      </div>`;
  }

  /** 实测：该维度检查项的首轮做到率（按观察次数加权），观察不足时不显示。 */
  function measuredRate(rates, dimension) {
    const entries = dimension.checks.map((id) => rates[id]).filter(Boolean);
    const attempts = entries.reduce((sum, entry) => sum + entry.attempts, 0);
    if (attempts < MEASURED_MIN_ATTEMPTS) return null;
    return { attempts, rate: Math.round((entries.reduce((sum, entry) => sum + entry.firstPassed, 0) / attempts) * 100) };
  }

  function renderProfileView(profile) {
    const rates = behaviorRates(state.drills);
    const situationItems = profile.situations.map((item) => {
      const context = CONTEXT_MAP.get(item.contextId);
      return `<li><strong>${escapeHtml(item.text)}</strong>${item.when ? `<small>${escapeHtml(item.when)}</small>` : ""}<span>${context ? `对应语境：${escapeHtml(LINES[context.line].label)} · ${escapeHtml(context.label)}` : "还没有对应到语境（让 AI 整理画像后会自动对应）"}</span></li>`;
    }).join("");
    const ratingRows = SELF_RATING_DIMENSIONS.map((dimension) => {
      const self = profile.selfRating[dimension.id];
      const measured = measuredRate(rates, dimension);
      return `<div><span>${escapeHtml(dimension.label)}</span><strong>${self ? `${self} / 5` : "—"}</strong><em>${measured ? `首轮做到 ${measured.rate}%（${measured.attempts} 次）` : "练习 3 次后显示"}</em></div>`;
    }).join("");
    const facts = profile.facts.map((fact) => `<li><span>${escapeHtml(fact.text)}</span><small>${FACT_SOURCE_LABELS[fact.source]}</small><button class="icon-button" type="button" data-action="profile-fact-delete" data-fact-id="${escapeHtml(fact.id)}" aria-label="删除这条记忆">${icon("x")}</button></li>`).join("");
    const pending = profile.pendingFacts.map((item) => `<li><div><span>${escapeHtml(item.text)}</span><small>依据：${escapeHtml(item.evidence)}</small></div><div class="pending-actions"><button class="button button-secondary" type="button" data-action="profile-pending-accept" data-pending-id="${escapeHtml(item.id)}">${icon("check")}记住</button><button class="button button-ghost" type="button" data-action="profile-pending-dismiss" data-pending-id="${escapeHtml(item.id)}">忽略</button></div></li>`).join("");
    const pendingSection = pending
      ? `<section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">AI 从最近的练习中发现，确认后才会记住</p><h2>待确认的新观察</h2></div></div><ul class="profile-pending">${pending}</ul></section>`
      : "";
    const digest = currentDigest();
    const training = currentTraining();
    return `
      <div class="page-heading"><div><p class="eyebrow">系统记住的你</p><h1>${escapeHtml(profile.identity || "我的画像")}</h1><p>出题时会参考这些内容，你可以随时修改或删除。只有开启 AI 后，下方“将发送给模型的内容”才会被发送。</p></div><div class="library-count"><strong>${freshCount()}</strong><span>道为你生成的新题</span></div></div>
      <div class="profile-layout">
        ${pendingSection}
        <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">画像摘要</p><h2>${profile.summary ? "AI 整理的画像" : "还没有 AI 摘要"}</h2></div></div>
          <p>${escapeHtml(profile.summary || (enabled() ? "点下方“编辑画像”，让 AI 追问并整理。" : "开启 AI 后可以让它追问并整理画像。"))}</p>
          ${profile.focus.length ? `<div class="chip-group is-static">${profile.focus.map((id) => `<span class="chip is-active">${escapeHtml(focusLabel(id))}</span>`).join("")}</div>` : ""}
          ${profile.ifThen ? `<p class="drill-lesson">练习计划：${escapeHtml(profile.ifThen)}</p>` : ""}
          <p class="drill-hint">出题比例：${escapeHtml(ctx.lineWeightHint())}。让 AI 整理画像时，会按你的身份和真实场合重新判断。</p>
        </section>
        <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">最多 ${MAX_FACTS} 条</p><h2>记住的事</h2></div></div>
          ${facts ? `<ul class="profile-facts">${facts}</ul>` : `<div class="empty-inline"><p>还没有记忆。让 AI 整理画像，或在下面手动补充。</p></div>`}
          <div class="fact-add"><input type="text" maxlength="120" data-profile-new-fact aria-label="补充一条记忆" placeholder="补充一条你想让系统记住的事"><button class="button button-secondary" type="button" data-action="profile-fact-add">${icon("plus")}添加</button></div>
        </section>
        <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">题目会优先按这些场合来出</p><h2>接下来要面对的场合</h2></div></div>
          ${situationItems ? `<ul class="profile-situations">${situationItems}</ul>` : `<div class="empty-inline"><p>还没有填写。真实场合越具体，题目越贴近你。</p></div>`}
        </section>
        <section class="dashboard-section"><div class="section-heading"><div><p class="eyebrow">自评通常偏高，以实测为准</p><h2>自评与实测</h2></div></div>
          <div class="rating-compare">${ratingRows}</div>
        </section>
        <details class="dashboard-section digest-preview"><summary>${icon("info")}将发送给模型的内容</summary><h3>画像摘要</h3><pre>${escapeHtml(digest || "（画像为空）")}</pre><h3>训练摘要</h3><pre>${escapeHtml(training)}</pre><p class="drill-hint">训练摘要每次按最新记录现算。出题时还会附上本题结构各步的覆盖率、重点考查的步骤、它对应的那一条真实场合，以及题目所属的语境和表达结构；每完成 ${REFLECTION_INTERVAL} 个回合，提炼观察时会发送最近 10 个回合的题目、没做到的检查项和“带走的一句话”。不会发送自评分数和录音。</p></details>
        <div class="drill-actions"><button class="button button-primary" type="button" data-action="profile-start">${icon("brain")}编辑画像 / 重新调研</button><button class="button button-danger-ghost" type="button" data-action="profile-delete">${icon("trash")}${confirmDeleteProfile ? "再点一次确认删除画像" : "删除画像"}</button></div>
      </div>`;
  }

  /** 画像页：有草稿或还没有画像时显示问卷，否则显示画像。 */
  function renderProfilePage() {
    if (!state.profile && !state.profileDraft) state.profileDraft = draftFromProfile(null);
    return state.profileDraft ? renderSurvey(state.profileDraft) : renderProfileView(state.profile);
  }

  function sourceHint(field) {
    return field.source === "web" ? "网页填写；清空后回到 .env 的值" : field.source === "env" ? "来自 .env" : "未填写";
  }

  function keyHint(form, provider) {
    const key = form.info[provider].key;
    if (form.clearKey[provider]) return "保存时会清除网页填写的密钥" + (provider === "openai" ? "" : "，回到 .env 的密钥（如果有）");
    if (!key.set) return "未配置";
    return `已配置（${key.source === "web" ? "网页填写" : "来自 .env"}）。留空表示不修改，保存后不会再显示`;
  }

  function renderConfigInput(form, provider, field, label, { type = "text", placeholder = "", hint = "" } = {}) {
    const value = form.values[provider][field];
    return `<label class="field"><span>${label}</span><input type="${type}" autocomplete="off" spellcheck="false" data-ai-config="${provider}.${field}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"><small class="field-hint">${escapeHtml(hint || sourceHint(form.info[provider][field]))}</small></label>`;
  }

  function renderKeyInput(form, provider) {
    const canClear = form.info[provider].key.source === "web";
    return `<label class="field"><span>API 密钥</span><input type="password" autocomplete="off" data-ai-config="${provider}.apiKey" value="${escapeHtml(form.values[provider].apiKey)}" placeholder="${form.info[provider].key.set ? "留空表示不修改" : "粘贴密钥"}"><small class="field-hint">${escapeHtml(keyHint(form, provider))}</small></label>
      ${canClear ? `<button class="text-button" type="button" data-action="ai-config-clear-key" data-provider="${provider}">${form.clearKey[provider] ? "不清除网页填写的密钥" : "清除网页填写的密钥"}</button>` : ""}`;
  }

  /** 设置页填写模型服务：保存在本机服务端的配置文件里，密钥不回到浏览器。 */
  function renderConfigForm(form) {
    if (form.loading) return `<div class="ai-config"><p class="drill-hint">正在读取当前配置…</p></div>`;
    if (!form.values) {
      return `<div class="ai-config"><p class="data-note danger-text">${escapeHtml(form.error)}</p><div class="drill-actions"><button class="button button-ghost" type="button" data-action="ai-config-cancel">关闭</button></div></div>`;
    }
    const jsonMode = form.values.openai.jsonMode;
    return `<div class="ai-config">
      <h3>Claude</h3>
      ${renderKeyInput(form, "anthropic")}
      ${renderConfigInput(form, "anthropic", "model", "模型", { placeholder: "claude-opus-5-5" })}
      <h3>OpenAI 兼容接口</h3>
      <p class="drill-hint">通义千问、DeepSeek、智谱、豆包等，接口地址和模型名以各家控制台为准。更换接口地址时需要同时填写这个地址的密钥。</p>
      ${renderConfigInput(form, "openai", "label", "显示名称", { placeholder: "例如：通义千问" })}
      ${renderConfigInput(form, "openai", "baseUrl", "接口地址", { placeholder: "https://…/v1" })}
      ${renderKeyInput(form, "openai")}
      ${renderConfigInput(form, "openai", "model", "模型", { placeholder: "建议写带日期的固定版本" })}
      <label class="field"><span>输出格式</span><select data-ai-config="openai.jsonMode"><option value="json_schema"${jsonMode === "json_schema" ? " selected" : ""}>json_schema：严格按结构输出（通义千问、豆包等）</option><option value="json_object"${jsonMode === "json_object" ? " selected" : ""}>json_object：只保证是 JSON（DeepSeek、智谱等）</option></select><small class="field-hint">${escapeHtml(sourceHint(form.info.openai.jsonMode))}</small></label>
      <label class="field"><span>附加请求参数（可不填）</span><textarea rows="2" spellcheck="false" data-ai-config="openai.extraBody" placeholder='例如 {"enable_thinking": false}'>${escapeHtml(form.values.openai.extraBody)}</textarea><small class="field-hint">${escapeHtml(sourceHint(form.info.openai.extraBody))}</small></label>
      <p class="drill-hint">保存在运行服务这台电脑的 ai-config.local.json（不进 git），网页填写的值优先于 .env，保存后立即生效。只能在这台电脑上用 localhost 打开页面修改。</p>
      ${form.error ? `<p class="data-note danger-text">${escapeHtml(form.error)}</p>` : ""}
      <div class="drill-actions"><button class="button button-primary" type="button" data-action="ai-config-save"${form.saving ? " disabled" : ""}>${icon("check")}${form.saving ? "正在保存…" : "保存配置"}</button><button class="button button-ghost" type="button" data-action="ai-config-cancel"${form.saving ? " disabled" : ""}>取消</button></div>
    </div>`;
  }

  /** 设置页的 AI 区：服务状态、在网页填写配置、选择服务、同意开关、生成情况。 */
  function renderAiSettings() {
    const status = state.ai.status;
    const providers = status?.providers ?? [];
    const configured = configuredProviders();
    const exampleTotal = state.generatedCards.filter((card) => card.purpose === "example").length;
    const practiceTotal = state.generatedCards.length - exampleTotal;
    const providerList = providers.length
      ? `<div class="ai-provider-list">${providers.map((provider) => `<div><strong>${escapeHtml(provider.label)}</strong><small>${escapeHtml(provider.model || "未填写模型名")}</small><span class="status-badge ${provider.configured ? "status-done" : "status-abandoned"}">${provider.configured ? "已配置" : "未配置"}</span></div>`).join("")}</div>`
      : "";
    const form = state.ai.configForm;
    const configEntry = form
      ? renderConfigForm(form)
      : `<div class="setting-row stacked"><div><span>模型服务</span><small>${configured.length ? "可以在这里修改密钥、接口地址和模型。" : "在这里填写一家模型服务的密钥就能开启 AI，也可以写在 .env 里。"}</small></div><button class="button ${configured.length ? "button-secondary" : "button-primary"}" type="button" data-action="ai-config-open">${icon("settings")}${configured.length ? "修改模型服务" : "填写模型服务"}</button></div>`;
    let body;
    if (!status) {
      body = `<p class="data-note">没有连上本机服务端（可能是以纯静态方式打开的页面），AI 功能不可用，其余功能照常。</p>`;
    } else if (!configured.length) {
      body = `${providerList}${configEntry}`;
    } else {
      body = `${providerList}
        ${configEntry}
        ${configured.length > 1 ? `<label class="field"><span>使用哪家模型</span><select data-ai-provider>${configured.map((provider) => `<option value="${provider.id}"${provider.id === providerId() ? " selected" : ""}>${escapeHtml(provider.label)}（${escapeHtml(provider.model)}）</option>`).join("")}</select></label>` : ""}
        ${renderConsentToggle()}
        <p class="data-note">已为你生成 ${practiceTotal} 道练习题（${freshCount()} 道还没练）和 ${exampleTotal} 个课程示范。${state.ai.generating ? "正在生成…" : ""}</p>
        ${state.ai.lastError ? `<p class="data-note danger-text">最近一次生成失败：${escapeHtml(state.ai.lastError)}</p>${failures >= MAX_CONSECUTIVE_FAILURES ? `<button class="button button-secondary" type="button" data-action="ai-retry">${icon("rotate")}重新开始生成</button>` : ""}` : ""}`;
    }
    return `<section class="settings-section ai-settings"><div class="settings-head"><div>${icon("brain")}</div><span><h2>AI 助手</h2><p>按你的画像生成课程示范和练习题。密钥保存在本机服务端，不会存进浏览器。</p></span></div>
      ${body}
      <div class="setting-row stacked"><div><span>我的画像</span><small>${state.profile ? `已建档，最近更新于 ${escapeHtml(new Date(state.profile.updatedAt).toLocaleDateString("zh-CN"))}` : "还没有建档"}</small></div><button class="button button-secondary" type="button" data-action="navigate" data-view="profile">${icon("chevronRight")}查看画像</button></div>
    </section>`;
  }

  /** 首页提示：还没有画像时邀请调研；说明更新时提示重新确认；AI 开启后显示新题数量、生成状态与待确认观察。 */
  function renderHomePrompt() {
    if (!state.profile) {
      return `<section class="focus-band"><div class="focus-icon">${icon("brain")}</div><div><p class="eyebrow">让题目贴近你</p><h2>花 3 分钟做一次画像调研</h2><p>告诉系统你想提高什么、接下来要面对哪些真实场合。开启 AI 后，练习题会按这些场合来出。</p></div><button class="button button-secondary" type="button" data-action="profile-start">开始调研${icon("chevronRight")}</button></section>`;
    }
    if (consentOutdated()) {
      return `<p class="ai-home-status">${icon("info")}AI 现在会参考你的训练进度出题，发送内容有更新，已暂停。 <button class="text-button" type="button" data-action="navigate" data-view="settings">去设置重新确认</button></p>`;
    }
    if (!enabled()) return "";
    const fresh = freshCount();
    // 下一课的示范是否写好，由首页行动卡在课程入口旁注明
    const text = state.ai.generating ? "AI 正在按你的画像和训练进度准备示范和新题…" : fresh ? `AI 已为你准备 ${fresh} 道新题，抽题时会优先出现。` : "学完第一课后，AI 会开始为你出题。";
    const pending = state.profile.pendingFacts.length
      ? ` <button class="text-button" type="button" data-action="navigate" data-view="profile">有 ${state.profile.pendingFacts.length} 条练习观察待确认</button>`
      : "";
    return `<p class="ai-home-status">${icon("brain")}${escapeHtml(text)}${pending}${state.ai.lastError && failures >= MAX_CONSECUTIVE_FAILURES ? ` <button class="text-button" type="button" data-action="navigate" data-view="settings">生成失败，去设置查看</button>` : ""}</p>`;
  }

  /** 这一课是否有已经写好、还没用过的 AI 示范（首页课程入口旁注明）。 */
  function lessonExampleReady(paradigm) {
    return Boolean(pickLessonExample(paradigm, { runs: state.activeLesson ? [...state.lessonRuns, state.activeLesson] : state.lessonRuns }));
  }

  return { init, schedule, handleAction, handleInput, handleChange, renderProfilePage, renderAiSettings, renderHomePrompt, freshCount, lessonExampleReady };
}
