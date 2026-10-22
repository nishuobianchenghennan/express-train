/**
 * 提示词：题卡生成、调研追问、画像合成。
 *
 * 设计依据见 docs/superpowers/specs/2026-10-21-ai-agent-design.md 第 2、6 节：
 * 深层结构（语境、范式、步骤）由代码锁定，模型只写表层情境与答案；
 * 附一张同范式的精选题卡作为质量锚点；用“变化方向”和“回避标题”显式拉开多样性。
 */
import { CHECKS } from "../../public/js/curriculum/checks.js";
import { CONTEXTS, LINES, LINE_WEIGHTS } from "../../public/js/curriculum/contexts.js";
import { CAREER_STAGES, MAX_CHARS_PER_SECOND } from "../../public/js/curriculum/ids.js";
import { PRACTICE_CARDS } from "../../public/js/curriculum/index.js";

/** 每次生成随机选一个变化方向，避免同一语境下的题目越写越像。 */
export const FACETS = Object.freeze([
  "对方很急，只给你很短的时间",
  "对方情绪不太好，带着不满",
  "对方和你第一次见面，彼此不熟",
  "现场有第三方旁听，说话要顾及他们",
  "你手上的信息不完整，有一部分还没确认",
  "对方对你或这件事有误解",
  "对方比你资深很多，气场很强",
  "事情刚刚发生，你几乎没有准备时间",
  "对方正在犹豫，需要你推一把",
  "气氛轻松，但这件事对你很重要",
  "对方很友善，但注意力不在你身上",
  "你之前在这件事上犯过一次错",
]);

export const CARD_SYSTEM_PROMPT = `你是中文表达训练的出题专家，也是经验丰富的沟通教练。你为一个口头表达训练应用编写题卡：一个真实场合里的具体情境，加上这道题在指定表达结构下的最优回答。题卡有两种用途：练习题（学习者限时开口、被打断、回听自查，再对照你写的最优回答），或一课的示范（学习者先读懂情境和示范回答，再模仿复述）。

写作要求：
1. 情境（situation）用第二人称，写清是谁、在什么场合、为什么现在要开口、利害是什么；具体到人物关系和时间压力。人名、机构、数字一律虚构，不引用真实统计数据、新闻或真实人物。
2. 深层结构固定：最优回答（bestAnswer）严格按给定结构的步骤顺序展开，每一句标注所属步骤序号 step（从 0 开始）；第一句的 step 为 0，之后每句的 step 等于上一句或上一句加 1，最后一句是最后一步，每一步至少一句。
3. 最优回答是能直接说出口的口语，句子短、有具体信息，不是书面稿；全部句子的总字数不得超过题目给出的上限。why 用一句话解释这句为什么这样说。
4. stepHints 与步骤一一对应、数量相同，只写这一步往哪个方向说，不写成完整句子。
5. prepGuide.questions 回答三个问题：对方是谁（who）、他此刻最想听什么（wants）、我要他听完做什么（outcome）。whyStructure 用一两句话说明这个场合为什么适合用这个结构。
6. badExample 写新手在这个情境下最常见的说法；problems 至少 3 条，每条指出一个具体问题。
7. study 写 2 到 4 个与情境话题相关、开口前值得查清的知识问题。
8. role、counterpart、tension、mindset 分别写学习者在这个情境里的身份、对象（对方是谁）、这个场合难在哪、对方此刻在想什么，各一到两句。场合骨架里的参考内容是给博士生写的默认版本：学习者画像显示他不是博士生时，不要沿用学术身份和导师、组会等人物，把场合换成他自己的世界里同一类场合（例如“组会进展汇报”对职场人就是周会上的进展汇报），但场合的性质、时长和难点类型不变；画像里没有身份信息时，沿用参考内容。sceneLabel 是改写后的场合名，不超过 12 个字（例如“周会进展汇报”），界面上用它代替语境名；学习者是博士生时可以沿用语境名。
9. personalNote 用一句话告诉学习者为什么出这道题：和画像里哪一点相关；没有可关联的，就说明它练的是哪种能力。
10. 题目要贴近学习者画像，但不得出现画像里“不想练的话题”。不要和“已有题目”雷同。
11. 参考学习者的训练进度出题：给出了“重点考查的步骤”时，情境要让这些步骤不可或缺（不讲就达不成目标），最优回答在这些步骤上写得尤其清楚，whyStructure 点明这一点；可以延续他最近练过的话题或“带走的一句话”，但题目里不要提及他的分数、训练记录或“你上次”。
只输出符合给定结构的 JSON，不要输出其他文字。`;

