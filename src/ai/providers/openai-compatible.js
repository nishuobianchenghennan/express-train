/**
 * OpenAI 兼容接口（通义千问、DeepSeek、智谱、豆包等）：POST {base}/chat/completions。
 *
 * json_schema 模式要求服务端严格按 schema 输出；只支持 json_object 的服务（如 DeepSeek）
 * 把 schema 写进提示。两种模式的输出都会再经过服务端校验器。
 */
import { AiServiceError, parseJsonObject } from "../errors.js";

const REQUEST_TIMEOUT_MS = 120_000;

/**
 * 调用兼容接口并返回 JSON 对象。
 *
 * @param {object} provider 服务配置（baseUrl / apiKey / model / jsonMode / extraBody / label）
 * @param {{ system: string, prompt: string, schema: object, schemaName: string }} request 请求内容
 * @returns {Promise<object>} 解析后的 JSON
 */
export async function generateJsonWithOpenAiCompatible(provider, { system, prompt, schema, schemaName }) {
  const strict = provider.jsonMode === "json_schema";
  const responseFormat = strict ? { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } } : { type: "json_object" };
  const userContent = strict ? prompt : `${prompt}\n\n输出必须是一个 JSON 对象，结构遵循以下 JSON Schema：\n${JSON.stringify(schema)}`;
  let response;
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      // 附加参数放在前面，不能覆盖模型、消息与输出格式
      body: JSON.stringify({
        ...provider.extraBody,
        model: provider.model,
        messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
        response_format: responseFormat,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AiServiceError(error?.name === "TimeoutError" ? `${provider.label} 响应超时，请稍后重试。` : `连不上 ${provider.label}，请检查网络与接口地址。`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`[ai] ${provider.label} HTTP ${response.status}：`, data?.error?.message ?? "");
    if (response.status === 401 || response.status === 403) throw new AiServiceError(`${provider.label} 密钥无效或没有权限，请检查设置页或 .env 中的密钥。`);
    if (response.status === 429) throw new AiServiceError(`${provider.label} 请求过于频繁或额度不足，请稍后再试。`, 429);
    throw new AiServiceError(`${provider.label} 返回错误（${response.status}），详细原因见服务端日志。`);
  }
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "length") throw new AiServiceError("模型输出过长被截断，请重试。");
  return parseJsonObject(choice?.message?.content ?? "");
}
