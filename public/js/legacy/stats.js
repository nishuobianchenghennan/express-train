const DAY_MS = 86_400_000;

function completedSessions(sessions) {
  return sessions.filter((session) => session.completionStatus === "completed");
}

function sessionDate(session) {
  return new Date(session.completedAt ?? session.startedAt ?? 0);
}

function within(session, now, days) {
  const age = now.getTime() - sessionDate(session).getTime();
  return age >= 0 && age < days * DAY_MS;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key];
    if (value) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function averageMetrics(sessions) {
  const totals = {};
  for (const session of sessions) {
    const retryScores = session.retryScores ?? {};
    const scores = Object.values(retryScores).some((score) => Number.isFinite(score))
      ? retryScores
      : (session.selfScores ?? {});
    for (const [id, score] of Object.entries(scores)) {
      if (!Number.isFinite(score)) {
        continue;
      }
      totals[id] ??= { total: 0, count: 0, scores: [] };
      totals[id].total += score;
      totals[id].count += 1;
      totals[id].scores.push(score);
    }
  }
  return Object.fromEntries(
    Object.entries(totals).map(([id, value]) => [
      id,
      {
        average: Number((value.total / value.count).toFixed(2)),
        count: value.count,
        recent: value.scores.at(-1),
        change:
          value.scores.length > 1
            ? Number((value.scores.at(-1) - value.scores[0]).toFixed(2))
            : 0,
      },
    ]),
  );
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateOrdinal(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function calculateStreak(sessions, now) {
  const dates = new Set(sessions.map((session) => localDateOrdinal(sessionDate(session))));
  const today = localDateOrdinal(now);
  let current = 0;
  while (dates.has(today - current)) {
    current += 1;
  }

  const sorted = [...dates].sort((left, right) => left - right);
  let best = 0;
  let running = 0;
  let previous = null;
  for (const value of sorted) {
    if (previous != null && value - previous === 1) {
      running += 1;
    } else {
      running = 1;
    }
    best = Math.max(best, running);
    previous = value;
  }
  return { current, best };
}

function recurringProblems(sessions) {
  const counts = sessions.reduce((result, session) => {
    const problem = session.mainProblem?.trim();
    if (problem) {
      result[problem] = (result[problem] ?? 0) + 1;
    }
    return result;
  }, {});
  return Object.entries(counts)
    .map(([problem, count]) => ({ problem, count }))
    .sort((left, right) => right.count - left.count || left.problem.localeCompare(right.problem, "zh-CN"));
}

function focusFrom(metrics, problems, metricDefinitions) {
  const repeated = problems.find((item) => item.count >= 3);
  if (repeated) {
    return {
      id: `problem:${repeated.problem}`,
      label: repeated.problem,
      reason: `这一问题已记录 ${repeated.count} 次，下一轮只观察一个可见动作。`,
    };
  }

  const weakest = Object.entries(metrics)
    .filter(([, value]) => value.count >= 2)
    .sort((left, right) => left[1].average - right[1].average)[0];
  if (weakest) {
    return {
      id: weakest[0],
      label: metricDefinitions[weakest[0]]?.label ?? weakest[0],
      reason: `近阶段平均 ${weakest[1].average} / 5，可优先安排相关题卡。`,
    };
  }

  return {
    id: "complete_loop",
    label: "完成一次完整闭环",
    reason: "数据还少，先完成准备、首次表达、自评和重讲。",
  };
}

export function calculateStats(sessions, cards, metricDefinitions = {}, now = new Date()) {
  const completed = completedSessions(sessions).sort(
    (left, right) => sessionDate(left).getTime() - sessionDate(right).getTime(),
  );
  const recent7 = completed.filter((session) => within(session, now, 7));
  const recent30 = completed.filter((session) => within(session, now, 30));
  const recent60 = completed.filter((session) => within(session, now, 60));
  const recent28 = completed.filter((session) => within(session, now, 28));
  const metrics = averageMetrics(recent30);
  const problems = recurringProblems(recent30);
  const retries = completed.filter((session) => session.recordingRetryId || session.retryCompletedWithoutRecording);
  const improved = retries.filter((session) => session.observableImprovement === true).length;
  const sourceSessions = completed.filter((session) => (session.sources?.length ?? 0) > 0);
  const sourceCompliant = sourceSessions.filter((session) => session.sourceRequirementsMet).length;
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const protocolCounts = completed.reduce((counts, session) => {
    const protocol = session.protocol ?? cardMap.get(session.taskCardId)?.protocol;
    if (protocol) {
      counts[protocol] = (counts[protocol] ?? 0) + 1;
    }
    return counts;
  }, {});

  return {
    totalCompleted: completed.length,
    completeLoops28: recent28.length,
    sceneCounts7: countBy(recent7, "scene"),
    sceneCounts30: countBy(recent30, "scene"),
    domainCounts60: countBy(recent60, "domain"),
    protocolCounts,
    metrics,
    problems,
    retryCount: retries.length,
    improvementRate: retries.length ? Math.round((improved / retries.length) * 100) : 0,
    sourceComplianceRate: sourceSessions.length
      ? Math.round((sourceCompliant / sourceSessions.length) * 100)
      : 0,
    structureDiversity30: new Set(recent30.map((session) => session.structureId)).size,
    completionDays7: new Set(recent7.map((session) => dateKey(sessionDate(session)))).size,
    streak: calculateStreak(completed, now),
    focus: focusFrom(metrics, problems, metricDefinitions),
  };
}

export function filterHistory(sessions, filters = {}) {
  const query = filters.query?.trim().toLocaleLowerCase("zh-CN");
  return sessions
    .filter((session) => !filters.scene || session.scene === filters.scene)
    .filter((session) => !filters.domain || session.domain === filters.domain)
    .filter((session) => !filters.difficulty || session.difficulty === Number(filters.difficulty))
    .filter((session) => !filters.structureId || session.structureId === filters.structureId)
    .filter(
      (session) =>
        !filters.taskType || (session.taskTypes ?? []).includes(filters.taskType),
    )
    .filter(
      (session) =>
        !filters.problem || session.mainProblem?.trim() === filters.problem,
    )
    .filter(
      (session) =>
        filters.migration === "" ||
        filters.migration == null ||
        (filters.migration === "yes" && session.migrationRecommended === true) ||
        (filters.migration === "no" && session.migrationRecommended !== true),
    )
    .filter(
      (session) =>
        !filters.completionStatus || session.completionStatus === filters.completionStatus,
    )
    .filter(
      (session) =>
        filters.retry === "" ||
        filters.retry == null ||
        (filters.retry === "yes" && Boolean(session.recordingRetryId || session.retryCompletedWithoutRecording)) ||
        (filters.retry === "no" && !session.recordingRetryId && !session.retryCompletedWithoutRecording),
    )
    .filter(
      (session) =>
        !query ||
        [session.title, session.topicLabel, session.mainProblem, session.retryFocus]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("zh-CN")
          .includes(query),
    )
    .sort((left, right) => sessionDate(right).getTime() - sessionDate(left).getTime());
}
