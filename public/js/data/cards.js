import { ADDITIONAL_CARD_SEEDS } from "./card-additions.js";

export const CARD_BANK_VERSION = "2026.09.16-1";

export const DOMAINS = Object.freeze({
  personal_life: { label: "个人生活", color: "#d65f45" },
  psychology_behavior: { label: "心理与行为", color: "#8a5a9b" },
  relationships: { label: "人际与关系", color: "#c64f72" },
  workplace_organization: { label: "职场与组织", color: "#346da6" },
  business_entrepreneurship: { label: "商业与创业", color: "#15766f" },
  economics_finance: { label: "经济与金融", color: "#9a6a16" },
  technology_ai: { label: "科技与 AI", color: "#4868b1" },
  society_public: { label: "社会与公共议题", color: "#397b51" },
  culture_media: { label: "文化与媒介", color: "#a54e87" },
  science_nature: { label: "科学与自然", color: "#228094" },
  history_civilization: { label: "历史与文明", color: "#8c6048" },
  philosophy_values: { label: "哲学与价值判断", color: "#5e6177" },
});

export const PROTOCOLS = Object.freeze({
  research_expression: {
    label: "研究表达",
    description: "自主检索、辨别来源、整理观点、首次表达、复盘并重讲。",
    stageMinutes: { research: 15, organize: 10, firstDelivery: 3, review: 5, retry: 3 },
  },
  impromptu_expression: {
    label: "临场表达",
    description: "快速审题、关键词提纲、限时表达、自评并立即重讲。",
    stageMinutes: { research: 1, organize: 1, firstDelivery: 2, review: 3, retry: 2 },
  },
  interactive_communication: {
    label: "互动沟通",
    description: "理解人物立场与阻力，完成多轮回应，复盘路径并重答关键轮次。",
    stageMinutes: { research: 1, organize: 2, firstDelivery: 6, review: 5, retry: 2 },
  },
  formal_task: {
    label: "正式任务",
    description: "阅读模拟背景、整理事实和方案、正式汇报、复盘追问并修订重讲。",
    stageMinutes: { research: 5, organize: 8, firstDelivery: 3, review: 5, retry: 3 },
  },
});

export const TASK_TYPES = Object.freeze({
  concept_explanation: "概念解释",
  mechanism_explanation: "机制解释",
  method_teaching: "方法教学",
  viewpoint_argument: "观点论证",
  comparison: "双方比较",
  case_story: "案例讲述",
  experience_story: "经历叙述",
  problem_report: "问题汇报",
  proposal: "方案提议",
  persuasion_action: "劝说行动",
  objection_handling: "异议处理",
  interview_response: "面试作答",
  dialogue_response: "对话回应",
  facilitation: "主持与串联",
  retrospective: "复盘总结",
});

export const METRICS = Object.freeze({
  clarity: { label: "清晰", description: "听众能否复述本轮主旨。", general: true },
  structure: { label: "结构", description: "各部分是否有清楚次序和连接。", general: true },
  accuracy: { label: "准确", description: "事实、概念和不确定性是否表达恰当。", general: true },
  concision: { label: "简洁", description: "内容是否直接服务任务目的。", general: true },
  fluency: { label: "流畅", description: "停顿和修正是否影响理解。", general: true },
  time_control: { label: "时间控制", description: "是否在目标时长附近完整收束。", general: true },
  audience_awareness: { label: "受众意识", description: "语言和信息量是否适合目标听众。", general: true },
  prompt_comprehension: { label: "审题", description: "是否回答了题目真正要求。" },
  main_thread: { label: "主线", description: "是否始终围绕一个核心判断。" },
  completeness: { label: "完整性", description: "是否有开头、展开和收束。" },
  listener_awareness: { label: "听众关系", description: "是否建立与现场听众的关系。" },
  rhythm: { label: "节奏", description: "重点、停顿和段落推进是否自然。" },
  engagement: { label: "感染力", description: "素材与表达是否促使听众继续听。" },
  closing: { label: "收束", description: "结尾是否回到主旨或行动。" },
  listening: { label: "倾听", description: "回应是否体现已接住对方信息。" },
  relevance: { label: "回应相关性", description: "每轮回应是否紧扣对方刚说的内容。" },
  turn_balance: { label: "轮次平衡", description: "提问、分享和留白是否平衡。" },
  boundaries: { label: "边界感", description: "是否尊重隐私、选择和退出空间。" },
  plain_language: { label: "通俗", description: "专有概念是否能用自己的话解释。" },
  example_fit: { label: "例子匹配", description: "例子是否真正说明概念或机制。" },
  limitation_awareness: { label: "边界意识", description: "是否说明适用条件和不确定性。" },
  claim_clarity: { label: "论点清晰", description: "主张是否可辨认、可讨论。" },
  evidence_quality: { label: "证据质量", description: "证据是否可靠且能支持主张。" },
  counterargument: { label: "反例处理", description: "是否公平呈现并回应反方。" },
  conclusion_first: { label: "结论先行", description: "听众是否能尽早知道核心信息。" },
  data_awareness: { label: "数据意识", description: "事实、估计和未知是否分开。" },
  action_clarity: { label: "行动明确", description: "责任、时间和下一步是否清楚。" },
  followup_response: { label: "追问应对", description: "是否直接回应风险和关键疑问。" },
  counterpart_perspective: { label: "对方视角", description: "是否理解对方目标和处境。" },
  resistance_identification: { label: "阻力识别", description: "是否找到了真实顾虑而非臆测。" },
  non_coercion: { label: "非强迫性", description: "是否保留对方选择权和退出条件。" },
  action_conversion: { label: "行动转化", description: "是否提出低成本、可验证的小行动。" },
  opening_relevance: { label: "开头相关性", description: "前段是否让目标观众知道为何值得听。" },
  spoken_style: { label: "口语化", description: "是否避免书面长句和朗读感。" },
  information_density: { label: "信息密度", description: "信息量是否适合短时长。" },
  camera_presence: { label: "镜头感", description: "表达是否面向一个具体观看者。" },
  ending: { label: "结尾", description: "是否有清楚的行动、问题或回扣。" },
  naturalness: { label: "自然感", description: "探索过程是否真实而非背稿。" },
  transitions: { label: "过渡", description: "话题和视角之间是否有连接。" },
  vocal_expression: { label: "声音表现", description: "语气、重音和停顿是否支持内容。" },
  answer_relevance: { label: "回答相关性", description: "是否直接回应面试问题。" },
  factual_support: { label: "事实证明", description: "行动和结果是否有真实细节。" },
  authenticity: { label: "真实性", description: "是否避免模板化和夸大。" },
  role_fit: { label: "岗位匹配", description: "反思是否连接岗位要求。" },
});

function structure(label, steps) {
  return Object.freeze({ label, steps: Object.freeze(steps) });
}

export const STRUCTURES = Object.freeze({
  stance_two_reasons_example_close: structure("立场—两点理由—例子—收束", ["界定问题", "给出立场", "两点理由", "具体例子", "限定收束"]),
  situation_disruption_action_result_reflection: structure("背景—意外—应对—结果—反思", ["必要背景", "意外变化", "具体应对", "结果", "反思"]),
  judgment_two_sides_example_conditions: structure("判断—两面影响—例子—条件结论", ["快速判断", "一面影响", "另一面影响", "例子", "条件化结论"]),
  story_problem_three_points_action_callback: structure("故事—问题—三点展开—行动—回扣", ["具体场景", "提出问题", "三点展开", "行动建议", "回扣开场"]),
  story_turn_discovery_method_callback: structure("故事—转折—发现—方法—回扣", ["故事起点", "关键转折", "得到的发现", "可迁移方法", "回扣故事"]),
  phenomenon_impact_actions_call: structure("现象—影响—行动—号召", ["生活现象", "影响", "三项行动", "现实阻力", "行动号召"]),
  receive_clarify_share_space: structure("接住—澄清—分享—留白", ["接住信息", "澄清事实或感受", "有限分享", "跟随回应", "留出空间"]),
  observe_open_followup_exchange: structure("观察开场—开放提问—追问—交换分享", ["自然观察", "开放问题", "追问细节", "有限分享", "延续或结束"]),
  affirm_difference_common_ground: structure("确认兴趣—询问原因—表达差异—寻找共同点", ["确认对方兴趣", "询问具体原因", "表达个人差异", "寻找共同点", "保留分歧"]),
  definition_plain_mechanism_example_boundary: structure("定义—大白话—机制—例子—边界", ["准确界定", "通俗转述", "核心机制", "匹配例子", "适用边界"]),
  phenomenon_principle_analogy_example_limit: structure("现象—原理—类比—例子—局限", ["可见现象", "基础原理", "有限类比", "具体例子", "局限"]),
  question_concept_mechanism_application_boundary: structure("问题—概念—机制—应用—边界", ["提出问题", "解释概念", "说明机制", "谨慎应用", "边界"]),
  claim_reason_evidence_counter_response_limit: structure("主张—理由—证据—反方—回应—有限结论", ["明确主张", "核心理由", "证据", "反方观点", "回应", "有限结论"]),
  criteria_pro_con_conditions_conclusion: structure("标准—正方—反方—条件比较—结论", ["定义标准", "支持理由", "反对理由", "条件比较", "结论"]),
  define_claim_evidence_counter_scope: structure("界定—主张—证据—反例—适用范围", ["界定问题", "提出主张", "证据", "反例", "适用范围"]),
  conclusion_fact_impact_plan_risk_request: structure("结论—事实—影响—方案—风险—请求", ["结论先行", "关键事实", "影响", "方案", "风险", "明确请求"]),
  conclusion_findings_evidence_recommendation_next: structure("结论—发现—证据—建议—下一步", ["总体结论", "主要发现", "证据", "建议", "下一步"]),
  problem_impact_plan_risk_pilot: structure("问题—影响—方案—风险—试行", ["问题", "影响", "替代方案", "风险控制", "试行计划"]),
  understand_goal_obstacle_option_concern_choice: structure("理解—共同目标—障碍—方案—顾虑—选择", ["理解处境", "共同目标", "真实障碍", "小方案", "回应顾虑", "保留选择"]),
  counterpart_goal_evidence_experiment_risk_request: structure("对方目标—证据—小实验—风险—请求", ["对方目标", "问题证据", "小实验", "风险控制", "明确请求"]),
  shared_goal_facts_concerns_co_design: structure("共同目标—事实—顾虑—共拟方案", ["确认共同目标", "描述事实", "听取顾虑", "共拟选项", "确认下一步"]),
  hook_problem_core_example_action: structure("钩子—问题—核心内容—例子—行动", ["具体钩子", "问题或误区", "核心内容", "具体例子", "行动或收束"]),
  hook_misconception_mechanism_example_action: structure("钩子—误区—机制—例子—行动", ["相关场景", "一个误区", "一个机制", "匹配例子", "低成本行动与边界"]),
  contrast_standard_example_check: structure("反常识—判断标准—对比—检查问题", ["反常识开场", "判断标准", "对比例子", "限制条件", "自检问题"]),
  observation_question_views_experience_open: structure("观察—疑问—展开—不同视角—开放收束", ["生活观察", "核心疑问", "两类机制或视角", "个人经历", "暂定理解", "开放收束"]),
  scene_compare_case_tradeoff_open: structure("切口—对比—案例—权衡—开放收束", ["生活切口", "两面比较", "具体案例", "现实权衡", "开放收束"]),
  work_example_reflection_fit: structure("结论—情境—行动—结果—反思—匹配", ["直接结论", "真实情境", "具体行动", "结果证据", "反思", "岗位关联"]),
  weakness_impact_action_progress_gap: structure("弱点—影响—改进—进展—未解决部分", ["真实弱点", "具体影响", "改进行动", "进展证据", "仍未解决部分"]),
  principle_situation_communication_result_reflection: structure("原则—情境—沟通—结果—反思", ["处理原则", "真实或标注的情境", "沟通行动", "结果", "反思"]),
});

