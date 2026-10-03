/**
 * 实战场景库：真实高频表达场景 × 行业画像 = 实战卡。
 *
 * 设计依据：
 * - 检查项全部是“回听时能回答是/否”的可观察行为，而非 1–5 分的笼统自评；
 * - 压力事件在讲到一半时插入（打断）或在重讲前揭晓（追问），模拟真实应变；
 * - 每类场景只考核 4–5 项最关键的行为，避免一次关注过多。
 */
import { INDUSTRIES } from "./industries.js";

export const ARENA_VERSION = "2026.10.03-1";

export const FAMILIES = Object.freeze({
  upward: { label: "向上沟通", description: "汇报、争取资源、坏消息与被质疑" },
  team: { label: "协作管理", description: "跨部门推进、拒绝、给反馈" },
  client: { label: "客户商务", description: "投诉、价值陈述、谈判、向外行解释" },
  career: { label: "求职呈现", description: "面试与场合化自我介绍" },
  impromptu: { label: "即兴社交", description: "被点名、致辞、饭局上被问看法" },
  insight: { label: "行业洞察", description: "讲清一个行业、判断一个趋势" },
});

export const CHECKS = Object.freeze({
  conclusion_early: { label: "结论先行", question: "开口 15 秒内，对方已经知道你的结论、请求或立场", tip: "第一句话就给结论：“结论是……，原因有两点。”" },
  one_thread: { label: "一条主线", question: "全程围绕一条主线，没有临时岔开或越讲越散", tip: "开头说“我只讲一件事”，岔开时用“回到刚才”拉回来。" },
  concrete: { label: "具体可感", question: "至少出现一个具体事实、数字、例子或画面", tip: "把“很多”“明显”换成一个具体数字、时间、人或场景。" },
  fact_vs_guess: { label: "事实与推测分开", question: "已确认的事实、你的判断和未知信息是分开说的", tip: "用三段式：“已确认的是……；我的判断是……；还不确定的是……”" },
  audience_fit: { label: "对方听得懂", question: "用的是对方关心、听得懂的话，没有堆术语", tip: "每个术语后面紧跟一句“简单说就是……”。" },
  ask_clear: { label: "下一步明确", question: "结尾有明确的下一步：谁、做什么、什么时候", tip: "最后一句固定成：“我建议……，需要你……，我会在……之前……”" },
  handled_pressure: { label: "接住打断", question: "被打断或追问时，先正面回应，再回到主线", tip: "先用一句话直接回答，再说“回到刚才……”。" },
  no_overrun: { label: "按时收住", question: "在规定时间内主动收尾，没有被时间截断", tip: "时间过半时只保留最重要的一点，主动说“最后一点”。" },
  composure: { label: "稳住节奏", question: "卡壳、口头禅没有打断理解（回放中明显卡顿不超过 3 次）", tip: "想不出词时停半秒，不要用“然后、就是、那个”填空。" },
  empathy_first: { label: "先接情绪", question: "先确认了对方的处境或情绪，再讲方案", tip: "先复述：“你的意思是……，这确实……”，然后再说下一步。" },
  tradeoff: { label: "讲出代价", question: "说出了代价、风险或取舍，而不是只讲好处", tip: "补一句：“代价是……，我们用……来控制它。”" },
  ownership: { label: "承担责任", question: "说清了自己的责任和动作，没有甩锅或泛泛而谈", tip: "用“我做了 / 我没做到 / 我接下来会”，少用“大家”“相关部门”。" },
  counterpart_value: { label: "从对方出发", question: "从对方的目标或收益讲起，而不只讲自己的需要", tip: "开场先说：“这能帮你解决……”" },
  question_back: { label: "把话轮交回", question: "抛出一个具体问题，推动对方回应", tip: "结尾问一个具体问题：“你更在意 A 还是 B？”" },
  story_specific: { label: "故事有细节", question: "讲的是一个具体瞬间：时间、场景和你的动作，而不是概括", tip: "按“那天……我……结果……”讲一个画面。" },
  signpost: { label: "层次可辨", question: "听众能听出你讲了几点、正讲到第几点", tip: "开头预告“三点”，每点前说“第一 / 第二 / 最后”。" },
  no_defensive: { label: "不急于辩解", question: "面对质疑先承认合理部分，没有急着反驳", tip: "先说“这个问题问得对，我们确实……”，再给证据。" },
  own_view: { label: "有自己的判断", question: "给出了明确的个人判断，而不是只罗列各方观点", tip: "直接说“我的判断是……，因为……”，可以附带条件。" },
  alternative: { label: "给出替代", question: "说“不”的同时，给出了一个可行的替代方案", tip: "“这个我做不了，但我可以……”" },
  no_overpromise: { label: "不乱承诺", question: "没有当场承诺自己控制不了的事", tip: "只承诺你能控制的：“我今天下午五点前给你答复。”" },
});