/** 本题最优回答的字数上限：语速上限 × 时长，留一成余量给停顿。 */
export function answerCharLimit(context) {
  return Math.floor(context.speakSeconds * MAX_CHARS_PER_SECOND * 0.9);
}

/** 质量锚点：同语境同范式的精选题卡优先，其次同范式任意语境。 */
function anchorCard(contextId, paradigmId) {
  return PRACTICE_CARDS.find((card) => card.contextId === contextId && card.paradigmId === paradigmId)
    ?? PRACTICE_CARDS.find((card) => card.paradigmId === paradigmId)
    ?? null;
}

function anchorJson(card) {
  if (!card) return "（无）";
  const { title, situation, goal, prepGuide, bestAnswer, badExample, study } = card;
  return JSON.stringify({ title, situation, goal, prepGuide, bestAnswer, badExample, study }, null, 1);
}

/** 示范的质量锚点：这一课自带的精选示范。 */
function exampleAnchorJson(paradigm) {
  return JSON.stringify({
    situation: paradigm.example.situation,
    tension: paradigm.hard,
    mindset: paradigm.listener,
    whyStructure: paradigm.why,
    bestAnswer: paradigm.model,
    badExample: paradigm.weak,
  }, null, 1);
}

/**
 * 题卡生成的用户提示。
 *
 * @param {object} input context / paradigm / purpose（practice 或 example）/ profile（画像摘要文本）/ training（训练摘要文本）
 *   / focusSteps（重点步骤序号）/ situation / avoidTitles / facet（只用于练习题）/ previousErrors
 * @returns {string} 提示文本
 */
export function buildCardPrompt({ context, paradigm, purpose = "practice", profile, training, focusSteps = [], situation, avoidTitles, facet, previousErrors = [] }) {
  const steps = paradigm.steps.map((step, index) => `  step ${index}「${step.label}」：${step.purpose}（可用句式：${step.phrase}）`).join("\n");
  const isExample = purpose === "example";
  const sections = [
    `## 场合骨架（场合类型、时长固定；身份、对象、难点、对方心态按要求 8 改写）
- 所属：${LINES[context.line].label} · ${context.label}
- 限时 ${context.speakSeconds} 秒；最优回答总字数不超过 ${answerCharLimit(context)} 字
- 参考身份：${context.role}
- 参考对象：${context.counterpart}
- 参考：对方此刻在想什么：${context.mindset}
- 参考：这个场合的难点：${context.tension}`,
    `## 表达结构（固定，最优回答必须按这个顺序）
- ${paradigm.title}：${paradigm.structure}
- 什么时候用：${paradigm.whenToUse}
- 步骤（共 ${paradigm.steps.length} 步，stepHints 也必须是 ${paradigm.steps.length} 条）：
${steps}`,
    isExample ? `## 用途：第 ${paradigm.order} 课「${paradigm.title}」的示范
学习者正在学这个结构，会先读情境和示范回答，再模仿复述。所以：
- 情境选学习者熟悉、利害清楚、难度适中的版本，不加多余的干扰；
- 最优回答是范本，每一步都清楚可辨，第一次读就能看出结构；why 说明这一句怎样完成这一步、为什么有效；
- badExample 写不用这个结构时最典型的说法，problems 指出它缺了哪些步骤；
- personalNote 用一句话说明为什么用这个场景来教这个结构，和学习者画像哪一点相关。` : "",
    `## 学习者画像
${profile || "（学习者还没有填写画像，按语境写一道通用题。）"}`,
    training ? `## 学习者的训练进度
${training}` : "",
    focusSteps.length ? `## 本题重点考查的步骤
学习者在练习中最常漏掉：${focusSteps.map((index) => `step ${index}「${paradigm.steps[index].label}」`).join("、")}。情境要让这些步骤不可或缺。` : "",
    situation ? `## 本题要贴近的真实场合
学习者说他接下来要面对：“${situation}”。把题目写成这个场合或与它高度相似的情境。` : "",
    !isExample && facet ? `## 变化方向
本题的情境加入这个条件：${facet}。` : "",
    avoidTitles.length ? `## 已有题目（不要和它们雷同）
${avoidTitles.map((title) => `- ${title}`).join("\n")}` : "",
    isExample
      ? `## 参考示范（这一课自带的精选示范，只示范质量与格式；场合和时长不同，不要照搬情境，字数以本题上限为准）
${exampleAnchorJson(paradigm)}`
      : `## 参考题卡（同一结构的精选题，只示范质量与格式；语境和时长不同，不要照搬情境，字数以本题上限为准）
${anchorJson(anchorCard(context.id, paradigm.id))}`,
    previousErrors.length ? `## 上一次输出没有通过校验，请修正后重新输出完整 JSON
${previousErrors.map((error) => `- ${error}`).join("\n")}` : "",
    `## 输出\n按给定 JSON 结构输出这道新${isExample ? "示范" : "题卡"}。`,
  ];
  return sections.filter(Boolean).join("\n\n");
}