const GENERAL_METRICS = ["clarity", "structure", "accuracy", "concision", "fluency", "time_control", "audience_awareness"];

export const SCENES = Object.freeze({
  impromptu: {
    prefix: "IMP",
    label: "即兴表达",
    protocol: "impromptu_expression",
    primarySkill: "临场审题与主线组织",
    secondarySkills: ["时间控制", "条件化判断"],
    metrics: ["prompt_comprehension", "main_thread", "completeness"],
    defaultContext: "你在一次临时分享中被直接问到这个问题，没有现成资料，也不能使用模板答案。",
    templates: ["我如何界定题目", "我的核心判断", "理由或观察一", "理由或观察二", "可用的真实例子", "结论的限制条件"],
    constraints: ["只保留一条主线", "提纲只写关键词", "不得编造经历或数据", "到时后完成当前句并收束"],
    criteria: ["前 20 秒明确回答方向", "至少给出一个具体例子或观察", "结尾说明条件或限制", "在目标时长附近完成收束"],
    incompatibilities: ["不使用需要长篇调研的专业题", "不匹配连续三分钟独白结构"],
    sourceMode: "none",
  },
  public_speaking: {
    prefix: "PUB",
    label: "公众演讲",
    protocol: "research_expression",
    primarySkill: "面向现场听众建立观点与行动连接",
    secondarySkills: ["故事组织", "节奏与收束"],
    metrics: ["listener_awareness", "rhythm", "engagement", "closing"],
    defaultContext: "你将在一个小型公开活动中完成三分钟演讲，听众不了解你的准备过程。",
    templates: ["听众与题目的现实关系", "开场场景或故事素材", "三个展开点（只写关键词）", "听众可能的顾虑", "希望听众采取的行动", "结尾如何回扣开场"],
    constraints: ["开场不先报目录", "只使用能核验的事实", "每个展开点服务同一主旨", "结尾包含清楚行动或回扣"],
    criteria: ["开场建立听众相关性", "主体不超过三个展开点", "至少处理一个听众顾虑", "结尾能被单独复述"],
    incompatibilities: ["不使用纯资料罗列结构", "不把演讲写成可照读全文"],
    sourceMode: "standard",
  },
  social_conversation: {
    prefix: "SOC",
    label: "社交聊天",
    protocol: "interactive_communication",
    primarySkill: "倾听后完成相关、平衡且有边界的回应",
    secondarySkills: ["开放提问", "适度自我分享"],
    metrics: ["listening", "relevance", "turn_balance", "boundaries"],
    defaultContext: "请把题卡当作真人对话提示，独自演练五轮回应；每轮都先复述对方新信息，再决定提问或分享。",
    templates: ["对方明确说出的事实", "我需要确认而不能臆测的感受或需求", "第一轮如何接住", "可用的开放问题", "我的有限真实分享", "如何留出选择与结束空间"],
    constraints: ["不得连续说教", "每轮只回应对方刚提供的信息", "不追问隐私细节", "分享后把话题交还给对方"],
    criteria: ["至少两轮出现有效追问", "至少一次确认对方感受或目标", "个人分享不占据多数轮次", "对方可自然选择继续或结束"],
    incompatibilities: ["不匹配连续独白结构", "不在未确认需求时直接给方案"],
    sourceMode: "light",
  },
  knowledge_explanation: {
    prefix: "EXP",
    label: "知识讲解",
    protocol: "research_expression",
    primarySkill: "准确地把概念转化为受众能理解的口语解释",
    secondarySkills: ["例子匹配", "边界意识"],
    metrics: ["plain_language", "example_fit", "limitation_awareness"],
    defaultContext: "你要向不熟悉该主题的普通听众解释一个概念或机制，目标是让对方理解而不是记住术语。",
    templates: ["可靠来源如何定义核心概念", "我的大白话解释", "最小必要机制", "一个匹配例子", "一个容易混淆的概念", "适用边界或不确定性"],
    constraints: ["最多引入两个专有名词", "每个术语都用自己的话解释", "例子不得代替定义", "明确说明适用边界"],
    criteria: ["听众能用一句话复述概念", "机制与例子之间有清楚对应", "指出至少一个误区或相近概念", "没有把争议说成确定事实"],
    incompatibilities: ["不使用只有观点没有定义的结构", "不省略例子与边界"],
    sourceMode: "standard",
  },
  argumentation: {
    prefix: "ARG",
    label: "观点论证",
    protocol: "research_expression",
    primarySkill: "用证据建立有限主张并公平处理反方",
    secondarySkills: ["来源辨别", "反例处理"],
    metrics: ["claim_clarity", "evidence_quality", "counterargument"],
    defaultContext: "你要在三分钟内提出可讨论的立场，同时说明证据、反方理由和结论边界。",
    templates: ["问题中的关键词与判断标准", "我的有限主张", "支持主张的两类证据", "最强反方观点", "我如何回应或让步", "结论适用于哪些条件"],
    constraints: ["不得把价值偏好伪装成事实", "至少检索一个反方来源", "单个案例不得当作普遍证据", "结论必须保留适用范围"],
    criteria: ["主张清楚且可反驳", "证据与主张存在直接关系", "公平呈现一个强反方", "结论包含条件、范围或让步"],
    incompatibilities: ["高争议主题不得省略反方", "不使用绝对化结论"],
    sourceMode: "standard",
  },
  workplace_reporting: {
    prefix: "WRK",
    label: "职场汇报",
    protocol: "formal_task",
    primarySkill: "用事实、影响和下一步支持工作决策",
    secondarySkills: ["结论先行", "追问应对"],
    metrics: ["conclusion_first", "data_awareness", "action_clarity", "followup_response"],
    defaultContext: "使用题卡提供的模拟背景完成正式汇报；背景外的数据一律标记为未知，不得自行补造。",
    templates: ["一句话结论", "已知事实与未知信息", "对目标或相关方的影响", "可选方案及取舍", "主要风险与控制措施", "负责人、时间与下一步"],
    constraints: ["前 30 秒给出结论", "区分事实、估计和未知", "不杜撰比例或结果", "提出可执行的下一步"],
    criteria: ["主管能快速知道发生了什么", "事实足以支撑建议", "至少比较两个选项或风险", "请求、责任人与时间明确"],
    incompatibilities: ["不使用悬念型短视频钩子", "不匹配纯概念科普结构"],
    sourceMode: "given",
  },
  persuasion: {
    prefix: "PER",
    label: "说服沟通",
    protocol: "interactive_communication",
    primarySkill: "从对方目标与阻力出发推动一个自愿小行动",
    secondarySkills: ["顾虑处理", "非强迫沟通"],
    metrics: ["counterpart_perspective", "resistance_identification", "non_coercion", "action_conversion"],
    defaultContext: "请演练六轮双向沟通。对方不会因为你讲得多就同意，必须先理解目标、阻力和选择边界。",
    templates: ["对方可能真正重视什么", "我需要先确认的阻力", "双方可共享的目标", "一个低成本小方案", "主要顾虑与退出条件", "如何提出不强迫的请求"],
    constraints: ["先提问再建议", "不得使用羞耻、恐惧或身份压力", "方案包含退出条件", "一次只请求一个小行动"],
    criteria: ["至少确认一个真实阻力", "共同目标由双方都可能认可", "方案成本和风险可说明", "对方保留拒绝或修改的空间"],
    incompatibilities: ["未定义对方需求时不得进入方案", "不匹配单向训诫结构"],
    sourceMode: "light",
  },
  video_monologue: {
    prefix: "VID",
    label: "视频口播",
    protocol: "research_expression",
    primarySkill: "把一个核心观点压缩为自然、具体的镜头口语",
    secondarySkills: ["信息筛选", "开头与结尾"],
    metrics: ["opening_relevance", "spoken_style", "information_density", "camera_presence", "ending"],
    defaultContext: "你要录制一段面向具体观众的三分钟口播，不使用提词器全文，只保留每段一个关键词。",
    templates: ["观众正在经历的具体场景", "要纠正的一个误区或问题", "唯一核心内容", "一个可核验例子", "观众当天可做的小动作", "结尾的边界或自检问题"],
    constraints: ["前 20 秒建立相关性", "只讲一个核心观点", "最多使用一个未解释的专有名词", "不得照读完整稿件"],
    criteria: ["开头让目标观众知道与自己有关", "每句话主要表达一个意思", "例子真正支持核心内容", "结尾包含行动、问题或边界"],
    incompatibilities: ["不匹配正式工作汇报结构", "不堆叠多个知识点"],
    sourceMode: "standard",
  },
  podcast_expression: {
    prefix: "POD",
    label: "播客表达",
    protocol: "research_expression",
    primarySkill: "围绕一条主线自然展开观察、经历和不同视角",
    secondarySkills: ["过渡", "开放收束"],
    metrics: ["main_thread", "naturalness", "transitions", "vocal_expression"],
    defaultContext: "你要录制一段三分钟播客独白，允许保留探索感，但每个岔路都要能回到核心疑问。",
    templates: ["从哪个生活观察切入", "真正想追问的核心疑问", "两个不同视角或机制", "一个真实经历或作品案例", "我目前的暂定理解", "如何留下开放问题"],
    constraints: ["保留自然探索但不漫无边际", "个人经历不代替普遍证据", "视角切换时说明连接", "结尾不假装给出最终答案"],
    criteria: ["开场出现具体观察", "核心疑问在中段仍可辨认", "至少呈现两个视角", "结尾形成暂定理解或开放问题"],
    incompatibilities: ["不使用逐条资料播报", "不把探索表达成确定结论"],
    sourceMode: "standard",
  },
  interview_answer: {
    prefix: "INT",
    label: "面试回答",
    protocol: "impromptu_expression",
    primarySkill: "用真实事实直接回答问题并连接岗位要求",
    secondarySkills: ["经历提炼", "真实性"],
    metrics: ["answer_relevance", "factual_support", "authenticity", "role_fit"],
    defaultContext: "你正在参加一场通用岗位模拟面试。行为题必须使用真实经历；情境题若无经历，要明确说明是假设处理。",
    templates: ["一句话直接回答", "可使用的真实情境", "我承担的具体任务", "我采取的关键行动", "可核验的结果或反馈", "反思与岗位关联"],
    constraints: ["不背模板答案", "不得虚构职责、数据或结果", "重点说明自己的行动", "反思要连接岗位要求"],
    criteria: ["开头直接回应问题", "情境信息足够但不过长", "行动具体到可观察行为", "结果与反思真实且相关"],
    incompatibilities: ["行为题不匹配纯概念结构", "不允许编造项目经历"],
    sourceMode: "none",
  },
});

function cardSeed(domain, topic, topicLabel, title, audience, purpose, taskTypes, difficulty, structureId, focus, extra = {}) {
  return { domain, topic, topicLabel, title, audience, purpose, taskTypes, difficulty, structureId, focus, ...extra };
}

