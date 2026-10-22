/**
 * AI 服务错误：message 面向用户，可以直接显示；status 为返回给浏览器的 HTTP 状态码。
 */
export class AiServiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
  }
}

/**
 * 把模型返回的文本解析为 JSON 对象；兼容外层包了 ```json 代码块的输出。
 *
 * @param {string} text 模型输出
 * @returns {object} 解析结果
 */
export function parseJsonObject(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(unfenced);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // 统一在下方抛出
  }
  throw new AiServiceError("模型返回的内容不是合法的 JSON。");
}
