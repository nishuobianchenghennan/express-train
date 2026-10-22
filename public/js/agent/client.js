/**
 * 调用本机服务端的 /api/ai 接口。页面以纯静态方式部署（没有服务端）时，状态查询返回 null，AI 功能自动隐藏。
 */

async function send(path, { method = "POST", body } = {}) {
  let response;
  try {
    response = await fetch(`/api/ai${path}`, {
      method,
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("连不上本机服务，请确认应用是通过 bun run dev 启动的。");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `AI 请求失败（${response.status}）`);
  return data;
}

function post(path, body) {
  return send(path, { body });
}

/** 设置页表单用的配置说明（不含密钥）；只能在运行服务的电脑上读取。 */
export function fetchAiConfig() {
  return send("/config", { method: "GET" });
}

/** 保存设置页填写的配置；返回保存后的配置说明。 */
export function saveAiConfig(update) {
  return send("/config", { method: "PUT", body: update });
}

/** AI 服务状态：各家是否已配置、模型名、默认服务；服务端不可用时返回 null。 */
export async function fetchAiStatus() {
  try {
    const response = await fetch("/api/ai/status", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data?.providers) ? data : null;
  } catch {
    return null;
  }
}

export function requestGeneratedCard({ provider, spec, profile, training }) {
  return post("/cards", { provider, spec, profile, training });
}

export function requestReflection({ provider, profile, training, log, facts, dismissed }) {
  return post("/reflect", { provider, profile, training, log, facts, dismissed });
}

export function requestFollowups({ provider, survey }) {
  return post("/interview", { provider, survey });
}

export function requestProfileSynthesis({ provider, survey, followups }) {
  return post("/profile", { provider, survey, followups });
}
