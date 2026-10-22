/**
 * AI 模型服务配置：环境变量（.env）打底，设置页网页填写的值（本机配置文件）逐项覆盖。
 *
 * 密钥只在服务端使用，`publicAiStatus` 返回给浏览器的信息不含密钥与接口地址；
 * `describeAiConfig` 供设置页表单使用，只说明密钥是否已配置、来自哪里，不返回密钥本身。
 */

export const PROVIDER_IDS = Object.freeze(["anthropic", "openai"]);
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
export const JSON_MODES = Object.freeze(["json_schema", "json_object"]);

export function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** 只接受 https 地址；本机地址允许 http，方便接本地推理服务。不合格时返回空串。 */
export function parseBaseUrl(value) {
  const raw = clean(value).replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || (local && url.protocol === "http:") ? raw : "";
  } catch {
    return "";
  }
}

/** 附加请求体必须是 JSON 对象，例如 {"enable_thinking": false}；解析失败时忽略。 */
function parseExtraBody(value) {
  const raw = clean(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** 各字段的值与来源：网页填写（web）优先，其次 .env（env），都没有时为默认值（default）。 */
function pickField(webValue, envValue) {
  if (clean(webValue)) return { value: clean(webValue), source: "web" };
  if (clean(envValue)) return { value: clean(envValue), source: "env" };
  return { value: "", source: "default" };
}

/** 逐项合并后的原始字段，readAiConfig 与 describeAiConfig 共用，保证两者口径一致。 */
function resolveFields(env, stored) {
  const web = { anthropic: stored?.anthropic ?? {}, openai: stored?.openai ?? {} };
  const extraBody = web.openai.extraBody && typeof web.openai.extraBody === "object"
    ? { value: JSON.stringify(web.openai.extraBody), source: "web" }
    : pickField("", env.OPENAI_COMPAT_EXTRA_BODY);
  return {
    anthropic: {
      model: pickField(web.anthropic.model, env.ANTHROPIC_MODEL),
      apiKey: pickField(web.anthropic.apiKey, env.ANTHROPIC_API_KEY),
    },
    openai: {
      label: pickField(web.openai.label, env.OPENAI_COMPAT_LABEL),
      baseUrl: pickField(web.openai.baseUrl, env.OPENAI_COMPAT_BASE_URL),
      apiKey: pickField(web.openai.apiKey, env.OPENAI_COMPAT_API_KEY),
      model: pickField(web.openai.model, env.OPENAI_COMPAT_MODEL),
      jsonMode: pickField(web.openai.jsonMode, env.OPENAI_COMPAT_JSON_MODE),
      extraBody,
    },
  };
}

/**
 * 读取 AI 配置。
 *
 * @param {NodeJS.ProcessEnv} env 环境变量
 * @param {object} stored 设置页填写、保存在本机配置文件里的值（见 store.js）
 * @returns {{ providers: Record<string, object>, defaultProvider: string|null }} 配置
 */
export function readAiConfig(env = process.env, stored = {}) {
  const fields = resolveFields(env, stored);
  const anthropic = {
    id: "anthropic",
    label: "Claude",
    model: fields.anthropic.model.value || DEFAULT_ANTHROPIC_MODEL,
    // 为空时 SDK 自己从环境变量读取凭据（含 ANTHROPIC_AUTH_TOKEN）
    apiKey: fields.anthropic.apiKey.value,
    configured: Boolean(fields.anthropic.apiKey.value || clean(env.ANTHROPIC_AUTH_TOKEN)),
  };
  const jsonMode = fields.openai.jsonMode.value;
  const openai = {
    id: "openai",
    label: fields.openai.label.value || "OpenAI 兼容接口",
    model: fields.openai.model.value,
    baseUrl: parseBaseUrl(fields.openai.baseUrl.value),
    apiKey: fields.openai.apiKey.value,
    jsonMode: JSON_MODES.includes(jsonMode) ? jsonMode : "json_schema",
    extraBody: parseExtraBody(fields.openai.extraBody.value),
  };
  openai.configured = Boolean(openai.baseUrl && openai.apiKey && openai.model);
  const providers = { anthropic, openai };
  const requested = clean(env.AI_DEFAULT_PROVIDER);
  const defaultProvider = providers[requested]?.configured ? requested : PROVIDER_IDS.find((id) => providers[id].configured) ?? null;
  return { providers, defaultProvider };
}

/**
 * 解析本次请求使用的服务：请求指定且已配置时用它，否则用默认服务。
 *
 * @returns {object|null} 服务配置；都没配置时返回 null
 */
export function resolveProvider(config, requested) {
  const chosen = config.providers[requested];
  if (chosen?.configured) return chosen;
  return config.defaultProvider ? config.providers[config.defaultProvider] : null;
}

/**
 * 设置页表单用的配置说明：每项的值与来源；密钥只说明是否已配置、来自哪里。
 *
 * @returns {object} { anthropic: { model, key }, openai: { label, baseUrl, model, jsonMode, extraBody, key } }
 */
export function describeAiConfig(env = process.env, stored = {}) {
  const fields = resolveFields(env, stored);
  const key = (field) => ({ set: Boolean(field.value), source: field.value ? field.source : null });
  const anthropicKey = key(fields.anthropic.apiKey);
  // 只用 ANTHROPIC_AUTH_TOKEN 时也算已配置
  if (!anthropicKey.set && clean(env.ANTHROPIC_AUTH_TOKEN)) Object.assign(anthropicKey, { set: true, source: "env" });
  return {
    anthropic: { model: fields.anthropic.model, key: anthropicKey },
    openai: {
      label: fields.openai.label,
      baseUrl: fields.openai.baseUrl,
      model: fields.openai.model,
      jsonMode: fields.openai.jsonMode,
      extraBody: fields.openai.extraBody,
      key: key(fields.openai.apiKey),
    },
  };
}

/** 返回给浏览器的公开状态：服务名、模型名、是否已配置。 */
export function publicAiStatus(config) {
  return {
    defaultProvider: config.defaultProvider,
    providers: PROVIDER_IDS.map((id) => {
      const provider = config.providers[id];
      return { id, label: provider.label, model: provider.model || null, configured: provider.configured };
    }),
  };
}
