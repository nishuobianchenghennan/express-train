const DAY_MS = 86_400_000;

function sessionTime(session) {
  return new Date(session.completedAt ?? session.startedAt ?? 0).getTime();
}

function withinDays(session, now, days) {
  return now.getTime() - sessionTime(session) < days * DAY_MS;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = typeof key === "function" ? key(item) : item[key];
    if (value) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function weightedChoice(items, random) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item;
    }
  }
  return items.at(-1);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lowestCoverageSubset(candidates, allCards, counts, key) {
  const categories = [...new Set(allCards.map((card) => card[key]))];
  const minimum = Math.min(...categories.map((category) => counts[category] ?? 0));
  const subset = candidates.filter((card) => (counts[card[key]] ?? 0) === minimum);
  return subset.length > 0 ? subset : candidates;
}

function closestDifficultySubset(candidates, targetLevel) {
  const minimumDistance = Math.min(
    ...candidates.map((card) => Math.abs(card.difficulty - targetLevel)),
  );
  const subset = candidates.filter(
    (card) => Math.abs(card.difficulty - targetLevel) === minimumDistance,
  );
  return subset.length > 0 ? subset : candidates;
}

function weakMetrics(history) {
  const recent = history.filter((session) => session.completionStatus === "completed").slice(-12);
  const totals = {};
  for (const session of recent) {
    for (const [metricId, score] of Object.entries(session.retryScores ?? session.selfScores ?? {})) {
      if (!Number.isFinite(score)) {
        continue;
      }
      totals[metricId] ??= { total: 0, count: 0 };
      totals[metricId].total += score;
      totals[metricId].count += 1;
    }
  }
  return Object.entries(totals)
    .filter(([, value]) => value.count >= 3 && value.total / value.count < 3.2)
    .map(([metricId]) => metricId);
}

function selectionBucket(candidates, history, random) {
  const completed = history.filter((session) => session.completionStatus === "completed");
  const failedIds = new Set(
    history
      .filter(
        (session) =>
          session.completionStatus === "abandoned" ||
          (session.completionStatus === "completed" && session.observableImprovement === false),
      )
      .map((session) => session.taskCardId),
  );
  const completedTopics = new Map();
  for (const session of completed) {
    if (!session.topic) {
      continue;
    }
    const scenes = completedTopics.get(session.topic) ?? new Set();
    scenes.add(session.scene);
    completedTopics.set(session.topic, scenes);
  }
  const usedIds = new Set(history.map((session) => session.taskCardId));

  const failed = candidates.filter((card) => failedIds.has(card.id));
  const migration = candidates.filter(
    (card) => completedTopics.has(card.topic) && !completedTopics.get(card.topic).has(card.scene),
  );
  const newCards = candidates.filter((card) => !usedIds.has(card.id));
  const roll = random();

  if (roll < 0.1 && failed.length > 0) {
    return { cards: failed, reason: "失败任务重练" };
  }
  if (roll < 0.3 && migration.length > 0) {
    return { cards: migration, reason: "旧题跨场景迁移" };
  }
  if (newCards.length > 0) {
    return { cards: newCards, reason: "新题探索与覆盖均衡" };
  }
  return { cards: candidates, reason: "覆盖均衡" };
}

