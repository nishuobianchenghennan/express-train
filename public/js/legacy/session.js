const STAGES = ["research", "firstDelivery", "review", "retry", "complete"];

const PROTOCOL_STAGE_LABELS = {
  research_expression: {
    research: "学习与观点整理",
    organize: "学习与观点整理",
    firstDelivery: "第一次表达",
    review: "回听复盘",
    retry: "针对性重讲",
    complete: "训练完成",
  },
  impromptu_expression: {
    research: "审题与观点提纲",
    organize: "审题与观点提纲",
    firstDelivery: "第一次表达",
    review: "回听复盘",
    retry: "针对性重讲",
    complete: "训练完成",
  },
  interactive_communication: {
    research: "理解情境与回应整理",
    organize: "理解情境与回应整理",
    firstDelivery: "多轮回应",
    review: "路径复盘",
    retry: "关键轮次重答",
    complete: "训练完成",
  },
  formal_task: {
    research: "阅读背景与整理汇报",
    organize: "阅读背景与整理汇报",
    firstDelivery: "正式表达",
    review: "追问与复盘",
    retry: "修订重讲",
    complete: "训练完成",
  },
};

const QUICK_MINUTES = {
  research_expression: { research: 5, organize: 0, firstDelivery: 2, review: 2, retry: 2 },
  impromptu_expression: { research: 2, organize: 0, firstDelivery: 2, review: 2, retry: 2 },
  interactive_communication: { research: 2, organize: 0, firstDelivery: 4, review: 2, retry: 2 },
  formal_task: { research: 5, organize: 0, firstDelivery: 2, review: 2, retry: 2 },
};

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function stageMinutes(card, mode = "full") {
  if (mode === "quick") {
    return { ...QUICK_MINUTES[card.protocol] };
  }
  return {
    ...card.stageMinutes,
    research: (card.stageMinutes.research ?? 0) + (card.stageMinutes.organize ?? 0),
    organize: 0,
  };
}

export function createSession(card, options = {}) {
  const mode = options.mode === "quick" ? "quick" : "full";
  const minutes = stageMinutes(card, mode);
  return {
    sessionId: id(),
    taskCardId: card.id,
    taskCardVersion: card.version,
    scene: card.scene,
    sceneLabel: card.sceneLabel,
    domain: card.domain,
    domainLabel: card.domainLabel,
    topic: card.topic,
    topicLabel: card.topicLabel,
    title: card.title,
    taskTypes: card.taskTypes,
    taskTypeLabels: card.taskTypeLabels,
    protocol: card.protocol,
    structureId: card.structureId,
    structureName: card.structureName,
    difficulty: card.difficulty,
    mode,
    selectionReason: options.selectionReason ?? "指定题卡",
    startedAt: new Date().toISOString(),
    completedAt: null,
    completionStatus: "in_progress",
    stage: "preview",
    stageIndex: -1,
    stageMinutes: minutes,
    stageDurations: {},
    extendedStages: {},
    timer: null,
    researchChecks: {},
    sources: [],
    userNotes: {},
    recordingFirstId: null,
    recordingRetryId: null,
    recordingUnavailable: {},
    selfScores: {},
    retryScores: {},
    mainProblem: "",
    effectiveAction: "",
    retryFocus: "",
    observableImprovement: null,
    migrationRecommended: false,
    sourceRequirementsMet: false,
    swapUsed: Boolean(options.swapUsed),
    annualPlanDate: typeof options.annualPlanDate === "string" ? options.annualPlanDate : null,
    annualPlanDayNumber: Number.isInteger(options.annualPlanDayNumber)
      ? Math.min(365, Math.max(1, options.annualPlanDayNumber))
      : null,
    sensitiveSkipCount: Number.isInteger(options.sensitiveSkipCount)
      ? Math.max(0, options.sensitiveSkipCount)
      : 0,
    sensitiveSkippedCardIds: Array.isArray(options.sensitiveSkippedCardIds)
      ? [...new Set(options.sensitiveSkippedCardIds.filter((value) => typeof value === "string"))]
      : [],
    notesUpdatedAt: null,
  };
}

export function startTraining(session) {
  return {
    ...session,
    stage: STAGES[0],
    stageIndex: 0,
    timer: createTimer(session.stageMinutes[STAGES[0]]),
  };
}

export function createTimer(minutes) {
  return {
    durationSeconds: Math.max(0, Math.round(minutes * 60)),
    elapsedSeconds: 0,
    runningSince: null,
    endAt: null,
  };
}

export function currentElapsed(timer, now = Date.now()) {
  if (!timer) {
    return 0;
  }
  const running = timer.runningSince ? Math.max(0, (now - timer.runningSince) / 1000) : 0;
  return timer.elapsedSeconds + running;
}

export function timerRemaining(timer, now = Date.now()) {
  if (!timer) {
    return 0;
  }
  return Math.round(timer.durationSeconds - currentElapsed(timer, now));
}

export function toggleTimer(session, now = Date.now()) {
  const timer = session.timer ?? createTimer(session.stageMinutes[session.stage] ?? 0);
  if (timer.runningSince) {
    return {
      ...session,
      timer: {
        ...timer,
        elapsedSeconds: currentElapsed(timer, now),
        runningSince: null,
        endAt: null,
      },
    };
  }
  const remaining = timer.durationSeconds - timer.elapsedSeconds;
  return {
    ...session,
    timer: {
      ...timer,
      runningSince: now,
      endAt: now + Math.max(0, remaining) * 1000,
    },
  };
}