function group(scene, seeds) {
  const definition = SCENES[scene];
  return seeds.map((seed, index) => ({
    ...seed,
    scene,
    id: `${definition.prefix}-${String(index + 1).padStart(3, "0")}`,
  }));
}

const CARD_SEEDS = [
  ...group("impromptu", [
    cardSeed("personal_life", "solitude_necessity", "独处与恢复", "准备 60 秒后回答：独处是现代人的必需品吗？", "同龄人的小组讨论", "给出个人判断，并说明它成立的条件", ["viewpoint_argument"], 1, "stance_two_reasons_example_close", ["你如何区分独处、孤独和逃避", "你的生活中有哪些可验证观察", "哪些人或情境可能不适用"]),
    cardSeed("psychology_behavior", "plan_disruption_response", "计划被打乱后的应对", "用两分钟讲一次计划被打乱后你如何处理的真实经历。", "刚认识的同学或同事", "让听众看清冲突、行动、结果和反思", ["experience_story"], 1, "situation_disruption_action_result_reflection", ["哪次经历有清楚的意外变化", "你的关键行动而非情绪标签是什么", "事后哪一点真正值得保留或调整"]),
    cardSeed("relationships", "honest_feedback_friend", "朋友间的诚实反馈", "临时回答：朋友需要建议时，直说和委婉哪个更重要？", "朋友聚会中的对话伙伴", "表达一个不绝对化的人际判断", ["comparison", "viewpoint_argument"], 2, "judgment_two_sides_example_conditions", ["建议、评价和支持有什么区别", "关系距离与时机怎样改变选择", "哪些边界不能只靠语气解决"]),
    cardSeed("workplace_organization", "meeting_camera_choice", "线上会议开摄像头", "临时发言：线上会议是否应该默认开启摄像头？", "一个混合办公团队", "兼顾协作需要与成员现实限制", ["viewpoint_argument"], 2, "criteria_pro_con_conditions_conclusion", ["用什么标准判断会议需要", "开启与不开启各有什么真实成本", "哪些会议类型需要不同规则"]),
    cardSeed("business_entrepreneurship", "imperfect_product_launch", "不完美产品何时上线", "回答：小团队应不应该先发布一个不完美的产品？", "创业兴趣小组", "给出包含风险条件的临场判断", ["viewpoint_argument"], 2, "claim_reason_evidence_counter_response_limit", ["不完美与不可用如何区分", "早发布希望验证什么", "哪些风险意味着不能贸然上线"]),
    cardSeed("economics_finance", "cashless_spending_judgment", "无现金支付与消费判断", "即兴讨论：完全无现金的生活会不会改变人的消费判断？", "普通消费者", "区分个人体验、机制猜测和有限结论", ["mechanism_explanation", "viewpoint_argument"], 2, "judgment_two_sides_example_conditions", ["你观察到哪些支付场景差异", "便利与失控可能分别出现在哪里", "哪些结论仅是个人经验"]),
    cardSeed("technology_ai", "ai_competitiveness_dependence", "AI 与普通人的能力", "临时被问：AI 会让普通人更有竞争力，还是更依赖工具？", "对 AI 有基础体验的同龄人", "区分短期与长期影响后给出条件化判断", ["comparison", "viewpoint_argument"], 2, "judgment_two_sides_example_conditions", ["竞争力指什么具体能力", "工具放大和能力退化各有哪些场景", "哪些使用条件会改变结果"]),
    cardSeed("society_public", "quiet_zones_public_space", "公共空间的安静区域", "即兴回应：公共交通是否应该设置更多安静区域？", "通勤者组成的讨论小组", "在不同人群需求之间做有限判断", ["viewpoint_argument"], 2, "criteria_pro_con_conditions_conclusion", ["公共空间需要满足哪些不同需求", "规则执行会有什么成本", "自愿区域与统一规则有什么差别"]),
    cardSeed("culture_media", "spoilers_and_enjoyment", "剧透与作品体验", "准备一分钟后回答：知道结局一定会破坏作品体验吗？", "喜欢影视作品的朋友", "用不同作品类型说明判断条件", ["comparison", "viewpoint_argument"], 1, "judgment_two_sides_example_conditions", ["悬念型与过程型作品有什么差异", "你的真实观看体验能说明什么", "个人偏好不能推出哪些结论"]),
    cardSeed("science_nature", "daily_air_quality_attention", "日常空气质量信息", "即兴回答：普通人有必要每天关注空气质量吗？", "没有专业背景的家人", "在不提供健康诊断的前提下说明判断标准", ["viewpoint_argument"], 2, "criteria_pro_con_conditions_conclusion", ["关注的目的与频率如何界定", "哪些人和活动情境更相关", "你不能凭印象给出哪些健康结论"], { sourceMode: "sensitive", sensitiveFlags: ["health"], constraints: ["不得给出个体医疗建议"] }),
    cardSeed("history_civilization", "historical_habit_today", "历史习惯的现代迁移", "选择一个你了解的历史生活习惯，说明今天是否值得保留。", "非历史专业的同龄人", "讲清迁移理由与时代差异", ["viewpoint_argument", "case_story"], 2, "define_claim_evidence_counter_scope", ["这个习惯的背景你真正知道多少", "它解决的旧问题今天是否仍存在", "时代条件差异会让哪些类比失效"]),
    cardSeed("philosophy_values", "consistency_or_choice", "坚持与重新选择", "即兴讨论：长期坚持和及时改变方向，哪个更值得赞赏？", "价值观不同的讨论伙伴", "用判断标准而非口号表达价值取舍", ["comparison", "viewpoint_argument"], 2, "criteria_pro_con_conditions_conclusion", ["赞赏的是行为、动机还是结果", "坚持与沉没成本如何区分", "什么新信息足以支持改变方向"]),
  ]),
  ...group("public_speaking", [
    cardSeed("personal_life", "active_learning_adults", "成年人主动学习", "面向同龄人演讲：为什么成年人仍然需要主动学习？", "已经离开学校的普通成年人", "让听众识别一个现实学习需求并选择一项行动", ["viewpoint_argument", "persuasion_action"], 2, "story_problem_three_points_action_callback", ["技能和生活变化带来的具体需求", "可信的学习案例或数据", "时间不足等真实顾虑"]),
    cardSeed("psychology_behavior", "failure_as_information", "失败提供的信息", "以一次真实失败为素材，演讲“失败怎样提供有效信息”。", "害怕尝试新事物的年轻人", "把个人故事转化为可迁移的复盘方法", ["experience_story", "method_teaching"], 2, "story_turn_discovery_method_callback", ["故事中真正的失败标准", "复盘方法的可靠来源", "哪些失败不能被浪漫化"]),
    cardSeed("relationships", "maintaining_weak_ties", "维护弱联系", "面向新生演讲：为什么值得维护一些不常联系的人际关系？", "刚进入新环境的学生", "说明关系多样性的价值与边界", ["viewpoint_argument", "persuasion_action"], 2, "story_problem_three_points_action_callback", ["弱联系的准确含义", "可靠研究或真实案例", "社交压力和隐私边界"]),
    cardSeed("workplace_organization", "meeting_culture_improvement", "更有效的会议文化", "面向团队做短演讲：怎样让会议重新服务协作？", "经常参加会议的项目团队", "倡议一项可试行的会议行为", ["proposal", "persuasion_action"], 3, "phenomenon_impact_actions_call", ["常见会议成本如何识别", "有效会议的不同做法", "取消会议可能带来的风险"]),
    cardSeed("business_entrepreneurship", "small_business_customer_trust", "小生意的顾客信任", "面向小店经营者演讲：信任为什么比一次成交更值得长期经营？", "初次经营线下或线上小店的人", "把抽象信任转化为可观察经营行为", ["viewpoint_argument", "case_story"], 3, "story_problem_three_points_action_callback", ["信任可以观察哪些行为信号", "一个可核验商业案例", "短期让利与长期信任不能混同之处"]),
    cardSeed("economics_finance", "inflation_daily_decisions", "通胀与日常选择", "向社区居民演讲：理解通胀能帮助我们做哪些更清楚的日常判断？", "没有经济学背景的普通家庭", "提高判断意识，不给出具体投资建议", ["concept_explanation", "method_teaching"], 3, "question_concept_mechanism_application_boundary", ["权威来源如何界定相关概念", "价格变化的不同原因", "个人决策中的适用边界"], { sourceMode: "sensitive", sensitiveFlags: ["finance"], constraints: ["不得推荐具体金融产品", "必须区分一般教育与个人建议"] }),
    cardSeed("technology_ai", "responsible_ai_use", "负责任地使用 AI", "面向同学演讲：使用生成式 AI 时，哪些责任不能交给工具？", "正在学习使用生成式 AI 的学生", "倡议一套可执行的核验与署名行为", ["viewpoint_argument", "persuasion_action"], 3, "story_problem_three_points_action_callback", ["不同任务中的责任归属", "错误与偏差的可靠案例", "效率、隐私和原创性的顾虑"]),
    cardSeed("society_public", "food_waste_small_actions", "减少食物浪费", "面向社区居民演讲：减少食物浪费可以从哪些小事开始？", "家庭采购和用餐者", "让听众选择一项低成本行动", ["method_teaching", "persuasion_action"], 2, "phenomenon_impact_actions_call", ["浪费发生在哪些具体环节", "影响与数据的可靠来源", "建议为何可能难以坚持"]),
    cardSeed("culture_media", "local_cultural_memory", "地方文化记忆", "面向本地青年演讲：为什么值得记录身边正在消失的文化记忆？", "对地方史不熟悉的年轻居民", "促成一次可执行的记录行动", ["viewpoint_argument", "persuasion_action"], 3, "story_problem_three_points_action_callback", ["什么材料可以称为文化记忆", "一个可核验的本地案例", "记录、代表和隐私的边界"]),
    cardSeed("science_nature", "scientific_uncertainty_public", "科学中的不确定性", "面向公众演讲：科学结论为什么会修正，但仍值得信任？", "容易把修正理解为不可靠的普通听众", "解释修正机制并建立有限信任", ["mechanism_explanation", "viewpoint_argument"], 3, "question_concept_mechanism_application_boundary", ["科学修正与随意改变的区别", "一个可核验的修正案例", "何时应保持谨慎而非盲信"]),
    cardSeed("history_civilization", "museum_and_present", "博物馆与当下", "面向第一次参观博物馆的人演讲：如何让历史展品与今天发生关系？", "认为博物馆枯燥的普通观众", "提供一种主动观看的方法", ["method_teaching", "viewpoint_argument"], 2, "story_turn_discovery_method_callback", ["展品信息的可靠读取方式", "一个具体展品或展览案例", "避免用现代价值简单替代历史背景"]),
    cardSeed("philosophy_values", "disagree_with_respect", "有分歧地共同讨论", "面向学生社团演讲：为什么尊重不等于避免分歧？", "需要共同决策的社团成员", "倡议一套能容纳分歧的讨论行为", ["viewpoint_argument", "persuasion_action"], 3, "story_problem_three_points_action_callback", ["尊重、同意和容忍如何区分", "建设性分歧的案例或研究", "权力差异和安全边界"]),
  ]),
  ...group("social_conversation", [
    cardSeed("personal_life", "friend_always_busy", "总觉得没有时间", "朋友说“每天都很忙，但又说不清做了什么”，进行五轮对话。", "一位近期生活节奏混乱的朋友", "帮助对方把经历说清，而不是替对方安排日程", ["dialogue_response"], 1, "receive_clarify_share_space", ["对方所谓忙具体发生在什么时候", "对方希望被理解还是想一起想办法", "哪些建议需要先获得许可"], { context: "朋友在晚饭后主动提到最近总觉得时间不够，你并不知道其工作和家庭细节。" }),
    cardSeed("psychology_behavior", "after_work_exhaustion", "下班后的耗竭感", "朋友说“最近下班后什么都不想做”，进行五轮对话。", "一位信任你的朋友", "识别事实、感受和需求，避免立即教育", ["dialogue_response"], 1, "receive_clarify_share_space", ["这种状态持续多久、如何影响生活", "对方当下更需要陪伴还是具体帮助", "哪些情况需要建议寻求专业支持"], { sourceMode: "sensitive", sensitiveFlags: ["mental_health"], constraints: ["不得做心理或医疗诊断"] }),
    cardSeed("relationships", "stranger_hobby_gathering", "兴趣聚会的陌生人聊天", "初次参加兴趣聚会，与陌生人自然开启并延续对话。", "同场但互不认识的参加者", "完成自然开场、追问、交换分享和体面结束", ["dialogue_response"], 1, "observe_open_followup_exchange", ["现场有什么共同观察可作为开场", "三个不要求隐私的开放问题", "如何判断对方想继续还是结束"]),
    cardSeed("workplace_organization", "colleague_meeting_frustration", "同事抱怨会议", "同事说“这个会又浪费了一下午”，练习五轮同事间对话。", "与你平级且疲惫的同事", "先理解具体问题，再决定是否讨论改进", ["dialogue_response"], 2, "receive_clarify_share_space", ["对方不满的是目标、流程还是结果", "你掌握哪些事实而非传闻", "何时适合把抱怨转成行动"]),
    cardSeed("business_entrepreneurship", "friend_side_business_anxiety", "朋友想做副业又焦虑", "朋友想尝试副业，却担心浪费时间和钱，进行五轮对话。", "一位正在犹豫的朋友", "帮助对方澄清担忧，不替其做商业决定", ["dialogue_response"], 2, "receive_clarify_share_space", ["对方想获得什么而非只想做什么", "可承受投入需要怎样确认", "经验分享和结果承诺的边界"]),
    cardSeed("economics_finance", "guaranteed_investment_claim", "“稳赚”投资说法", "朋友兴奋地说“这个投资肯定稳赚”，在不扫兴的情况下继续对话。", "准备投入一笔积蓄的朋友", "促使对方自行核验风险，同时保留关系和选择权", ["dialogue_response", "objection_handling"], 3, "receive_clarify_share_space", ["对方信息来自哪里、理解到什么程度", "收益、风险和退出条件需要核对什么", "何时建议咨询持牌专业人士"], { sourceMode: "sensitive", sensitiveFlags: ["finance"], constraints: ["不得给出买入或卖出建议", "不得替对方判断具体产品是否合法"] }),
    cardSeed("technology_ai", "friend_ai_job_worry", "AI 带来的工作担忧", "朋友说“AI 迟早会把我的工作替掉”，练习五轮回应。", "对未来职业感到不安的朋友", "接住担忧并帮助把模糊恐惧变成可讨论问题", ["dialogue_response"], 2, "receive_clarify_share_space", ["对方担心的是岗位、任务还是学习压力", "哪些经历和信息是对方已经观察到的", "你能分享什么有限而不确定的经验"]),
    cardSeed("society_public", "neighbor_community_rule", "邻里公共规则分歧", "邻居不同意新公共空间规则，与你当面交流，完成五轮回应。", "与你立场不同但需长期相处的邻居", "找出具体影响与可协商部分", ["dialogue_response", "objection_handling"], 3, "affirm_difference_common_ground", ["对方反对的是目的还是执行方式", "双方共同需要维护什么", "哪些事项需要交给正式程序决定"]),
    cardSeed("culture_media", "disliked_movie_recommendation", "交流不喜欢的电影", "朋友强烈推荐一部你不喜欢的电影，在不敷衍的情况下交流。", "非常喜欢这部作品的朋友", "表达真实差异，同时理解对方的观看体验", ["dialogue_response", "comparison"], 1, "affirm_difference_common_ground", ["作品事实与个人体验如何分开", "对方最喜欢的具体部分是什么", "你们可能共享哪些评价标准"]),
    cardSeed("science_nature", "dubious_health_claim", "可疑健康说法", "熟人分享一条未经核实的健康说法，并问你是否相信，进行五轮对话。", "相信该说法对自己有帮助的熟人", "不羞辱对方，同时把讨论引向来源与适用边界", ["dialogue_response", "objection_handling"], 3, "affirm_difference_common_ground", ["说法的原始来源和适用对象", "个人体验为什么不能单独证明普遍效果", "何时必须求助医疗专业人士"], { sourceMode: "sensitive", sensitiveFlags: ["health"], constraints: ["不得诊断或提供治疗建议"] }),
    cardSeed("history_civilization", "elder_family_memory", "听长辈讲家族往事", "长辈开始讲一段家族往事，练习如何追问而不把谈话变成审问。", "愿意分享但可能触及敏感记忆的长辈", "保留细节、情绪和退出空间", ["dialogue_response", "facilitation"], 2, "observe_open_followup_exchange", ["哪些开放问题能帮助还原时间与场景", "哪些细节可能涉及他人隐私", "如何区分记忆、推测和可核验事实"]),
    cardSeed("philosophy_values", "results_define_success", "只看结果的成功观", "朋友说“结果不好，过程再努力也没意义”，与你继续讨论五轮。", "近期经历挫折的朋友", "理解这句话背后的处境，再交流不同价值判断", ["dialogue_response", "viewpoint_argument"], 2, "receive_clarify_share_space", ["这句话针对哪次具体经历", "对方此刻是在评价自己还是讨论原则", "何时适合表达不同看法"]),
  ]),
  ...group("knowledge_explanation", [
    cardSeed("personal_life", "weekly_review_method", "个人周复盘", "向刚开始自我管理的人解释：周复盘是什么，又不是什么？", "容易把复盘变成自责清单的初学者", "让听众理解流程并能尝试一次简短复盘", ["concept_explanation", "method_teaching"], 2, "definition_plain_mechanism_example_boundary", ["可靠方法如何定义复盘目的", "复盘与计划、评价自己的区别", "一个不暴露隐私的生活例子"]),
    cardSeed("psychology_behavior", "habit_cue_response", "习惯与环境线索", "向普通成年人解释：环境线索如何影响习惯行为？", "想改变一个日常小习惯的人", "讲清有限机制并避免把行为简化为单一原因", ["mechanism_explanation"], 2, "phenomenon_principle_analogy_example_limit", ["相关概念的可靠定义", "环境线索与其他影响因素的关系", "一个可验证生活例子和反例"]),
    cardSeed("relationships", "boundaries_not_indifference", "关系边界与冷漠", "向年轻人解释：人际边界和冷漠有什么区别？", "在拒绝别人时容易内疚的年轻人", "澄清概念并说明情境差异", ["concept_explanation", "comparison"], 2, "definition_plain_mechanism_example_boundary", ["心理或沟通领域如何界定边界", "边界、拒绝与疏离的差异", "权力关系会带来哪些限制"]),
    cardSeed("workplace_organization", "project_sunk_cost", "项目中的沉没成本", "向项目新人解释：为什么已经投入很多，不一定意味着必须继续？", "第一次参与项目决策的新人", "解释沉没成本及其有限应用", ["concept_explanation", "mechanism_explanation"], 2, "question_concept_mechanism_application_boundary", ["权威定义与相近概念", "一个模拟项目例子", "哪些既有投入仍可能影响未来决策"]),
    cardSeed("business_entrepreneurship", "product_market_fit", "产品与市场匹配", "向创业初学者解释“产品与市场匹配”时，如何避免把它讲成一句口号？", "有产品想法但没有商业训练的人", "解释可观察信号、误区和阶段边界", ["concept_explanation", "mechanism_explanation"], 3, "definition_plain_mechanism_example_boundary", ["不同可靠来源如何定义该概念", "有哪些可观察但不等同的信号", "早期验证的限制和反例"]),
    cardSeed("economics_finance", "opportunity_cost", "机会成本", "向普通成年人解释“机会成本”，并给出一个真正匹配的生活例子。", "没有经济学背景的家庭成员", "让听众能用该概念检查一个日常选择", ["concept_explanation"], 2, "definition_plain_mechanism_example_boundary", ["权威定义与常见误解", "相近概念如何区分", "两个候选例子中哪个真正匹配"]),
    cardSeed("technology_ai", "recommendation_algorithm", "推荐算法的反馈", "向中学生解释：推荐算法为什么看起来越用越懂你？", "使用短视频和音乐平台的中学生", "解释基础反馈机制，并指出局限与隐私问题", ["mechanism_explanation"], 2, "phenomenon_principle_analogy_example_limit", ["推荐系统使用哪些类型的反馈信号", "类比在哪些地方会失真", "偏差、局限和隐私风险"]),
    cardSeed("society_public", "public_consultation", "公共意见征集", "向第一次参与社区议事的人解释：公共意见征集能做什么，不能做什么？", "普通社区居民", "说明参与机制、证据和决策边界", ["concept_explanation", "method_teaching"], 3, "question_concept_mechanism_application_boundary", ["官方规则如何定义参与流程", "意见如何被记录和处理", "参与、投票和最终决策的差异"]),
    cardSeed("culture_media", "narrative_perspective", "叙事视角", "向普通读者解释：叙事视角怎样改变我们知道什么、相信谁？", "喜欢故事但不熟悉文学术语的读者", "用一个作品例子说明视角功能与局限", ["concept_explanation", "mechanism_explanation"], 2, "phenomenon_principle_analogy_example_limit", ["叙事视角的基本类型与定义", "一个可核验作品例子", "视角效果不能推出哪些价值结论"]),
    cardSeed("science_nature", "sleep_cycle_limited_advice", "睡眠周期的有限意义", "解释“睡眠周期”及其对作息建议的有限意义。", "希望改善作息的普通成年人", "讲清基本概念，同时避免个体诊断和过度承诺", ["concept_explanation", "mechanism_explanation"], 3, "question_concept_mechanism_application_boundary", ["可靠健康来源如何描述睡眠阶段", "周期说法的个体差异与研究限制", "哪些情况需要咨询专业人士"], { sourceMode: "sensitive", sensitiveFlags: ["health"], constraints: ["不得给出个体诊断或保证效果"] }),
    cardSeed("history_civilization", "primary_secondary_sources", "一手与二手史料", "向历史兴趣者解释：一手资料为什么不一定天然更可信？", "刚开始查历史资料的普通读者", "说明来源类型、语境和交叉核验", ["concept_explanation", "method_teaching"], 3, "definition_plain_mechanism_example_boundary", ["史学机构如何区分来源类型", "作者位置和产生语境如何影响材料", "一个可核验的来源比较案例"]),
    cardSeed("philosophy_values", "moral_dilemma_value_conflict", "道德困境与价值冲突", "向同龄人解释：价值冲突和“没有原则”有什么区别？", "面对两难选择的普通成年人", "提供判断框架，不替听众给出最终答案", ["concept_explanation", "comparison"], 3, "definition_plain_mechanism_example_boundary", ["哲学来源如何界定价值冲突", "一个不预设答案的日常案例", "框架不能替代哪些个人或制度责任"]),
  ]),
  ...group("argumentation", [
    cardSeed("personal_life", "digital_minimalism_wellbeing", "数字极简与生活质量", "论证：减少数字工具，是否一定能提高生活质量？", "同时依赖数字工具工作和娱乐的成年人", "在效率、连接与注意力之间提出有限结论", ["viewpoint_argument", "comparison"], 3, "criteria_pro_con_conditions_conclusion", ["生活质量应采用哪些判断标准", "支持与反对材料分别说什么", "不同职业和生活阶段的差异"]),
    cardSeed("psychology_behavior", "self_control_environment_design", "自制力与环境设计", "论证：提高自制力，环境设计是否比意志力更重要？", "想改变习惯的普通年轻人", "比较两类解释并给出适用条件", ["viewpoint_argument", "mechanism_explanation"], 3, "claim_reason_evidence_counter_response_limit", ["自制力、意志力和环境设计如何定义", "支持与质疑相关观点的材料", "个体差异和不可控环境的边界"]),
    cardSeed("relationships", "complete_honesty_friendship", "友谊中的完全诚实", "论证：好朋友之间是否应该毫无保留地诚实？", "重视坦诚也重视边界的同龄人", "区分诚实、披露义务和伤害风险", ["viewpoint_argument"], 3, "define_claim_evidence_counter_scope", ["毫无保留和不欺骗如何区分", "关系研究或沟通材料", "隐私、安全和时机带来的反例"]),
    cardSeed("workplace_organization", "async_work_efficiency", "异步协作的效率", "论证：知识团队是否应该把异步沟通设为默认？", "混合办公团队的管理者", "比较效率、透明度和协调成本", ["viewpoint_argument", "comparison"], 3, "criteria_pro_con_conditions_conclusion", ["效率采用哪些可观察标准", "同步与异步各适合哪些任务", "团队成熟度和紧急事件的限制"]),
    cardSeed("business_entrepreneurship", "startup_growth_or_profit", "创业早期的增长与利润", "论证：创业早期应优先追求增长，还是尽早验证盈利？", "资源有限的创业团队", "明确阶段与商业模式条件，不给单一答案", ["comparison", "viewpoint_argument"], 4, "criteria_pro_con_conditions_conclusion", ["增长和盈利的具体判断指标", "不同商业模式的案例证据", "现金流、融资环境和时间窗口"]),
    cardSeed("economics_finance", "financial_literacy_required", "基础金融教育", "论证：学校是否应该把个人金融常识列为必修内容？", "教育工作者与家长", "比较公共收益、课程成本和责任边界", ["viewpoint_argument", "proposal"], 3, "claim_reason_evidence_counter_response_limit", ["金融常识应包含和排除什么", "教育效果与课程负担的证据", "家庭、学校和监管的责任边界"], { sourceMode: "sensitive", sensitiveFlags: ["finance"] }),
    cardSeed("technology_ai", "ai_competitiveness_dependence", "AI 与普通人的能力", "论证：AI 更可能增强普通人的竞争力，还是加深工具依赖？", "需要制定 AI 学习计划的职场新人", "用能力类型和时间尺度限定结论", ["comparison", "viewpoint_argument"], 4, "claim_reason_evidence_counter_response_limit", ["竞争力与依赖的可观察指标", "支持两面的可靠材料", "任务类型、技能基础和长期反馈"]),
    cardSeed("society_public", "university_job_qualification", "大学教育的主要价值", "论证：大学教育的主要价值是否仍是获得工作资格？", "正在选择教育路径的年轻人", "比较就业功能与其他公共、个人价值", ["viewpoint_argument", "comparison"], 4, "define_claim_evidence_counter_scope", ["“主要价值”和“资格”如何界定", "就业数据与教育其他功能", "专业、地区和群体差异"]),
    cardSeed("culture_media", "short_video_learning", "短视频学习", "论证：短视频能否成为有效的学习工具？", "经常用短视频获取知识的学习者", "先定义学习效果，再比较使用条件", ["viewpoint_argument", "comparison"], 3, "criteria_pro_con_conditions_conclusion", ["学习效果采用哪些标准", "支持与反对的研究或观察", "内容类型、主动练习和平台机制"]),
    cardSeed("science_nature", "science_communication_simplification", "科普中的简化", "论证：为了让公众理解，科普可以在多大程度上简化？", "做知识传播的内容创作者", "处理准确、可懂与不确定性的冲突", ["viewpoint_argument"], 4, "claim_reason_evidence_counter_response_limit", ["简化、类比和失真的界线", "成功与失败的可核验案例", "风险主题为何需要不同标准"]),
    cardSeed("history_civilization", "history_facts_or_interpretation", "历史教育的事实与解释", "论证：基础历史教育应更重事实记忆，还是解释能力？", "中学教育相关者", "比较两类目标并提出组合条件", ["comparison", "viewpoint_argument"], 3, "criteria_pro_con_conditions_conclusion", ["事实基础和解释能力如何衡量", "教育研究或课程案例", "年龄、课时和评价方式的限制"]),
    cardSeed("philosophy_values", "process_or_result_moral_judgment", "过程与结果的道德评价", "论证：评价一个决定时，动机和过程是否应比结果更重要？", "参加伦理讨论的普通成年人", "呈现至少两种价值标准并限定结论", ["viewpoint_argument", "comparison"], 4, "claim_reason_evidence_counter_response_limit", ["动机、过程和结果如何区分", "不同伦理视角的可靠介绍", "运气、可预见性和责任范围"]),
  ]),
  ...group("workplace_reporting", [
    cardSeed("personal_life", "workload_priority_request", "工作负荷与优先级", "向主管汇报当前任务冲突，并请求确认优先级。", "负责分配资源的直属主管", "让主管基于事实决定取舍", ["problem_report", "proposal"], 2, "conclusion_fact_impact_plan_risk_request", ["四项任务的截止时间与必要投入", "不调整时的具体影响", "你建议的两个取舍选项"], { context: "模拟背景：你本周同时收到四项任务，其中两项都标为高优先级；按现有工时只能按时完成三项，第四项会延迟约两天。" }),
    cardSeed("psychology_behavior", "team_focus_interruptions", "团队注意力被打断", "汇报团队频繁被临时消息打断的问题，并提出试行方案。", "关注交付速度的团队负责人", "把主观疲惫转化为可观察工作现象", ["problem_report", "proposal"], 3, "problem_impact_plan_risk_pilot", ["打断发生的频率与任务类型", "对交付和错误的可见影响", "不影响紧急响应的试行规则"], { context: "模拟背景：过去两周，团队每天平均出现多次临时状态询问；三位成员反馈深度工作被中断，但尚未记录精确损失。" }),
    cardSeed("relationships", "cross_team_dependency_conflict", "跨团队依赖冲突", "向项目负责人汇报两个团队在交付依赖上的分歧。", "需要协调资源的项目负责人", "呈现双方事实与未决问题，不选边站队", ["problem_report", "proposal"], 3, "conclusion_fact_impact_plan_risk_request", ["双方已经确认的事实", "各自目标与约束", "需要负责人决策的具体事项"], { context: "模拟背景：设计团队认为需求仍在变化，开发团队要求本周冻结范围；共同发布日期还有三周，双方尚未确认变更流程。" }),
    cardSeed("workplace_organization", "project_delay_release", "项目延期与发布日期", "向主管汇报项目延期，并争取调整发布日期。", "对发布日期和资源负责的主管", "说明原因、影响、选项与明确请求", ["problem_report", "proposal"], 3, "conclusion_fact_impact_plan_risk_request", ["已完成与未完成工作", "延期原因中可控与不可控部分", "调整日期、缩范围或加资源的取舍"], { context: "模拟背景：核心功能已完成约八成，但一个外部接口比计划晚五天；若不调整，测试只剩两天，当前没有额外测试人员。" }),
    cardSeed("business_entrepreneurship", "user_feedback_findings", "用户反馈调研发现", "用三分钟汇报一次用户反馈调研的主要发现。", "准备决定下一轮产品重点的团队", "用访谈证据提出下一步验证建议", ["problem_report", "proposal"], 3, "conclusion_findings_evidence_recommendation_next", ["访谈中的重复模式与例外", "原话和你的解释如何分开", "哪些发现仍需量化验证"], { context: "模拟背景：你完成了六次用户访谈；多数人提到首次设置困难，三人提到搜索不准，一人强烈要求社交功能。不得把六人结果换算成市场比例。" }),
    cardSeed("economics_finance", "budget_variance_response", "预算偏差与调整", "向负责人汇报活动预算可能超支，并提出控制选项。", "对预算和活动效果负责的负责人", "区分已发生、承诺支出和估计支出", ["problem_report", "proposal"], 3, "conclusion_fact_impact_plan_risk_request", ["预算基线与当前支出类别", "超支区间和不确定性", "削减范围、追加预算或更换方案的取舍"], { context: "模拟背景：场地费用比预算高 12%，宣传物料尚未下单；目前预计总额可能超出预算 8% 到 15%，赞助金额仍未最终确认。", sourceMode: "given", sensitiveFlags: ["finance"] }),
    cardSeed("technology_ai", "ai_tool_pilot_report", "AI 工具试点", "汇报一项 AI 助手试点结果，并建议是否扩大使用。", "关注效率、质量和数据风险的管理者", "基于有限试点提出下一步而非全面结论", ["retrospective", "proposal"], 4, "conclusion_findings_evidence_recommendation_next", ["试点任务、样本和评价标准", "效率收益与错误案例", "隐私、复核和退出条件"], { context: "模拟背景：四名成员用 AI 助手处理两类内部文档两周；平均初稿时间下降，但出现两次事实错误，涉及敏感数据的任务未纳入试点。" }),
    cardSeed("society_public", "accessibility_feedback_response", "无障碍使用反馈", "汇报用户提出的无障碍问题，并争取排期修复。", "负责产品优先级的跨职能小组", "说明影响、证据和分阶段修复方案", ["problem_report", "proposal"], 3, "problem_impact_plan_risk_pilot", ["用户遇到的具体障碍", "影响范围中已知与未知部分", "立即修复与后续审计的安排"], { context: "模拟背景：两位键盘用户无法完成主要表单，一位低视力用户反馈对比度不足；目前尚未完成全站无障碍审计。" }),
    cardSeed("culture_media", "brand_content_controversy", "品牌内容争议", "向团队汇报一条品牌内容引发争议后的处理建议。", "品牌、客服和管理团队", "区分事实、公众担忧与未经证实推测", ["problem_report", "proposal", "objection_handling"], 4, "conclusion_fact_impact_plan_risk_request", ["已发布内容和可核验反馈", "不同受众的具体担忧", "回应、修订和复盘选项"], { context: "模拟背景：一条宣传内容发布六小时后收到集中批评，主要质疑其刻板印象；暂无证据表明销量变化，评论中也存在相互矛盾的解读。" }),
    cardSeed("science_nature", "experiment_anomaly_report", "实验异常汇报", "向实验负责人汇报一次测量异常，并提出排查顺序。", "需要决定是否暂停后续实验的负责人", "诚实呈现异常、未知和验证计划", ["problem_report", "proposal"], 4, "conclusion_fact_impact_plan_risk_request", ["异常出现的时间和条件", "仪器、样品和操作的候选原因", "最小成本的排查顺序"], { context: "模拟背景：同一批样品连续三次读数偏离历史范围，其中一次复测恢复正常；仪器校准还有十天到期，环境记录完整。" }),
    cardSeed("history_civilization", "archive_digitization_progress", "档案数字化进度", "汇报一项档案数字化项目的进度、风险和下一步。", "负责文化项目经费的主管", "让非专业主管理解质量与速度的取舍", ["problem_report", "retrospective", "proposal"], 3, "conclusion_findings_evidence_recommendation_next", ["完成量、质量抽检和剩余工作", "版权、隐私或元数据风险", "速度与准确度的两个方案"], { context: "模拟背景：项目已完成计划数量的 60%，抽检发现约 5% 元数据需要复核；部分材料的公开权限尚未确认，原定截止时间还有四周。" }),
    cardSeed("philosophy_values", "reduce_low_value_meetings", "减少低效周会", "提议减少低效周会，并说明替代机制与协作原则。", "担心失去透明度和团队连接的主管", "争取两周试行并定义退出条件", ["proposal", "persuasion_action"], 3, "problem_impact_plan_risk_pilot", ["会议成本与必要价值如何区分", "异步机制怎样维持透明度", "试行指标、风险和恢复条件"], { context: "模拟背景：团队每周有三次固定状态会，其中两次常重复文档内容；主管担心取消后信息不对称，新成员也需要建立连接。" }),
  ]),
  ...group("persuasion", [
    cardSeed("personal_life", "sleep_low_cost_change", "熬夜后的低成本改变", "劝经常熬夜的朋友先尝试一项低成本改变。", "知道熬夜影响但不想被教育的朋友", "理解阻力后提出一个可选择的小实验", ["persuasion_action", "objection_handling"], 2, "understand_goal_obstacle_option_concern_choice", ["对方希望改善的具体结果", "作息背后的工作、娱乐或睡眠阻力", "建议的适用边界和求助条件"], { sourceMode: "sensitive", sensitiveFlags: ["health"], constraints: ["不得诊断、训诫或保证改善"] }),
    cardSeed("psychology_behavior", "procrastination_small_start", "拖延任务的小启动", "与总拖延一项任务的朋友讨论一次十分钟小启动。", "觉得任务太大、又抗拒方法论的朋友", "共同设计可退出的小实验，而非证明对方自制力差", ["persuasion_action", "objection_handling"], 2, "understand_goal_obstacle_option_concern_choice", ["拖延发生在任务哪一步", "对方真正担心的成本或失败", "十分钟实验如何定义完成和退出"]),
    cardSeed("relationships", "shared_chores_rule", "共同家务规则", "与家人讨论建立一套共同家务分配规则。", "对现状也不满意但担心不公平的家人", "从共同目标和现实限制出发共拟方案", ["persuasion_action", "dialogue_response"], 2, "shared_goal_facts_concerns_co_design", ["当前家务事实而非人格评价", "双方时间、能力和偏好", "试行、复盘与调整方式"]),
    cardSeed("workplace_organization", "new_process_two_week_trial", "新流程两周试行", "说服团队给一项新流程两周试运行时间。", "担心切换成本和额外工作的团队成员", "以小实验、指标和退出条件降低阻力", ["persuasion_action", "objection_handling"], 3, "counterpart_goal_evidence_experiment_risk_request", ["现流程的可见问题", "切换成本和受影响角色", "两周试行的指标与退出条件"]),
    cardSeed("business_entrepreneurship", "customer_interviews_before_build", "开发前先访谈顾客", "说服搭档在继续开发前完成五次顾客访谈。", "急于上线、担心耽误进度的创业搭档", "争取一个有边界的需求验证动作", ["persuasion_action", "objection_handling"], 3, "counterpart_goal_evidence_experiment_risk_request", ["双方共同想降低的风险", "访谈能回答和不能回答的问题", "五次访谈的时间成本与完成标准"]),
    cardSeed("economics_finance", "household_savings_conversation", "家庭储蓄讨论", "与伴侣讨论建立一个双方都能接受的应急储蓄目标。", "收入与消费偏好不同的伴侣", "共同明确目标、负担和调整机制", ["persuasion_action", "dialogue_response"], 3, "shared_goal_facts_concerns_co_design", ["双方担心的风险和优先事项", "可承受金额需要哪些真实数据", "目标调整和重大支出的例外"], { sourceMode: "sensitive", sensitiveFlags: ["finance"], constraints: ["不得替对方做具体投资决定"] }),
    cardSeed("technology_ai", "ai_documentation_pilot", "AI 文档助手试行", "说服团队试行 AI 文档助手，同时建立复核和隐私边界。", "重视效率但担心错误与数据风险的同事", "争取有限范围试验，不推动无条件采用", ["persuasion_action", "proposal"], 4, "counterpart_goal_evidence_experiment_risk_request", ["适合试行的低风险任务", "错误、隐私和责任顾虑", "人工复核、禁用范围和退出指标"]),
    cardSeed("society_public", "food_waste_small_actions", "减少食物浪费", "与合租伙伴讨论试行一项减少食物浪费的共同规则。", "担心规则麻烦、生活习惯不同的合租伙伴", "共同选择一项低成本、可调整行动", ["persuasion_action", "dialogue_response"], 2, "shared_goal_facts_concerns_co_design", ["你们真实浪费发生在哪里", "规则增加的时间或自由成本", "怎样试行并用事实复盘"]),
    cardSeed("culture_media", "try_unfamiliar_museum", "尝试陌生博物馆", "邀请对博物馆没兴趣的朋友尝试一次短时参观。", "认为博物馆枯燥又怕被安排的朋友", "从对方兴趣出发提出可拒绝的体验方案", ["persuasion_action", "objection_handling"], 2, "understand_goal_obstacle_option_concern_choice", ["对方不喜欢的具体原因", "展览与其兴趣可能有哪些真实连接", "时长、费用和随时离开的安排"]),
    cardSeed("science_nature", "verify_health_information", "核验健康信息", "劝家人先核验一条健康信息，再决定是否照做。", "相信熟人经验、对权威也有疑虑的家人", "推动核验行动，不争夺对方最终决定权", ["persuasion_action", "objection_handling"], 3, "understand_goal_obstacle_option_concern_choice", ["信息原始来源与适用对象", "家人信任该说法的原因", "官方或专业咨询的低成本入口"], { sourceMode: "sensitive", sensitiveFlags: ["health"], constraints: ["不得诊断或替代专业医疗意见"] }),
    cardSeed("history_civilization", "digitize_family_photos", "整理家庭老照片", "邀请家人一起数字化一小批老照片并补充口述信息。", "担心麻烦或隐私泄露的家人", "共同确定范围、权限和一次小行动", ["persuasion_action", "proposal"], 2, "shared_goal_facts_concerns_co_design", ["保存的共同价值", "时间成本、隐私和所有权顾虑", "第一批范围与备份规则"]),
    cardSeed("philosophy_values", "shared_donation_decision", "共同捐助的价值选择", "与家人讨论一笔共同捐助应如何选择方向。", "价值优先级不同、都希望资金有效的家人", "用共同标准协商，不把偏好道德化", ["persuasion_action", "dialogue_response"], 4, "shared_goal_facts_concerns_co_design", ["双方共享和不同的价值目标", "机构透明度与效果如何核验", "金额、方向和复盘的选择边界"]),
  ]),
  ...group("video_monologue", [
    cardSeed("personal_life", "weekly_review_without_self_attack", "不把复盘变成自责", "面向总在周末责备自己的人，讲清怎样做一次不自我攻击的周复盘。", "计划经常落空的年轻人", "纠正一个误区并给出一项当天可试动作", ["method_teaching", "viewpoint_argument"], 2, "hook_problem_core_example_action", ["复盘、评价与自责的区别", "可靠方法中的最小步骤", "建议在哪些状态下需要降低要求"]),
    cardSeed("psychology_behavior", "self_control_environment_design", "自制力与环境设计", "面向常被手机打断学习的人，讲“自制力与环境设计”。", "经常被手机打断学习的普通年轻人", "让观众理解一个机制并获得一项低成本行动", ["mechanism_explanation", "method_teaching"], 2, "hook_misconception_mechanism_example_action", ["自制力、意志力和习惯如何区分", "即时奖励或环境线索的可靠解释", "建议可能无效的情境"]),
    cardSeed("relationships", "unsolicited_advice_backfires", "未经请求的建议", "用三分钟解释：为什么好心建议有时会让人更抗拒？", "习惯一听到问题就给方案的人", "说明互动机制并提供一个先确认需求的动作", ["mechanism_explanation", "method_teaching"], 2, "hook_misconception_mechanism_example_action", ["建议、支持与控制感的关系", "沟通研究或可靠案例", "紧急安全情境的例外"]),
    cardSeed("workplace_organization", "conclusion_first_reporting", "汇报中的结论先行", "面向职场新人解释：结论先行不等于省略过程。", "容易从背景讲起的职场新人", "纠正误区并提供一次汇报检查动作", ["concept_explanation", "method_teaching"], 2, "hook_problem_core_example_action", ["结论先行的适用任务", "背景与证据应放在哪里", "探索性讨论为何可能不同"]),
    cardSeed("business_entrepreneurship", "mvp_not_careless", "最小可行产品不是粗制滥造", "向创业初学者讲清：MVP 为什么不等于随便做一个半成品？", "第一次做产品验证的人", "解释验证目的、最低质量与边界", ["concept_explanation", "mechanism_explanation"], 3, "hook_misconception_mechanism_example_action", ["可靠来源如何定义 MVP", "可验证假设与最低体验", "安全、信任和品牌风险的边界"]),
    cardSeed("economics_finance", "cheap_not_value", "便宜不等于划算", "讲清“为什么便宜不等于划算”。", "容易只看标价做购买决定的消费者", "提供一个不涉及具体产品推荐的判断框架", ["concept_explanation", "method_teaching"], 2, "contrast_standard_example_check", ["总成本、机会成本和使用频率", "两个可核验的生活对比例子", "预算有限时框架的边界"]),
    cardSeed("technology_ai", "ai_hallucination_check", "AI 输出的核验", "面向学生解释：为什么看起来流畅的 AI 回答仍需要核验？", "刚开始用生成式 AI 写作和学习的学生", "说明错误风险并给出一个核验动作", ["mechanism_explanation", "method_teaching"], 2, "hook_misconception_mechanism_example_action", ["可靠来源如何描述生成错误", "一个可复现但不夸大的例子", "哪些高风险任务不能只靠一次核验"]),
    cardSeed("society_public", "confirmation_bias_online_discussion", "网络讨论中的确认偏误", "用三分钟解释“确认偏误如何影响网络讨论”。", "经常参与网络话题讨论的普通用户", "解释一个机制并提供自检动作", ["concept_explanation", "mechanism_explanation"], 3, "hook_misconception_mechanism_example_action", ["确认偏误的可靠定义", "平台环境和个人选择如何共同作用", "一个可核验例子及纠偏限制"]),
    cardSeed("culture_media", "short_story_information_density", "短内容的叙事密度", "向短视频创作者解释：信息多为什么不等于内容密度高？", "容易在短视频里塞入过多观点的创作者", "建立一个取舍标准和删减动作", ["concept_explanation", "method_teaching"], 2, "contrast_standard_example_check", ["信息量、理解成本和叙事目的", "一个短内容对比例子", "不同内容类型对密度的要求"]),
    cardSeed("science_nature", "correlation_not_causation", "相关不等于因果", "用三分钟向普通人解释：看到相关关系时，为什么不能立刻断言因果？", "经常阅读数据新闻的普通观众", "解释判断风险并提供一个追问清单", ["concept_explanation", "mechanism_explanation"], 3, "phenomenon_principle_analogy_example_limit", ["相关与因果的可靠定义", "混杂因素和反向因果的通俗例子", "哪些研究设计能增加但不保证信心"]),
    cardSeed("history_civilization", "verify_viral_history_claim", "核验网络历史说法", "面向历史兴趣者讲：遇到一条爆火历史说法，先检查什么？", "会收藏历史短内容的普通用户", "给出来源核验路径，不判断某条具体说法", ["method_teaching"], 3, "hook_problem_core_example_action", ["原始出处、作者和发布时间", "一手与二手材料的关系", "翻译、断章取义和时代语境"]),
    cardSeed("philosophy_values", "opinion_vs_argument", "意见与论证", "面向网络表达者讲清：有观点为什么还不等于完成了论证？", "愿意表达立场但常停留在态度的人", "让观众用一个问题检查自己的主张", ["concept_explanation", "method_teaching"], 2, "contrast_standard_example_check", ["观点、理由和证据如何区分", "一个不预设立场的对比例子", "价值判断需要说明哪些前提"]),
  ]),
  ...group("podcast_expression", [
    cardSeed("personal_life", "productivity_tools_burden", "效率工具的负担", "独白讨论：效率工具为什么有时反而增加负担？", "不断更换效率工具的普通使用者", "探索工具收益、维护成本和个人边界", ["mechanism_explanation", "viewpoint_argument"], 2, "observation_question_views_experience_open", ["切换、维护和记录成本", "可靠研究或产品案例", "你的真实观察与反例"]),
    cardSeed("psychology_behavior", "boredom_and_creativity", "无聊与创造力", "讨论：无聊是否真的有助于创造力？", "对心理学话题感兴趣的普通听众", "区分个人体验、研究证据和适用条件", ["viewpoint_argument", "mechanism_explanation"], 3, "observation_question_views_experience_open", ["无聊与休息、注意游移的定义", "支持和质疑材料", "任务类型与个体差异"]),
    cardSeed("relationships", "familiar_stranger_ties", "熟人与陌生人社交", "讨论“熟人社交和陌生人社交的不同价值”。", "社交圈相对固定的成年人", "比较连接类型、生活案例和风险边界", ["comparison", "viewpoint_argument"], 2, "scene_compare_case_tradeoff_open", ["不同社会联系如何定义", "可靠研究与生活案例", "安全、隐私和社交负担"]),
    cardSeed("workplace_organization", "remote_work_loneliness", "远程工作与孤独感", "讨论：远程工作带来的自由，为什么有时伴随新的孤独？", "有混合或远程工作经历的听众", "呈现组织与个人两个层面的解释", ["mechanism_explanation", "viewpoint_argument"], 3, "observation_question_views_experience_open", ["孤独、独处和连接感如何区分", "组织研究与个人观察", "岗位、人格和生活条件的差异"]),
    cardSeed("business_entrepreneurship", "startup_failure_story_bias", "创业失败故事的偏差", "讨论：我们从创业失败故事中究竟能学到什么，又容易误学什么？", "喜欢商业案例的普通听众", "探索幸存者偏差、事后解释与可迁移经验", ["case_story", "viewpoint_argument"], 4, "observation_question_views_experience_open", ["案例选择与叙述视角", "可核验商业材料", "哪些经验高度依赖情境"]),
    cardSeed("economics_finance", "consumption_and_identity", "消费与身份表达", "讨论：消费选择在多大程度上是在表达“我是谁”？", "对消费文化有日常观察的听众", "连接经济约束、社会信号与个人体验", ["mechanism_explanation", "viewpoint_argument"], 3, "observation_question_views_experience_open", ["身份表达与功能消费如何区分", "社会科学或市场研究材料", "收入、群体和情境差异"]),
    cardSeed("technology_ai", "ai_collaboration_authorship", "AI 协作与作者身份", "讨论：当 AI 参与创作时，“作者”这个概念发生了什么变化？", "使用或关注生成式 AI 的创作者", "探索工具、责任、署名与原创性", ["concept_explanation", "viewpoint_argument"], 4, "observation_question_views_experience_open", ["作者、工具和编辑责任如何界定", "不同平台或机构的公开规则", "创作类型与贡献程度的差异"]),
    cardSeed("society_public", "public_debate_fatigue", "公共讨论疲劳", "讨论：为什么人们关心公共议题，却又越来越不想参与讨论？", "长期接触新闻和网络争论的听众", "探索信息负担、冲突体验和参与方式", ["mechanism_explanation", "viewpoint_argument"], 3, "observation_question_views_experience_open", ["疲劳、冷漠和自我保护的区别", "媒体或社会研究材料", "低成本参与和退出的边界"]),
    cardSeed("culture_media", "storytelling_changes_judgment", "故事如何改变判断", "从一部作品出发讨论“好故事为什么能改变判断”。", "熟悉这部作品但未研究叙事机制的听众", "连接作品事实、个人体验与叙事影响的另一面", ["case_story", "mechanism_explanation"], 3, "observation_question_views_experience_open", ["作品事实和个人体验", "叙事影响判断的可靠解释", "故事也可能误导的情形"]),
    cardSeed("science_nature", "uncertainty_and_trust", "不确定性与科学信任", "讨论：承认不确定性，会削弱还是增强公众对科学的信任？", "关注科学新闻的普通听众", "比较透明、理解成本与风险沟通", ["comparison", "viewpoint_argument"], 4, "scene_compare_case_tradeoff_open", ["不确定性的不同来源", "风险沟通研究或案例", "议题风险和受众差异"]),
    cardSeed("history_civilization", "nostalgia_and_past", "怀旧中的过去", "讨论：我们怀念的过去，究竟有多少是真实历史，又有多少是选择性记忆？", "容易被怀旧内容触动的听众", "连接个人记忆、媒介叙事与历史材料", ["mechanism_explanation", "viewpoint_argument"], 3, "observation_question_views_experience_open", ["怀旧、记忆和历史证据如何区分", "一个可核验的文化案例", "不同代际经验的边界"]),
    cardSeed("philosophy_values", "efficiency_and_meaning", "效率与有意义的生活", "讨论：当效率成为习惯，我们可能忽略了哪些无法量化的价值？", "重视成长和生产力的普通成年人", "探索效率的价值与限度，不否定工具本身", ["viewpoint_argument", "comparison"], 3, "observation_question_views_experience_open", ["效率服务的目标是什么", "哲学或社会科学视角", "照料、关系与创造等难量化活动"]),
  ]),
  ...group("interview_answer", [
    cardSeed("personal_life", "competing_commitments_priority", "多项承诺的优先级", "回答：请讲一次你必须在多项承诺之间做取舍的经历。", "重视可靠性与判断力的面试官", "证明你能明确标准、沟通影响并承担结果", ["interview_response", "experience_story"], 2, "work_example_reflection_fit", ["哪次真实经历有清楚冲突", "你的判断标准与沟通行动", "结果和仍可改进之处"]),
    cardSeed("psychology_behavior", "manageable_weakness_improvement", "真实弱点与改善", "回答：你的一个明显弱点是什么，你如何改善？", "警惕模板答案的面试官", "用真实影响与持续行动证明自我观察", ["interview_response", "retrospective"], 2, "weakness_impact_action_progress_gap", ["弱点是否真实且与岗位可管理", "它造成过什么具体影响", "已经采取、仍在持续的动作"]),
    cardSeed("relationships", "colleague_disagreement", "与同事意见不一致", "回答：当你和同事意见不一致时会怎么做？", "关注协作成熟度的面试官", "用真实或明确标注的模拟案例说明沟通行动", ["interview_response", "experience_story"], 2, "principle_situation_communication_result_reflection", ["分歧针对事实、目标还是方案", "你如何理解并核对对方观点", "结果与关系如何变化"]),
    cardSeed("workplace_organization", "solve_unfamiliar_problem", "主动解决陌生问题", "回答：请讲一次你主动解决陌生问题的经历。", "关注学习能力与执行力的面试官", "用真实行动展示问题拆解与求证", ["interview_response", "experience_story"], 2, "work_example_reflection_fit", ["问题为何陌生且重要", "你如何搜集信息和验证方向", "结果、反馈与岗位关联"]),
    cardSeed("business_entrepreneurship", "discover_user_need", "识别真实用户需求", "回答：请讲一次你发现对方真正需求与最初说法不同的经历。", "关注用户意识的产品或服务岗位面试官", "证明你会提问、观察和修正假设", ["interview_response", "experience_story"], 3, "work_example_reflection_fit", ["最初说法与真实问题的差异", "你用了哪些提问或证据", "你的判断如何被修正"]),
    cardSeed("economics_finance", "resource_constraint_decision", "资源有限时的决定", "回答：资源不足时，你如何决定先做什么、放弃什么？", "关注成本意识与取舍的面试官", "用真实经历说明标准、沟通和结果", ["interview_response", "experience_story"], 3, "work_example_reflection_fit", ["资源约束的真实程度", "你的取舍标准与备选方案", "结果中哪些可量化、哪些不可"]),
    cardSeed("technology_ai", "learn_new_tool_fast", "快速学习新工具", "回答：请讲一次你需要在短时间内学会新工具的经历。", "关注技术适应和风险意识的面试官", "展示目标拆解、验证和实际应用", ["interview_response", "experience_story"], 2, "work_example_reflection_fit", ["为什么必须学习该工具", "你如何区分教程理解与实际掌握", "应用结果和仍未知部分"]),
    cardSeed("society_public", "fairness_in_team_decision", "团队决定中的公平", "回答：当一个团队决定对不同成员影响不同时，你会如何处理？", "关注公平意识与执行能力的面试官", "用真实或标注的情境说明程序与沟通", ["interview_response"], 4, "principle_situation_communication_result_reflection", ["影响差异如何被发现", "程序公平与结果公平的取舍", "你能决定和需要升级的边界"]),
    cardSeed("culture_media", "communicate_across_backgrounds", "跨背景沟通", "回答：请讲一次你调整表达方式以适应不同背景听众的经历。", "关注沟通适配能力的面试官", "用具体前后变化证明受众意识", ["interview_response", "experience_story"], 3, "work_example_reflection_fit", ["听众与原表达的差距", "你观察到什么并做了哪些调整", "理解效果如何得到反馈"]),
    cardSeed("science_nature", "contradictory_evidence", "面对相互矛盾的证据", "回答：当资料或数据相互矛盾时，你如何继续做判断？", "关注严谨性与不确定性管理的面试官", "展示核验路径、暂定结论和升级条件", ["interview_response", "method_teaching"], 4, "principle_situation_communication_result_reflection", ["矛盾来自来源、口径还是时间", "你如何评估可靠性和补充信息", "何时暂缓决定或请求帮助"]),
    cardSeed("history_civilization", "learn_from_previous_project", "从过去项目迁移经验", "回答：请讲一次你把过去项目的经验用于新问题的经历。", "关注迁移学习能力的面试官", "说明相似性、差异和调整，而非套用经验", ["interview_response", "experience_story"], 3, "work_example_reflection_fit", ["两个情境真正相似的部分", "哪些旧经验不能直接照搬", "调整后的行动和结果"]),
    cardSeed("philosophy_values", "work_value_conflict", "工作中的价值冲突", "回答：当效率与质量、透明与保密等价值发生冲突时，你如何决定？", "关注职业判断与边界的面试官", "用真实或标注的情境说明标准与责任", ["interview_response", "viewpoint_argument"], 4, "principle_situation_communication_result_reflection", ["冲突价值和相关方", "组织规则与个人判断的边界", "你如何记录、沟通和承担结果"]),
  ]),
  ...ADDITIONAL_CARD_SEEDS,
];

