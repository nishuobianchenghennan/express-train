/**
 * 调用服务端的 /api/ai 接口：本机运行时是 Express，部署到 Cloudflare Pages 时是 Pages Function。
 * 页面以纯静态方式部署（没有服务端）时，状态查询返回 null，AI 功能自动隐藏。
 *
 * 服务端设了访问码时，每个请求都带上本机保存的访问码。访问码只存在这个浏览器的 localStorage，
 * 不进设置、不随 JSON 导出。
 */

const ACCESS_CODE_KEY = "speak-clearly-ai-access-code";

/** 本机保存的访问码；浏览器禁用存储时视为没有。 */
export function loadAccessCode() {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** 保存访问码；传空串表示清除。 */
export function saveAccessCode(code) {
  try {
    if (code) localStorage.setItem(ACCESS_CODE_KEY, code);
    else localStorage.removeItem(ACCESS_CODE_KEY);
  } catch {
    // 存不下时本次会话仍可用，只是下次需要重新填写
  }
}

function accessHeaders() {
  const code = loadAccessCode();
  return code ? { "X-AI-Access-Code": code } : {};
}

async function send(path, { method = "POST", body } = {}) {
  let response;
  try {
    response = await fetch(`/api/ai${path}`, {
      method,
      cache: "no-store",
      headers: { ...accessHeaders(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("连不上 AI 服务端：本机运行请用 bun run dev 启动；线上部署请检查 Cloudflare Pages 的 Functions 是否部署成功。");
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

/**
 * AI 服务状态：各家是否已配置、模型名、默认服务、能否在网页里改配置（configEditable）、
 * 访问码状态（access：none / ok / required / invalid / unset）；服务端不可用时返回 null。
 */
export async function fetchAiStatus() {
  try {
    const response = await fetch("/api/ai/status", { cache: "no-store", headers: accessHeaders() });
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