export function selectTask({
  cards,
  history = [],
  settings = {},
  requestedScene = null,
  excludedIds = [],
  now = new Date(),
  random = Math.random,
} = {}) {
  const active = cards.filter(
    (card) =>
      card.status === "active" &&
      (!requestedScene || card.scene === requestedScene) &&
      !excludedIds.includes(card.id),
  );
  if (active.length === 0) {
    throw new Error("没有符合当前条件的可用题卡");
  }

  const recent30 = history.filter((session) => withinDays(session, now, 30));
  const recent60 = history.filter((session) => withinDays(session, now, 60));
  const cardIds30 = new Set(recent30.map((session) => session.taskCardId));
  const topics7 = new Set(
    history.filter((session) => withinDays(session, now, 7)).map((session) => session.topic),
  );
  const lastStructures = history
    .filter((session) => session.completionStatus === "completed")
    .sort((left, right) => sessionTime(right) - sessionTime(left))
    .slice(0, 2)
    .map((session) => session.structureId);

  const filters = [
    (card) =>
      !cardIds30.has(card.id) &&
      !topics7.has(card.topic) &&
      !(lastStructures.length === 2 && lastStructures.every((id) => id === card.structureId)),
    (card) =>
      !topics7.has(card.topic) &&
      !(lastStructures.length === 2 && lastStructures.every((id) => id === card.structureId)),
    (card) => !(lastStructures.length === 2 && lastStructures.every((id) => id === card.structureId)),
    () => true,
  ];

  let candidates = [];
  let relaxationLevel = 0;
  for (let index = 0; index < filters.length; index += 1) {
    candidates = active.filter(filters[index]);
    if (candidates.length > 0) {
      relaxationLevel = index;
      break;
    }
  }

  const sceneCounts = countBy(recent30, "scene");
  const domainCounts = countBy(recent60, "domain");
  if (!requestedScene) {
    candidates = lowestCoverageSubset(candidates, active, sceneCounts, "scene");
  }
  candidates = lowestCoverageSubset(candidates, active, domainCounts, "domain");
  const bucket = selectionBucket(candidates, history, random);
  candidates = bucket.cards;
  const maximumSceneCount = Math.max(0, ...Object.values(sceneCounts));
  const maximumDomainCount = Math.max(0, ...Object.values(domainCounts));
  const completedCount = history.filter((session) => session.completionStatus === "completed").length;
  const weaknessIds = completedCount >= 14 ? weakMetrics(history) : [];
  const userLevel = clamp(Number(settings.level) || 2, 1, 5);
  const consecutiveIncomplete = history
    .slice()
    .sort((left, right) => sessionTime(right) - sessionTime(left))
    .slice(0, 2)
    .every((session) => session.completionStatus !== "completed");
  const targetLevel = consecutiveIncomplete && history.length >= 2 ? Math.max(1, userLevel - 1) : userLevel;
  candidates = closestDifficultySubset(candidates, targetLevel);

  const weighted = candidates.map((card) => {
    const sceneGap = clamp((maximumSceneCount + 2) / ((sceneCounts[card.scene] ?? 0) + 2), 0.75, 2.2);
    const domainGap = clamp((maximumDomainCount + 2) / ((domainCounts[card.domain] ?? 0) + 2), 0.8, 2);
    const difficultyFit = 1 / (1 + Math.abs(card.difficulty - targetLevel) * 0.55);
    const weaknessBoost = card.reviewMetricIds.some((id) => weaknessIds.includes(id)) ? 1.45 : 1;
    const weight = card.baseWeight * sceneGap * domainGap * difficultyFit * weaknessBoost;
    return { card, weight };
  });

  const picked = weightedChoice(weighted, random);
  return {
    card: picked.card,
    reason: requestedScene ? `指定场景 · ${bucket.reason}` : bucket.reason,
    diagnostics: {
      relaxationLevel,
      targetLevel,
      candidateCount: candidates.length,
      weakMetricIds: weaknessIds,
      selectedWeight: Number(picked.weight.toFixed(3)),
    },
  };
}

