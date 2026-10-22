/**
 * Claude：通过 Anthropic 官方 SDK 调用，结构化输出保证返回 JSON。
 *
 * SDK 在第一次调用时动态加载：没有安装依赖时服务照常启动，只有 AI 请求返回 503。
 * 密钥来自设置页或 .env（provider.apiKey）；为空时由 SDK 自己从环境变量读取（含 ANTHROPIC_AUTH_TOKEN）。
 */
import { AiServiceError, parseJsonObject } from "../errors.js";

const REQUEST_TIMEOUT_MS = 120_000;
// 安全分类器误拒时，由服务端按拒答类别换模型重试，而不是直接失败
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let sdkPromise = null;
// 设置页换了密钥时重建客户端
let cachedClient = null;

async function loadSdk() {
  sdkPromise ??= import("@anthropic-ai/sdk").then((module) => module.default);
  try {
    return await sdkPromise;
  } catch {
    sdkPromise = null;
    throw new AiServiceError("服务端还没有安装 @anthropic-ai/sdk，请先运行 bun install。", 503);
  }
}

function clientFor(Anthropic, apiKey) {
  if (cachedClient?.apiKey !== apiKey) {
    cachedClient = { apiKey, client: new Anthropic({ ...(apiKey ? { apiKey } : {}), timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 }) };
  }
  return cachedClient.client;
}

/** 把 SDK 的错误类型翻译成面向用户的说明；上游原文只写服务端日志。 */
function toServiceError(Anthropic, error) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiServiceError("Claude 密钥无效或没有权限，请检查设置页或 .env 中的 Claude 密钥。");
  }
  if (error instanceof Anthropic.RateLimitError) return new AiServiceError("Claude 请求过于频繁或额度不足，请稍后再试。", 429);
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    console.error("[ai] Claude 请求被拒绝：", error.message);
    return new AiServiceError("Claude 拒绝了请求参数，请检查设置页或 .env 中的模型名；详细原因见服务端日志。");
  }
  if (error instanceof Anthropic.APIConnectionError) return new AiServiceError("连不上 Claude 服务，请检查网络。");
  if (error instanceof Anthropic.APIError) {
    console.error("[ai] Claude 服务错误：", error.status, error.message);
    return new AiServiceError(`Claude 服务出错（${error.status ?? "未知状态"}），请稍后重试。`);
  }
  return error;
}

/**
 * 调用 Claude 并返回符合 schema 的 JSON 对象。
 *
 * @param {object} provider 服务配置（model）
 * @param {{ system: string, prompt: string, schema: object, effort: string }} request 请求内容
 * @returns {Promise<object>} 解析后的 JSON
 */
export async function generateJsonWithClaude(provider, { system, prompt, schema, effort }) {
  const Anthropic = await loadSdk();
  const client = clientFor(Anthropic, provider.apiKey);
  let response;
  try {
    response = await client.beta.messages.create({
      model: provider.model,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort, format: { type: "json_schema", schema } },
    });
  } catch (error) {
    throw toServiceError(Anthropic, error);
  }
  if (response.stop_reason === "refusal") throw new AiServiceError("模型拒绝了这次请求，请稍后重试或换一种模型服务。");
  if (response.stop_reason === "max_tokens") throw new AiServiceError("模型输出过长被截断，请重试。");
  const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  return parseJsonObject(text);
}
