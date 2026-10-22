/**
 * AI 接口的公共部分：本机 Express 路由（routes.js）与 Cloudflare Pages Function（functions/api/ai）共用。
 *
 * 只用 Web 标准 API，不引用 Node 内置模块，两种运行时都能直接打包。
 * 访问码：服务端设了 AI_ACCESS_CODE 时，请求必须带同样的访问码（请求头 X-AI-Access-Code）；
 * 线上部署强制要求设置，没设时 AI 一律不开放，避免别人打开网站就用掉你的模型额度。
 */
import { generateCard, reflectOnTraining, suggestFollowups, synthesizeProfile } from "./service.js";

// 浏览器会为 fetch 自动带上 Sec-Fetch-Site；同源页面为 same-origin，地址栏直接访问为 none
export const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"]);
export const ACCESS_CODE_HEADER = "x-ai-access-code";

/** 模型接口：路径 → (配置, 请求体) → 响应体。 */
export const MODEL_ROUTES = Object.freeze({
  "/cards": async (config, body) => ({
    card: await generateCard({ config, providerId: body.provider, spec: body.spec, profile: body.profile, training: body.training }),
  }),
  "/reflect": (config, body) => reflectOnTraining({
    config, providerId: body.provider, profile: body.profile, training: body.training, log: body.log, facts: body.facts, dismissed: body.dismissed,
  }),
  "/interview": (config, body) => suggestFollowups({ config, providerId: body.provider, survey: body.survey }),
  "/profile": (config, body) => synthesizeProfile({ config, providerId: body.provider, survey: body.survey, followups: body.followups }),
});

/** 逐字节比较，耗时与第一个不同字节的位置无关，避免按响应时间猜访问码。 */
function sameSecret(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

/**
 * 访问码状态。
 *
 * @param {string|undefined} expected 服务端设置的访问码（AI_ACCESS_CODE）
 * @param {string|null|undefined} provided 请求带的访问码
 * @param {{ required?: boolean }} options required 为 true 时（线上部署）没设访问码就不开放
 * @returns {"none"|"unset"|"ok"|"required"|"invalid"} none：不需要；unset：必须设置但没设；ok：通过；required：没带；invalid：不对
 */
export function accessState(expected, provided, { required = false } = {}) {
  const code = typeof expected === "string" ? expected.trim() : "";
  if (!code) return required ? "unset" : "none";
  const given = typeof provided === "string" ? provided.trim() : "";
  if (!given) return "required";
  return sameSecret(code, given) ? "ok" : "invalid";
}

/** 访问码不通过时的状态码与说明。 */
export const ACCESS_ERRORS = Object.freeze({
  unset: [503, "线上部署还没有设置访问码 AI_ACCESS_CODE，AI 暂不开放。请在 Cloudflare 控制台设置后重新部署。"],
  required: [401, "需要访问码：请在设置页的 AI 助手里填写。"],
  invalid: [401, "访问码不对，请在设置页重新填写。"],
});

export function accessAllowed(state) {
  return state === "none" || state === "ok";
}
