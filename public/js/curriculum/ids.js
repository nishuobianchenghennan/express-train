/**
 * 课程体系的固定标识。只放常量，不依赖其它模块，供数据文件与校验器共同引用。
 */

/** 30 课的 ID，按课序排列（设计 §5.1）。 */
export const PARADIGM_IDS = Object.freeze([
  "conclusion_first", "pyramid", "self_intro", "concrete", "called_on", "small_talk", "active_listening",
  "explain_concept", "analogy", "teach_method", "progress_report", "bad_news", "story", "research_narrative",
  "argument", "tradeoff", "handle_challenge", "bridging", "roundtable", "facilitate", "toast",
  "ask_resources", "say_no", "feedback", "resolve_conflict", "negotiate", "inquiry",
  "value_pitch", "investor_pitch", "vision",
]);

/** 每个阶段的课数：敢开口、讲清楚、能交锋、能推动、创业者。 */
export const STAGE_SIZES = Object.freeze([7, 7, 7, 6, 3]);

/** 没有公认经典框架、允许 frameworks 为空的课。 */
export const FRAMEWORK_OPTIONAL = Object.freeze(["analogy", "facilitate"]);

export const LINE_IDS = Object.freeze(["academic", "life", "bridge", "founder"]);

/** 语境 ID 前缀与线的对应关系。 */
export const LINE_PREFIX = Object.freeze({ A: "academic", L: "life", B: "bridge", F: "founder" });

/** 各线语境数量（设计 §4.3）。 */
export const LINE_CONTEXT_COUNTS = Object.freeze({ academic: 15, life: 11, bridge: 10, founder: 20 });

export const CAREER_STAGES = Object.freeze(["phd", "bridge", "founder"]);

/** 回合检查清单中固定追加的一项：每个回合都有打断，所以总是检查。 */
export const PRESSURE_CHECK_ID = "handled_pressure";

/** 第 1 期题量下限（设计 §6.4）。 */
export const MIN_TOTAL_CARDS = 112;
export const MIN_CARDS_PER_CONTEXT = 2;
export const MIN_CARDS_PER_PARADIGM = 2;

/** 示范与最优方案的语速上限（字/秒），沿用现有学习模式的约束。 */
export const MAX_CHARS_PER_SECOND = 4.6;