export const PRESSURES = Object.freeze({
  get_to_point: "对方打断：“说重点，你需要我做什么？”",
  time_cut: "对方看了眼手表：“我只剩 20 秒了。”",
  data_source: "对方打断：“这个数字哪来的？你确定吗？”",
  impatient: "对方皱眉：“这个上次不是说过了吗？”",
  jargon_check: "有人插话：“等一下，你说的那个词是什么意思？”",
  own_view: "对方追问：“别讲官方说法，你自己怎么看？”",
  competitor: "对方反问：“那为什么不直接学竞争对手的做法？”",
  worst_case: "对方追问：“如果失败了，最坏的情况是什么？”",
  half_budget: "对方：“只能给你一半，你怎么做？”",
  emotional: "对方提高音量：“你们每次都这么说！”",
  silence: "对方没有回应，只是看着你，等你继续。",
  why_you: "对方问：“为什么这件事应该由你来做？”",
  example: "对方：“能举一个具体例子吗？”",
  so_what: "对方：“所以呢？这跟我有什么关系？”",
  last_time: "对方：“上次你们也是这么承诺的。”",
  lowball: "对方：“这已经是最低价了，不行就算了。”",
  blame: "对方追问：“这到底是谁的责任？”",
  deadline: "对方：“我今天下班前就要一个答复。”",
});

function scenario(id, definition) {
  return Object.freeze({ id, ...definition });
}

