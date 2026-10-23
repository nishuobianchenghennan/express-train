/**
 * 调用服务端的 /api/ai 接口：本机运行时是 Express，部署到 Cloudflare Pages 时是 Pages Function。
 * 页面以纯静态方式部署（没有服务端）时，状态查询返回 null，AI 功能自动隐藏。
 *
 * 服务端设了访问码时，每个请求都带上本机保存的访问码。访问码只存在这个浏览器的 localStorage，
 * 不进设置、不随 JSON 导出。
 *
 * Android App 的页面打包在安装包里，没有同源的服务端：请求发往用户在设置页填写的服务地址
 * （部署好的 Cloudflare Pages 网站），地址与访问码一样只存在本机。
 */
import { isNativeApp } from "../platform.js";

const ACCESS_CODE_KEY = "speak-clearly-ai-access-code";
const AI_SERVER_KEY = "speak-clearly-ai-server";

/** App 里保存的服务地址（只含协议与域名）；网页里不用。 */
export function loadAiServer() {
  try {
    return localStorage.getItem(AI_SERVER_KEY) ?? "";
  } catch {
    return "";
  }
}

/** 保存服务地址；传空串表示清除。 */
export function saveAiServer(origin) {
  try {
    if (origin) localStorage.setItem(AI_SERVER_KEY, origin);
    else localStorage.removeItem(AI_SERVER_KEY);
  } catch {
    // 存不下时本次会话仍可用，只是下次需要重新填写
  }
}

/** 接口地址：网页里同源；App 里拼上服务地址，还没填时为 null。 */
function apiUrl(path) {
  if (!isNativeApp) return `/api/ai${path}`;
  const server = loadAiServer();
  return server ? `${server}/api/ai${path}` : null;
}

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
  const url = apiUrl(path);
  if (!url) throw new Error("先在设置页的 AI 助手里填写服务地址。");
  let response;
  try {
    response = await fetch(url, {
      method,
      cache: "no-store",
      headers: { ...accessHeaders(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(isNativeApp
      ? "连不上 AI 服务端：请检查网络，以及设置页里的服务地址能否在手机浏览器打开。"
      : "连不上 AI 服务端：本机运行请用 bun run dev 启动；线上部署请检查 Cloudflare Pages 的 Functions 是否部署成功。");
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
  const url = apiUrl("/status");
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store", headers: accessHeaders() });
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