export const FOLLOWUP_SYSTEM_PROMPT = `你是一个口头表达训练应用的入学访谈员。学习者刚填完一份问卷。你的任务是提出最多 3 个追问，把他“想提高的方面”和“接下来要面对的场合”问得更具体：对方是谁、利害是什么、最近一次类似场合发生了什么、他卡在哪里。
要求：每个问题一句话，能在一两分钟内回答；不重复问卷已经回答清楚的内容；不问健康、收入、家庭关系、政治立场等隐私；不评价学习者。why 用一句话说明这个问题能帮出题贴近他哪一点。
只输出符合给定结构的 JSON。`;

function surveyText(survey) {
  const lines = [
    `- 一句话身份：${survey.identity || "（未填）"}`,
    `- 想提高的方面：${survey.focus.length ? survey.focus.join("；") : "（未选）"}`,
    `- 接下来要面对的场合：${survey.situations.length ? "" : "（未填）"}`,
    ...survey.situations.map((item, index) => `  ${index}. ${item.text}${item.when ? `（${item.when}）` : ""}`),
    `- 自评（1–5 分）：${survey.selfRating.map((item) => `${item.label} ${item.value}`).join("，") || "（未填）"}`,
    `- 题目深浅偏好：${survey.depth === "light" ? "只借用我的领域，不必贴得太近" : "尽量贴近我真实的细节"}`,
    `- 不想练的话题：${survey.avoid || "（无）"}`,
    `- 练习计划：${survey.ifThen || "（未填）"}`,
  ];
  return lines.join("\n");
}

export function buildFollowupPrompt(survey) {
  return `## 学习者问卷\n${surveyText(survey)}\n\n## 输出\n提出最多 3 个追问。`;
}

export const REFLECTION_SYSTEM_PROMPT = `你是一个口头表达训练应用的教练。下面是学习者最近的练习记录：每个回合的题目、用的结构、首轮和重讲时没做到的检查项、重讲时专门改的一项，以及他写下的“带走的一句话”。
你的任务是提炼最多 3 条值得长期记住、能帮助之后出题的观察。
要求：
1. 只写可观察的行为模式，例如反复漏掉的步骤、在哪类场合容易出问题、哪一项已经稳定改善；不评价性格，不做心理推断，不夸奖。
2. 每条观察必须有记录依据：evidence 用一句话说明依据（例如“最近 5 回合中 3 次首轮漏掉‘已做动作’”），依据必须能在记录里找到。
3. 不要重复“已有记忆”里已经写过的内容；已有记忆被记录推翻时，可以写一条更新后的观察。“学习者否定过的观察”是他明确不认同的，不要再提出相同或意思相近的观察。
4. text 每条一句话、不超过 40 字；没有足够可靠的观察时返回空数组。
只输出符合给定结构的 JSON。`;

/** 重讲专门改的一项：首轮没做到时看改没改过来；首轮已做到（全部做到时默认选“接住打断”）时看有没有保持。 */
function focusResult(item) {
  const missedSecond = item.missedSecond.includes(item.focus);
  if (item.missedFirst.includes(item.focus)) return missedSecond ? "没改过来" : "已改过来";
  return missedSecond ? "首轮已做到，重讲反而没做到" : "首轮已做到，重讲保持";
}