/** 场景原型：build(行业, 另一个行业) 返回该行业下的具体情境。 */
export const SCENARIOS = Object.freeze([
  scenario("elevator", {
    family: "upward",
    label: "电梯汇报",
    difficulty: 1,
    prepSeconds: 10,
    speakSeconds: 30,
    checks: ["conclusion_early", "concrete", "ask_clear", "no_overrun"],
    interrupts: ["get_to_point", "time_cut"],
    followups: ["worst_case", "why_you", "data_source"],
    build: (x) => ({
      title: `电梯里，${x.boss}问起${x.project}`,
      situation: `你是${x.org}的${x.role}。电梯里偶遇${x.boss}，对方随口问：“${x.project}最近怎么样？”电梯只有 30 秒。`,
      counterpart: x.boss,
      goal: "让对方在 30 秒内知道进展、风险和你需要的一个支持。",
    }),
    cognition: (x) => [`${x.project}这类工作，${x.boss}最关心的是进度、成本还是风险？`, "如果只能报一个数字来说明进展，你会报哪个？为什么是它？"],
  }),
  scenario("bad_news", {
    family: "upward",
    label: "坏消息汇报",
    difficulty: 2,
    prepSeconds: 30,
    speakSeconds: 90,
    checks: ["conclusion_early", "fact_vs_guess", "ownership", "ask_clear", "handled_pressure"],
    interrupts: ["blame", "impatient", "data_source"],
    followups: ["worst_case", "last_time", "deadline"],
    build: (x) => ({
      title: `向${x.boss}汇报：${x.badNews}`,
      situation: `你是${x.org}的${x.role}。刚刚确认：${x.badNews}。你必须马上向${x.boss}当面汇报。`,
      counterpart: x.boss,
      goal: "先讲事实与影响，再讲你已经做了什么、还需要什么决定。",
    }),
    cognition: (x) => [`在${x.label}行业，“${x.badNews}”通常会带来哪些连锁影响（客户、成本、口碑）？`, "这类问题行业里常见的补救方案和止损动作有哪些？"],
  }),
  scenario("resource_ask", {
    family: "upward",
    label: "争取资源",
    difficulty: 2,
    prepSeconds: 30,
    speakSeconds: 90,
    checks: ["conclusion_early", "counterpart_value", "tradeoff", "ask_clear", "handled_pressure"],
    interrupts: ["half_budget", "so_what", "competitor"],
    followups: ["half_budget", "worst_case", "why_you"],
    build: (x) => ({
      title: `向${x.boss}争取：${x.resourceAsk}`,
      situation: `你是${x.org}的${x.role}。你想向${x.boss}争取：${x.resourceAsk}。公司最近在控制成本。`,
      counterpart: x.boss,
      goal: "用对方关心的收益和可控的代价，换来一个明确的批准或试行。",
    }),
    cognition: (x) => [`这项投入会影响哪个经营指标？「${x.metrics[0]}」「${x.metrics[1]}」中哪个最相关？`, "如果只给一半资源，你的最小可行方案是什么？"],
  }),
  scenario("challenged", {
    family: "upward",
    label: "会上被质疑",
    difficulty: 3,
    prepSeconds: 15,
    speakSeconds: 75,
    checks: ["no_defensive", "fact_vs_guess", "handled_pressure", "one_thread"],
    interrupts: ["data_source", "emotional", "blame"],
    followups: ["data_source", "competitor", "own_view"],
    build: (x) => ({
      title: `周会上，「${x.metrics[0]}」的结论被当众质疑`,
      situation: `你是${x.org}的${x.role}。周会上你刚说完「${x.metrics[0]}」有改善，${x.peer}的负责人当众说：“这个改善是你们做的，还是本来就会自然波动？”所有人都看着你。`,
      counterpart: `${x.peer}的负责人和在场同事`,
      goal: "承认质疑中合理的部分，拿出能分辨原因的证据，并提出验证方法。",
    }),
    cognition: (x) => [`「${x.metrics[0]}」通常受哪些外部因素影响（季节、价格、渠道）？`, "要证明改善来自你的动作，需要什么样的对比（前后、对照组、分渠道）？"],
  }),
  scenario("cross_team", {
    family: "team",
    label: "跨部门推进",
    difficulty: 2,
    prepSeconds: 30,
    speakSeconds: 90,
    checks: ["counterpart_value", "concrete", "ask_clear", "question_back"],
    interrupts: ["so_what", "impatient", "why_you"],
    followups: ["deadline", "half_budget", "last_time"],
    build: (x) => ({
      title: `请${x.peer}配合：${x.crossAsk}`,
      situation: `你是${x.org}的${x.role}。你需要${x.peer}配合：${x.crossAsk}。对方这个季度也很忙，而且不归你管。`,
      counterpart: `${x.peer}的负责人`,
      goal: "让对方看到对他们也有好处，并约定一个具体的配合动作和时间。",
    }),
    cognition: (x) => [`${x.peer}的考核指标可能是什么？你的请求会让它变好还是变差？`, "有没有一个让对方成本更低的折中做法？"],
  }),
  scenario("feedback", {
    family: "team",
    label: "给出批评反馈",
    difficulty: 3,
    prepSeconds: 30,
    speakSeconds: 90,
    checks: ["concrete", "empathy_first", "question_back", "ask_clear"],
    interrupts: ["emotional", "blame", "silence"],
    followups: ["example", "last_time", "own_view"],
    build: (x) => ({
      title: `和${x.team}的一位老员工谈交付问题`,
      situation: `你是${x.org}的${x.role}。${x.team}里一位资历比你老的同事，最近三次都没有按约定时间交付，影响了${x.project}。你要和 TA 单独谈一次。`,
      counterpart: "资深同事",
      goal: "讲具体行为和影响而不是评价人，听到对方的原因，并共同约定改进动作。",
    }),
    cognition: () => ["“行为—影响—期望”式反馈怎么说？哪些词会让对方觉得被评价人格？", "资深员工延误通常有哪些真实原因（负担、分工、不认同目标）？"],
  }),
  scenario("refuse", {
    family: "team",
    label: "拒绝一个请求",
    difficulty: 2,
    prepSeconds: 20,
    speakSeconds: 60,
    checks: ["conclusion_early", "tradeoff", "alternative", "no_overpromise"],
    interrupts: ["deadline", "why_you", "impatient"],
    followups: ["half_budget", "deadline", "last_time"],
    build: (x) => ({
      title: `${x.boss}临时要你${x.refuseRequest}`,
      situation: `你是${x.org}的${x.role}。${x.boss}临时要你${x.refuseRequest}。你判断这件事要么做不到，要么会带来明显风险。`,
      counterpart: x.boss,
      goal: "明确说出不能照做，讲清代价，并提出一个你能负责的替代方案。",
    }),
    cognition: (x) => [`${x.refuseRequest}——这件事在${x.label}行业可能触碰哪些风险（质量、合规、口碑、员工）？`, "什么样的替代方案既能回应对方的真实目的，又在你的能力范围内？"],
  }),
  scenario("complaint", {
    family: "client",
    label: "客户投诉",
    difficulty: 2,
    prepSeconds: 15,
    speakSeconds: 90,
    checks: ["empathy_first", "fact_vs_guess", "no_overpromise", "ask_clear"],
    interrupts: ["emotional", "last_time", "blame"],
    followups: ["deadline", "emotional", "worst_case"],
    build: (x) => ({
      title: `${x.client}当面投诉`,
      situation: `你是${x.org}的${x.role}。${x.client}找到你，情绪很激动：${x.complaint}。事实还没有查清。`,
      counterpart: x.client,
      goal: "先接住情绪，说清你已知和未知的部分，给出一个有时间点的处理承诺。",
    }),
    cognition: (x) => [`${x.label}行业处理这类投诉的常见流程和赔付惯例是什么？`, "在事实没查清前，哪些话不能说（承认责任、承诺赔偿金额）？"],
  }),
  scenario("pitch", {
    family: "client",
    label: "45 秒价值陈述",
    difficulty: 1,
    prepSeconds: 15,
    speakSeconds: 45,
    checks: ["counterpart_value", "concrete", "audience_fit", "question_back"],
    interrupts: ["so_what", "competitor", "time_cut"],
    followups: ["competitor", "example", "data_source"],
    build: (x) => ({
      title: `向${x.buyer}介绍${x.product}`,
      situation: `你是${x.org}的${x.role}。一次行业活动上，你遇到了${x.buyer}。对方只给你 45 秒：“说说你们的${x.product}？”`,
      counterpart: x.buyer,
      goal: "从对方的痛点讲起，用一个具体例子说明价值，最后约到下一次沟通。",
    }),
    cognition: (x) => [`${x.buyer}的日常痛点和采购决策标准可能是什么？`, `和竞争对手相比，${x.product}真正不同的一点是什么？`],
  }),
  scenario("negotiation", {
    family: "client",
    label: "议价谈判",
    difficulty: 3,
    prepSeconds: 30,
    speakSeconds: 90,
    checks: ["counterpart_value", "tradeoff", "handled_pressure", "ask_clear"],
    interrupts: ["lowball", "silence", "competitor"],
    followups: ["lowball", "deadline", "half_budget"],
    build: (x) => ({
      title: `与${x.supplier}谈${x.negotiation}`,
      situation: `你是${x.org}的${x.role}，正在和${x.supplier}谈${x.negotiation}。对方一开口就给了一个你无法接受的条件。`,
      counterpart: x.supplier,
      goal: "不直接压价，而是用条件交换条件（量、账期、长期合作）推进到可接受区间。",
    }),
    cognition: (x) => [`${x.supplier}的成本结构和利润压力大致在哪里？`, "除了价格，还有哪些可以交换的条件（账期、订单量、合作期限、付款方式）？"],
  }),
  scenario("explain_outsider", {
    family: "client",
    label: "向外行讲清行业",
    difficulty: 1,
    prepSeconds: 20,
    speakSeconds: 90,
    checks: ["audience_fit", "concrete", "one_thread", "signpost"],
    interrupts: ["jargon_check", "example", "so_what"],
    followups: ["jargon_check", "own_view", "example"],
    build: (x) => ({
      title: `亲戚问：${x.short}到底怎么赚钱？`,
      situation: `你在${x.org}做${x.role}。家庭聚会上，一位完全不了解这个行业的长辈问：“你们${x.short}到底是怎么赚钱的？”`,
      counterpart: "不了解行业的长辈",
      goal: "用一个生活化的例子讲清钱从哪里来、花到哪里去，不使用行业黑话。",
    }),
    coversMoney: true,
    cognition: (x) => [`${x.label}的收入从哪里来？最大的一笔成本是什么？`, `「${x.jargon[0]}」「${x.jargon[1]}」用一句大白话怎么解释？`],
  }),
  scenario("interview_story", {
    family: "career",
    label: "面试行为题",
    difficulty: 2,
    prepSeconds: 30,
    speakSeconds: 120,
    checks: ["conclusion_early", "story_specific", "ownership", "concrete"],
    interrupts: ["example", "why_you", "own_view"],
    followups: ["example", "worst_case", "own_view"],
    build: (x) => ({
      title: `面试${x.role}：讲一次你搞砸后补救的经历`,
      situation: `你在面试${x.org}的${x.role}岗位。面试官说：“讲一次你把事情搞砸、后来又补救回来的经历。”可以用真实经历；没有相关经历时，明确说明是在讲另一类经历或假设。`,
      counterpart: "面试官",
      goal: "用一个具体经历讲清你的动作和结果，并说明这对这个岗位意味着什么。",
    }),
    cognition: (x) => [`${x.role}这个岗位最看重哪三种能力？`, "你的经历里，哪一个可以被核实的结果或反馈能证明你的补救？"],
  }),
  scenario("interview_trend", {
    family: "career",
    label: "面试行业题",
    difficulty: 3,
    prepSeconds: 20,
    speakSeconds: 90,
    checks: ["conclusion_early", "own_view", "fact_vs_guess", "tradeoff"],
    interrupts: ["own_view", "data_source", "so_what"],
    followups: ["competitor", "own_view", "worst_case"],
    build: (x) => ({
      title: `面试官问：你怎么看${x.trends[0]}？`,
      situation: `你在面试${x.org}的${x.role}岗位。面试官问：“你怎么看${x.trends[0]}？这对我们公司意味着什么？”`,
      counterpart: "面试官",
      goal: "先给判断，再讲依据和不确定性，最后落到你入职后会怎么做。",
    }),
    cognition: (x) => [`“${x.trends[0]}”的来龙去脉是什么？最近有哪些可靠报道或数据？`, `这个变化对${x.org}这类公司，是机会更多还是压力更多？`],
  }),
  scenario("self_intro", {
    family: "career",
    label: "场合化自我介绍",
    difficulty: 1,
    prepSeconds: 15,
    speakSeconds: 40,
    checks: ["audience_fit", "concrete", "question_back", "no_overrun"],
    interrupts: ["time_cut", "so_what"],
    followups: ["why_you", "example", "own_view"],
    build: (x) => ({
      title: `${x.short}行业交流会上做 40 秒自我介绍`,
      situation: `你以${x.org}${x.role}的身份参加一场${x.short}行业交流会。主持人请每人用 40 秒介绍自己，台下有潜在合作方。`,
      counterpart: "在场的同行和潜在合作方",
      goal: "让别人记住你的一个具体标签，并知道什么情况下来找你。",
    }),
    cognition: (x) => [`在场的${x.short}同行最可能对你的哪段经验感兴趣？`, "你能帮别人解决的一个具体问题是什么？能用一个真实例子说明吗？"],
  }),
  scenario("called_on", {
    family: "impromptu",
    label: "临时被点名",
    difficulty: 2,
    prepSeconds: 5,
    speakSeconds: 60,
    checks: ["conclusion_early", "one_thread", "concrete", "no_overrun"],
    interrupts: ["own_view", "example", "time_cut"],
    followups: ["competitor", "own_view", "data_source"],
    build: (x) => ({
      title: `被主持人点名谈：${x.trends[1]}`,
      situation: `一场行业沙龙上，主持人突然点到你：“你在${x.short}一线，怎么看${x.trends[1]}？”你只有 5 秒反应时间。`,
      counterpart: "沙龙现场的听众",
      goal: "先给一个判断，用一个一线观察支撑，在一分钟内收住。",
    }),
    cognition: (x) => [`“${x.trends[1]}”目前有哪些被广泛讨论的事实和争议？`, "你作为一线从业者，能给出哪个别人不知道的观察？"],
  }),
  scenario("toast", {
    family: "impromptu",
    label: "即兴致辞",
    difficulty: 1,
    prepSeconds: 15,
    speakSeconds: 60,
    checks: ["audience_fit", "story_specific", "one_thread", "no_overrun"],
    interrupts: ["time_cut", "silence"],
    followups: ["example", "time_cut"],
    build: (x) => ({
      title: `年会上代表${x.team}说几句`,
      situation: `${x.org}的年会上，领导临时请你代表${x.team}说几句。台下有同事、领导和家属。`,
      counterpart: "年会现场的同事和领导",
      goal: "用一个具体的团队瞬间串起感谢和期待，一分钟内温暖收尾。",
    }),
    cognition: (x) => [`这一年${x.team}最值得被记住的一件具体的事是什么？`, "致辞里感谢谁、怎么感谢，才不像套话？"],
  }),
  scenario("dinner_view", {
    family: "impromptu",
    label: "饭局上被问看法",
    difficulty: 2,
    prepSeconds: 10,
    speakSeconds: 60,
    checks: ["no_defensive", "fact_vs_guess", "own_view", "question_back"],
    interrupts: ["emotional", "data_source", "own_view"],
    followups: ["competitor", "own_view", "example"],
    build: (x, other) => ({
      title: `饭局上有人说：${x.short}这几年是不是不行了？`,
      situation: `你在${x.org}工作。饭局上，一位在${other.label}行业工作的朋友半开玩笑地说：“${x.short}这几年是不是不行了？”桌上的人都看向你。`,
      counterpart: `在${other.label}行业工作的朋友`,
      goal: "不辩护也不附和，给出有依据的判断，并把话题变成双方都能聊的交流。",
    }),
    cognition: (x, other) => [`${x.label}最近几年真实的变化有哪些？哪些是被夸大的印象？`, `${other.label}和${x.label}有没有可以类比的地方，能让对方听懂？`],
  }),
  scenario("industry_brief", {
    family: "insight",
    label: "两分钟行业速评",
    difficulty: 2,
    prepSeconds: 30,
    speakSeconds: 120,
    checks: ["signpost", "concrete", "fact_vs_guess", "own_view"],
    interrupts: ["data_source", "jargon_check", "so_what"],
    followups: ["competitor", "worst_case", "data_source"],
    build: (x) => ({
      title: `两分钟讲清${x.label}这门生意`,
      situation: `明天你要见一位${x.label}行业的资深从业者。今天先给自己录一段两分钟速评：这个行业怎么赚钱、最大的成本在哪、现在最大的变量是什么。`,
      counterpart: "一位资深从业者",
      goal: "三点讲清商业模式、成本结构和关键变量，并给出你自己的一个判断。",
    }),
    coversMoney: true,
    cognition: (x) => [`查一家${x.label}上市公司的年报“经营情况讨论与分析”，它的收入和成本分别由什么构成？`, `「${x.metrics[0]}」「${x.metrics[1]}」「${x.metrics[2]}」各自怎么计算？行业里什么水平算好？`],
  }),
  scenario("trend_judgment", {
    family: "insight",
    label: "趋势判断",
    difficulty: 3,
    prepSeconds: 30,
    speakSeconds: 90,
    checks: ["conclusion_early", "own_view", "tradeoff", "fact_vs_guess"],
    interrupts: ["competitor", "data_source", "worst_case"],
    followups: ["own_view", "worst_case", "so_what"],
    build: (x) => ({
      title: `判断：${x.trends[1]}`,
      situation: `${x.boss}请你在下周的经营会上，用一分半钟讲讲你对“${x.trends[1]}”的判断，以及${x.org}应该怎么应对。`,
      counterpart: x.boss,
      goal: "给出明确判断，讲清对客户和公司的不同影响，提出一个可以先试的动作。",
    }),
    cognition: (x) => [`“${x.trends[1]}”背后的驱动因素是什么？有哪些可靠来源可以核实？`, `它对${x.client}和对${x.org}的影响有什么不同？`],
  }),
]);