export function extendTimer(session, seconds = 300) {
  const timer = session.timer ?? createTimer(session.stageMinutes[session.stage] ?? 0);
  return {
    ...session,
    extendedStages: {
      ...session.extendedStages,
      [session.stage]: (session.extendedStages[session.stage] ?? 0) + seconds,
    },
    timer: {
      ...timer,
      durationSeconds: timer.durationSeconds + seconds,
      endAt: timer.endAt ? timer.endAt + seconds * 1000 : null,
    },
  };
}

export function stageLabel(protocol, stage) {
  return PROTOCOL_STAGE_LABELS[protocol]?.[stage] ?? stage;
}

export function orderedStages() {
  return [...STAGES];
}

export function advanceStage(session, now = Date.now()) {
  const currentStage = session.stage === "organize" ? "research" : session.stage;
  const currentIndex = STAGES.indexOf(currentStage);
  if (currentIndex < 0 || currentIndex >= STAGES.length - 1) {
    return session;
  }
  const elapsed = Math.round(currentElapsed(session.timer, now));
  const nextStage = STAGES[currentIndex + 1];
  return {
    ...session,
    stage: nextStage,
    stageIndex: currentIndex + 1,
    stageDurations: {
      ...session.stageDurations,
      [currentStage]: (session.stageDurations?.[currentStage] ?? 0) + elapsed,
    },
    timer: nextStage === "complete" ? null : createTimer(session.stageMinutes[nextStage] ?? 0),
  };
}

export function validateStage(session, card) {
  if (["research", "organize"].includes(session.stage)) {
    const uncheckedPrompt = card.researchPrompts.find((prompt) => !session.researchChecks?.[prompt]);
    if (uncheckedPrompt) {
      return { valid: false, message: "请按顺序处理并勾选全部学习问题。" };
    }
    const requiresSources = ["standard", "sensitive"].includes(card.sourceMode);
    const validSources = (session.sources ?? []).filter(
      (source) => source.name?.trim() && source.url?.trim() && source.support?.trim(),
    );
    if (requiresSources && validSources.length < 2) {
      return { valid: false, message: "请至少记录两个来源的名称、链接或出版信息，以及它们支持了什么。" };
    }
    if (!session.sourceRequirementsMet) {
      return { valid: false, message: "请确认已经区分事实、观点与推测，并处理必要边界。" };
    }
    const completed = card.organizingTemplate.filter((item) => session.userNotes?.[item]?.trim()).length;
    if (completed < Math.min(3, card.organizingTemplate.length)) {
      return { valid: false, message: "请至少完成三个观点整理项，再进入第一次表达。" };
    }
  }
  if (session.stage === "firstDelivery") {
    if (!session.recordingFirstId && !session.recordingUnavailable?.first) {
      return { valid: false, message: "请完成首次录音，或明确标记当前设备无法录音。" };
    }
  }
  if (session.stage === "review") {
    const required = card.reviewMetricIds;
    if (required.some((id) => !Number.isFinite(session.selfScores?.[id]))) {
      return { valid: false, message: "请完成全部分项自评。" };
    }
    if (!session.mainProblem?.trim() || !session.effectiveAction?.trim() || !session.retryFocus?.trim()) {
      return { valid: false, message: "请写下主要问题、有效动作和唯一重讲目标。" };
    }
  }
  if (session.stage === "retry") {
    if (!session.recordingRetryId && !session.recordingUnavailable?.retry) {
      return { valid: false, message: "请完成重讲录音，或明确标记当前设备无法录音。" };
    }
    if (card.reviewMetricIds.some((id) => !Number.isFinite(session.retryScores?.[id]))) {
      return { valid: false, message: "请完成重讲后的分项观察。" };
    }
    if (typeof session.observableImprovement !== "boolean") {
      return { valid: false, message: "请选择是否出现了可观察改善。" };
    }
  }
  return { valid: true, message: "" };
}

export function buildRuleFeedback(session, card, metrics) {
  const feedback = [];
  const scores = Object.entries(session.selfScores ?? {}).filter(([, score]) => Number.isFinite(score));
  const lowest = scores.sort((left, right) => left[1] - right[1])[0];
  if (lowest) {
    const label = metrics[lowest[0]]?.label ?? lowest[0];
    feedback.push(`你把“${label}”评为 ${lowest[1]} 分。回听时能否标出一个最具体的证据？`);
  }
  const firstSeconds = session.stageDurations?.firstDelivery ?? 0;
  const targetSeconds = (session.stageMinutes?.firstDelivery ?? 0) * 60;
  if (targetSeconds && firstSeconds > targetSeconds * 1.15) {
    feedback.push("首次表达明显超时。哪些内容没有直接服务受众和本轮目的？");
  } else if (targetSeconds && firstSeconds < targetSeconds * 0.65) {
    feedback.push("首次表达明显短于目标。哪个结构节点缺少例子、证据或必要边界？");
  }
  if ((session.sources?.length ?? 0) > 0 && !session.sourceRequirementsMet) {
    feedback.push("来源记录尚未完全达标。重讲时不要扩大尚未核实的结论范围。");
  }
  if (feedback.length < 3) {
    feedback.push(`围绕“${card.structureName}”，哪一个节点在录音里最难被听众识别？`);
  }
  return feedback.slice(0, 3);
}

export function totalEstimatedMinutes(session) {
  return Object.values(session.stageMinutes ?? {}).reduce((sum, value) => sum + value, 0);
}