/**
 * 练习观察的用户提示。
 *
 * @param {{ profile: string, training: string, log: object[], facts: string[], dismissed?: string[] }} input
 *   画像摘要、训练摘要、最近回合、已有记忆（含待确认）、学习者忽略或删除过的观察
 * @returns {string} 提示文本
 */
export function buildReflectionPrompt({ profile, training, log, facts, dismissed = [] }) {
  const records = log.map((item, index) => [
    `${index + 1}. ${item.date} ${item.title}（${item.context} · ${item.structure}）`,
    `   首轮没做到：${item.missedFirst.length ? item.missedFirst.join("、") : "无"}`,
    `   重讲后仍没做到：${item.missedSecond.length ? item.missedSecond.join("、") : "无"}`,
    item.focus ? `   重讲专门改：${item.focus}（${focusResult(item)}）` : "",
    item.takeaway ? `   带走的一句话：${item.takeaway}` : "",
  ].filter(Boolean).join("\n")).join("\n");
  return [
    profile ? `## 学习者画像\n${profile}` : "",
    training ? `## 训练进度\n${training}` : "",
    `## 已有记忆\n${facts.length ? facts.map((fact) => `- ${fact}`).join("\n") : "（无）"}`,
    dismissed.length ? `## 学习者否定过的观察（不要再提出相同或意思相近的）\n${dismissed.map((item) => `- ${item}`).join("\n")}` : "",
    `## 最近的练习记录（从新到旧）\n${records || "（无）"}`,
    "## 输出\n按给定 JSON 结构输出最多 3 条观察。",
  ].filter(Boolean).join("\n\n");
}

export const PROFILE_SYSTEM_PROMPT =`你是一个口头表达训练应用的教练。根据学习者的问卷和追问回答，整理一份学习者画像，供之后按画像出题。
要求：
1. summary：不超过 150 字，写他是谁、想练什么、接下来要面对什么场合、卡在哪里。只依据学习者说过的内容，不推测，不夸奖。
2. facts：最多 8 条，每条一句话，是出题时值得记住的具体事实（例如场合、对象、常见卡点、不想碰的话题）。
3. situationContexts：把问卷里每个场合（按序号 index）映射到下方语境清单中最接近的一个语境 contextId；实在不对应的场合不要映射。
4. focusChecks：从下方检查项清单中选最多 3 个，最能对应他想提高的方面。
5. ifThen：把他的练习计划整理成“如果……，我就……”一句话；他没写时，按他的情况建议一句。
6. careerStage：按他的身份和接下来要面对的场合，从下方“阶段与出题比例”中选最贴近的一档；它决定四条线的出题比例。
只输出符合给定结构的 JSON。`;

/** 三档阶段的含义与对应的四条线出题比例，供模型判断 careerStage。 */
const STAGE_GUIDE = Object.freeze({
  phd: "在读学生或科研人员，主要面对导师、组会、答辩和学术会议",
  bridge: "正从学业或科研走向产业、求职或创业，主要面对访谈、合作、比赛和合伙人",
  founder: "已经工作或在创业，主要面对团队、客户、投资人和公开场合",
});

function stageGuideText() {
  return CAREER_STAGES.map((id) => {
    const weights = Object.entries(LINE_WEIGHTS[id]).map(([line, weight]) => `${LINES[line].label} ${weight}%`).join("、");
    return `${id}：${STAGE_GUIDE[id]}（${weights}）`;
  }).join("\n");
}

export function buildProfilePrompt(survey, followups) {
  const contextList = CONTEXTS.map((context) => `${context.id} ${LINES[context.line].label} · ${context.label}`).join("\n");
  const checkList = Object.entries(CHECKS).map(([id, check]) => `${id} ${check.label}：${check.question}`).join("\n");
  const answered = followups.filter((item) => item.answer);
  return [
    `## 学习者问卷\n${surveyText(survey)}`,
    answered.length ? `## 追问与回答\n${answered.map((item) => `- 问：${item.question}\n  答：${item.answer}`).join("\n")}` : "",
    `## 阶段与出题比例\n${stageGuideText()}`,
    `## 语境清单\n${contextList}`,
    `## 检查项清单\n${checkList}`,
    "## 输出\n按给定 JSON 结构输出画像。",
  ].filter(Boolean).join("\n\n");
}