function sourceRequirements(mode) {
  if (mode === "none") {
    return ["无需联网检索；只使用真实经历、题卡背景或明确标注的假设", "不得编造数据、职责、结果或他人反应", "把个人观察与普遍结论分开"];
  }
  if (mode === "given") {
    return ["只使用题卡模拟背景中的已知事实", "背景未提供的数据必须明确标记为未知或估计", "不得把模拟数字描述为真实组织数据"];
  }
  if (mode === "light") {
    return ["对话以理解对方为主，不用资料压过对方体验", "如引用外部事实，至少核对一个可靠原始来源", "涉及建议时说明适用边界与选择权"];
  }
  if (mode === "sensitive") {
    return ["至少查阅两个相互独立来源", "至少一个来源来自政府、大学、同行评审材料或专业机构", "记录来源名称、链接、发布日期和适用对象", "明确区分一般信息与个体医疗、法律或投资建议", "检索反方证据、风险或结论边界"];
  }
  return ["至少查阅两个相互独立来源", "至少一个来源来自书籍、论文、大学、政府或专业机构", "记录来源名称、链接以及它支持了什么", "不仅阅读搜索结果摘要", "记录反方证据、相近概念或适用边界"];
}

function researchPrompts(seed, sourceMode) {
  const [first, second, third] = seed.focus;
  if (sourceMode === "none") {
    return [
      "题目真正要求你回答什么，哪些内容不属于本轮？",
      `围绕“${first}”，你能使用哪段真实经历或观察？`,
      `关于“${second}”，哪些细节是事实，哪些只是你的解释？`,
      `“${third}”提示了哪些反例、限制或需要诚实说明的未知？`,
    ];
  }
  if (sourceMode === "given") {
    return [
      "题卡背景中哪些是已知事实，哪些仍然未知？",
      `围绕“${first}”，哪些事实能直接支持结论？`,
      `关于“${second}”，至少比较哪两个选项或解释？`,
      `“${third}”对应什么风险、追问或下一步验证？`,
    ];
  }
  if (sourceMode === "light") {
    return [
      "对方已经明确表达了哪些事实、感受、目标或顾虑？",
      `围绕“${first}”，可以怎样提问而不是直接下结论？`,
      `关于“${second}”，你能分享什么有限且真实的经验？`,
      `“${third}”提示了哪些边界、风险或对方选择权？`,
    ];
  }
  return [
    "可靠来源如何界定题目中的核心概念或判断标准？",
    `围绕“${first}”，两个相互独立来源分别提供什么证据或解释？`,
    `关于“${second}”，可以使用哪个可核验案例、数据或反例？`,
    `“${third}”提示了哪些反方观点、适用条件或不确定性？`,
  ];
}

