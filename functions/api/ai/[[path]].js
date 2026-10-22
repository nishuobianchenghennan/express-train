/**
 * Cloudflare Pages Function：线上部署时的 /api/ai/* 接口（本机运行时由 src/ai/routes.js 提供）。
 *
 * - 模型服务与访问码从 Cloudflare 控制台的 Settings → Variables and Secrets 读取（context.env），
 *   变量名与 .env 相同；密钥请设成加密变量（Encrypt）。
 * - 线上强制要求访问码 AI_ACCESS_CODE：没设时 AI 一律不开放，避免别人打开网站就用掉你的模型额度。
 * - 线上不能在网页里改模型服务配置（没有可写的文件），/config 一律拒绝。
 */
import { ACCESS_CODE_HEADER, ACCESS_ERRORS, ALLOWED_FETCH_SITES, MODEL_ROUTES, accessAllowed, accessState } from "../../../src/ai/api.js";
import { publicAiStatus, readAiConfig } from "../../../src/ai/config.js";
import { AiServiceError } from "../../../src/ai/errors.js";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function onRequest({ request, env, params }) {
  const path = `/${[params.path ?? []].flat().join("/")}`;
  const site = request.headers.get("sec-fetch-site");
  if (site && !ALLOWED_FETCH_SITES.has(site)) return json(403, { error: "只接受来自本应用页面的请求。" });

  const config = readAiConfig(env);
  const access = accessState(env.AI_ACCESS_CODE, request.headers.get(ACCESS_CODE_HEADER), { required: true });

  if (path === "/status" && request.method === "GET") {
    return json(200, { ...publicAiStatus(config), configEditable: false, access });
  }
  if (path === "/config") {
    return json(403, { error: "线上部署不能在网页里修改模型服务，请在 Cloudflare 控制台的 Settings → Variables and Secrets 中设置。" });
  }
  const run = MODEL_ROUTES[path];
  if (!run || request.method !== "POST") return json(404, { error: "Not Found" });
  if (!accessAllowed(access)) {
    const [status, message] = ACCESS_ERRORS[access];
    return json(status, { error: message });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "请求内容不是合法的 JSON。" });
  }
  try {
    return json(200, await run(config, body && typeof body === "object" ? body : {}));
  } catch (error) {
    if (error instanceof AiServiceError) return json(error.status, { error: error.message });
    console.error("[ai]", error);
    return json(500, { error: "Internal Server Error" });
  }
}