export function createSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function hashString(value) {
  let hash = 2_166_136_261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function decrementCount(counts, value) {
  const next = (counts.get(value) ?? 0) - 1;
  if (next <= 0) {
    counts.delete(value);
  } else {
    counts.set(value, next);
  }
}

function mapCounts(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function annualDate(year, index) {
  const offset = index + (isLeapYear(year) && index >= 59 ? 1 : 0);
  return new Date(Date.UTC(year, 0, offset + 1)).toISOString().slice(0, 10);
}

function localDateKey(value) {
  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function progressionAverages(cards) {
  const segmentSize = Math.floor(cards.length / 4);
  return [0, 1, 2, 3].map((quarter) => {
    const start = quarter * segmentSize;
    const end = quarter === 3 ? cards.length : (quarter + 1) * segmentSize;
    const segment = cards.slice(start, end);
    return segment.reduce((sum, card) => sum + card.difficulty, 0) / segment.length;
  });
}

function annualSequenceValid(cards) {
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    return false;
  }
  for (let index = 1; index < cards.length; index += 1) {
    const previous = cards[index - 1];
    const current = cards[index];
    if (
      previous.scene === current.scene ||
      previous.domain === current.domain ||
      previous.structureId === current.structureId
    ) {
      return false;
    }
  }
  const averages = progressionAverages(cards);
  return averages.every((average, index) => index === 0 || average > averages[index - 1]);
}

export function createAnnualPlan(cards, { year = new Date().getFullYear(), seed = 0 } = {}) {
  const normalizedYear = Number(year);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 1970 || normalizedYear > 9999) {
    throw new Error("年度计划需要 1970-9999 之间的整数年份");
  }
  const active = cards
    .filter((card) => card.status === "active")
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  if (active.length !== 365) {
    throw new Error(`年度计划需要恰好 365 张有效题卡，当前为 ${active.length}`);
  }

  const identity = active.map((card) => `${card.id}@${card.version ?? 1}`).join("|");
  const baseSeed = hashString(`${normalizedYear}|${seed}|${identity}`);
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const random = createSeededRandom((baseSeed + Math.imul(attempt + 1, 2_654_435_761)) >>> 0);
    const tieRanks = new Map(active.map((card) => [card.id, random()]));
    const remaining = active.slice();
    const sceneCounts = mapCounts(remaining, "scene");
    const domainCounts = mapCounts(remaining, "domain");
    const structureCounts = mapCounts(remaining, "structureId");
    const ordered = [];

    while (remaining.length > 0) {
      const previous = ordered.at(-1);
      const candidates = remaining.filter(
        (card) =>
          !previous ||
          (card.scene !== previous.scene &&
            card.domain !== previous.domain &&
            card.structureId !== previous.structureId),
      );
      if (candidates.length === 0) {
        break;
      }
      const index = ordered.length;
      const targetDifficulty = 1 + (4 * index) / (active.length - 1);
      candidates.sort((left, right) => {
        const score = (card) => {
          const difficultyDistance = Math.abs(card.difficulty - targetDifficulty);
          const pressure =
            (sceneCounts.get(card.scene) ?? 0) +
            (domainCounts.get(card.domain) ?? 0) +
            (structureCounts.get(card.structureId) ?? 0);
          return difficultyDistance * 1_000 - pressure * 2 + (tieRanks.get(card.id) ?? 0);
        };
        return score(left) - score(right) || left.id.localeCompare(right.id);
      });
      const selected = candidates[0];
      ordered.push(selected);
      remaining.splice(remaining.indexOf(selected), 1);
      decrementCount(sceneCounts, selected.scene);
      decrementCount(domainCounts, selected.domain);
      decrementCount(structureCounts, selected.structureId);
    }

    if (ordered.length === active.length && annualSequenceValid(ordered)) {
      return Object.freeze(
        ordered.map((card, index) =>
          Object.freeze({
            dayNumber: index + 1,
            date: annualDate(normalizedYear, index),
            cardId: card.id,
            card,
          }),
        ),
      );
    }
  }
  throw new Error("无法在年度进阶与相邻去重约束下生成完整计划");
}

export function annualPlanEntryForDate(plan, date = new Date()) {
  const key = localDateKey(date);
  const direct = plan.find((entry) => entry.date === key) ?? null;
  if (direct || !key.endsWith("-02-29")) {
    return direct;
  }
  return plan.find((entry) => entry.date === `${key.slice(0, 4)}-02-28`) ?? null;
}

export function annualPlanAlternative(plan, currentCardId, excludedIds = []) {
  if (!Array.isArray(plan) || plan.length === 0) {
    return null;
  }
  const currentIndex = plan.findIndex((entry) => entry.cardId === currentCardId);
  const excluded = new Set([currentCardId, ...excludedIds]);
  for (let offset = 1; offset <= plan.length; offset += 1) {
    const index = currentIndex >= 0
      ? (currentIndex + offset) % plan.length
      : offset - 1;
    const entry = plan[index];
    if (entry && !excluded.has(entry.cardId)) {
      return entry;
    }
  }
  return null;
}

export function simulateSelections(cards, days = 30, seed = 42) {
  const history = [];
  const random = createSeededRandom(seed);
  const start = new Date("2026-01-01T08:00:00.000Z");
  for (let day = 0; day < days; day += 1) {
    const now = new Date(start.getTime() + day * DAY_MS);
    const selected = selectTask({ cards, history, now, random, settings: { level: 2 } });
    history.push({
      sessionId: `simulation-${day}`,
      taskCardId: selected.card.id,
      topic: selected.card.topic,
      scene: selected.card.scene,
      domain: selected.card.domain,
      structureId: selected.card.structureId,
      completionStatus: "completed",
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      selfScores: {},
    });
  }
  return history;
}