function timingGuidance(card, structureDefinition) {
  if (card.protocol === "interactive_communication") {
    return structureDefinition.steps.map((step, index) => `第 ${index + 1} 轮附近：${step}`);
  }
  const totalSeconds = PROTOCOLS[card.protocol].stageMinutes.firstDelivery * 60;
  const slice = Math.max(1, Math.floor(totalSeconds / structureDefinition.steps.length));
  return structureDefinition.steps.map((step, index) => {
    const start = index * slice;
    const end = index === structureDefinition.steps.length - 1 ? totalSeconds : (index + 1) * slice;
    return `${start}-${end} 秒：${step}`;
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

export const TASK_CARDS = deepFreeze(
  CARD_SEEDS.map((seed) => {
    const scene = SCENES[seed.scene];
    const domain = DOMAINS[seed.domain];
    const protocol = PROTOCOLS[scene.protocol];
    const structureDefinition = STRUCTURES[seed.structureId];
    const sourceMode = seed.sourceMode ?? scene.sourceMode;
    const stageMinutes = { ...protocol.stageMinutes, ...(seed.stageMinutes ?? {}) };
    const card = {
      id: seed.id,
      version: 1,
      status: "active",
      scene: seed.scene,
      sceneLabel: scene.label,
      domain: seed.domain,
      domainLabel: domain.label,
      topic: seed.topic,
      topicLabel: seed.topicLabel,
      title: seed.title,
      taskTypes: seed.taskTypes,
      taskTypeLabels: seed.taskTypes.map((id) => TASK_TYPES[id]),
      audience: seed.audience,
      purpose: seed.purpose,
      context: seed.context ?? scene.defaultContext,
      protocol: scene.protocol,
      primarySkill: seed.primarySkill ?? scene.primarySkill,
      secondarySkills: seed.secondarySkills ?? scene.secondarySkills,
      difficulty: seed.difficulty,
      estimatedMinutes: Object.values(stageMinutes).reduce((sum, value) => sum + value, 0),
      stageMinutes,
      researchPrompts: researchPrompts(seed, sourceMode),
      sourceMode,
      sourceRequirements: sourceRequirements(sourceMode),
      organizingTemplate: seed.organizingTemplate ?? scene.templates,
      structureId: seed.structureId,
      structureName: structureDefinition.label,
      structureSteps: structureDefinition.steps,
      timingGuidance: [],
      constraints: [...scene.constraints, ...(seed.constraints ?? [])].slice(0, 6),
      completionCriteria: [...scene.criteria, ...(seed.completionCriteria ?? [])].slice(0, 6),
      reviewMetricIds: [...GENERAL_METRICS, ...scene.metrics],
      incompatibilities: scene.incompatibilities,
      sensitiveFlags: seed.sensitiveFlags ?? [],
      baseWeight: 1,
    };
    card.timingGuidance = timingGuidance(card, structureDefinition);
    return card;
  }),
);

function validateCardBank() {
  const requiredStrings = ["id", "scene", "sceneLabel", "domain", "domainLabel", "topic", "topicLabel", "title", "audience", "purpose", "context", "protocol", "primarySkill", "structureId", "structureName", "sourceMode", "status"];
  const requiredArrays = ["taskTypes", "taskTypeLabels", "secondarySkills", "researchPrompts", "sourceRequirements", "organizingTemplate", "structureSteps", "timingGuidance", "constraints", "completionCriteria", "reviewMetricIds", "incompatibilities", "sensitiveFlags"];
  if (TASK_CARDS.length !== 365) {
    throw new Error(`题卡数量必须为 365，当前为 ${TASK_CARDS.length}`);
  }
  const ids = new Set();
  const sceneTopics = new Set();
  const sceneCounts = {};
  const domainCounts = {};
  const matrixCounts = {};
  const protocolIds = new Set();
  const taskTypeIds = new Set();
  const structureIds = new Set();
  const difficultyLevels = new Set();
  for (const card of TASK_CARDS) {
    for (const key of requiredStrings) {
      if (typeof card[key] !== "string" || !card[key].trim()) {
        throw new Error(`${card.id || "未知题卡"} 缺少字符串字段 ${key}`);
      }
    }
    for (const key of requiredArrays) {
      if (!Array.isArray(card[key]) || (key !== "sensitiveFlags" && card[key].length === 0)) {
        throw new Error(`${card.id} 缺少数组字段 ${key}`);
      }
    }
    if (ids.has(card.id)) {
      throw new Error(`题卡 ID 重复：${card.id}`);
    }
    ids.add(card.id);
    const sceneTopic = `${card.scene}:${card.topic}`;
    if (sceneTopics.has(sceneTopic)) {
      throw new Error(`同一场景话题重复：${sceneTopic}`);
    }
    sceneTopics.add(sceneTopic);
    if (!SCENES[card.scene] || !DOMAINS[card.domain] || !PROTOCOLS[card.protocol] || !STRUCTURES[card.structureId]) {
      throw new Error(`${card.id} 引用了无效枚举`);
    }
    if (card.taskTypes.some((id) => !TASK_TYPES[id]) || card.reviewMetricIds.some((id) => !METRICS[id])) {
      throw new Error(`${card.id} 引用了无效任务类型或指标`);
    }
    if (!Number.isInteger(card.difficulty) || card.difficulty < 1 || card.difficulty > 5) {
      throw new Error(`${card.id} 的难度无效`);
    }
    if (card.estimatedMinutes < 8 || card.estimatedMinutes > 40) {
      throw new Error(`${card.id} 的预计总时长超出 8-40 分钟`);
    }
    if (!Object.values(card.stageMinutes).every((value) => Number.isFinite(value) && value >= 0)) {
      throw new Error(`${card.id} 的阶段时长无效`);
    }
    sceneCounts[card.scene] = (sceneCounts[card.scene] ?? 0) + 1;
    domainCounts[card.domain] = (domainCounts[card.domain] ?? 0) + 1;
    const matrixKey = `${card.scene}:${card.domain}`;
    matrixCounts[matrixKey] = (matrixCounts[matrixKey] ?? 0) + 1;
    protocolIds.add(card.protocol);
    structureIds.add(card.structureId);
    difficultyLevels.add(card.difficulty);
    for (const taskType of card.taskTypes) {
      taskTypeIds.add(taskType);
    }
  }
  const sceneValues = Object.keys(SCENES).map((scene) => sceneCounts[scene] ?? 0);
  const domainValues = Object.keys(DOMAINS).map((domain) => domainCounts[domain] ?? 0);
  if (Math.min(...sceneValues) !== 36 || Math.max(...sceneValues) !== 37 || sceneValues.filter((count) => count === 37).length !== 5) {
    throw new Error(`场景分布必须为五类 37 张、五类 36 张，当前为 ${sceneValues.join(",")}`);
  }
  if (Math.min(...domainValues) !== 30 || Math.max(...domainValues) !== 31 || domainValues.filter((count) => count === 31).length !== 5) {
    throw new Error(`领域分布必须为五类 31 张、七类 30 张，当前为 ${domainValues.join(",")}`);
  }
  const matrixValues = [];
  for (const scene of Object.keys(SCENES)) {
    for (const domain of Object.keys(DOMAINS)) {
      matrixValues.push(matrixCounts[`${scene}:${domain}`] ?? 0);
    }
  }
  if (matrixValues.some((count) => count < 3 || count > 4) || matrixValues.filter((count) => count === 4).length !== 5) {
    throw new Error("场景与领域矩阵必须为 115 个三题单元和 5 个四题单元");
  }
  if (protocolIds.size !== Object.keys(PROTOCOLS).length || taskTypeIds.size !== Object.keys(TASK_TYPES).length || structureIds.size !== Object.keys(STRUCTURES).length) {
    throw new Error("年度题库必须覆盖全部协议、任务类型与结构");
  }
  if ([1, 2, 3, 4, 5].some((level) => !difficultyLevels.has(level))) {
    throw new Error("年度题库必须覆盖难度 1-5");
  }
}

validateCardBank();