export const SCENARIO_MAP = new Map(SCENARIOS.map((item) => [item.id, item]));

/** 所有场景共用的“认知补课”问题。 */
export function commonCognitionPrompts(industryProfile, { coversMoney = false } = {}) {
  const prompts = ["刚才哪一句你说得最含糊、最没底？把它查清楚，变成一句确定的话。"];
  return coversMoney ? prompts : [`${industryProfile.label}的钱主要从哪里来？最大的一笔成本是什么？`, ...prompts];
}

/** 检索线索：优先一手资料（年报、招股书、行业协会），而非二手观点。 */
export function searchHints(industryProfile) {
  return [
    `${industryProfile.label} 上市公司 年报 经营情况讨论与分析`,
    `${industryProfile.metrics[0]} 计算方法 行业水平`,
    `${industryProfile.trends[0]} 分析`,
  ];
}

function buildCard(definition, industryProfile, index) {
  const other = INDUSTRIES[(index + 7) % INDUSTRIES.length];
  const built = definition.build(industryProfile, other);
  return Object.freeze({
    id: `${definition.id}--${industryProfile.id}`,
    version: ARENA_VERSION,
    status: "active",
    scenarioId: definition.id,
    industryId: industryProfile.id,
    otherIndustryId: other.id,
    family: definition.family,
    familyLabel: FAMILIES[definition.family].label,
    // 轮盘组件沿用 scene / sceneLabel / topicLabel 字段名
    scene: definition.family,
    sceneLabel: definition.label,
    topicLabel: industryProfile.label,
    scenarioLabel: definition.label,
    industryLabel: industryProfile.label,
    difficulty: definition.difficulty,
    prepSeconds: definition.prepSeconds,
    speakSeconds: definition.speakSeconds,
    checks: Object.freeze([...definition.checks]),
    interrupts: Object.freeze([...definition.interrupts]),
    followups: Object.freeze([...definition.followups]),
    title: built.title,
    situation: built.situation,
    counterpart: built.counterpart,
    goal: built.goal,
    cognitionPrompts: Object.freeze([...definition.cognition(industryProfile, other), ...commonCognitionPrompts(industryProfile, { coversMoney: Boolean(definition.coversMoney) })]),
    searchHints: Object.freeze(searchHints(industryProfile)),
  });
}

export const ARENA_CARDS = Object.freeze(
  SCENARIOS.flatMap((definition) => INDUSTRIES.map((industryProfile, index) => buildCard(definition, industryProfile, index))),
);

export const ARENA_CARD_MAP = new Map(ARENA_CARDS.map((card) => [card.id, card]));
