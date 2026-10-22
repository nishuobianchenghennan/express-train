/**
 * 设置页填写的 AI 配置：保存在本机的 JSON 文件里（默认项目根目录的 ai-config.local.json，已加入 .gitignore），
 * 可以用环境变量 AI_CONFIG_FILE 改路径。密钥写入后不再返回浏览器。
 *
 * 更新规则：
 * - 字段为 undefined 表示不改；空串表示删除网页填写的值，回到 .env 或默认值；
 * - 密钥留空表示不改，clearKey 为 true 时删除网页填写的密钥；
 * - 接口地址变了必须同时填写新密钥（回到 .env 的地址时一并清除网页密钥），
 *   避免把已保存的密钥发到一个新地址。
 */
import { readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectRoot } from "../config.js";
import { JSON_MODES, clean, describeAiConfig, parseBaseUrl } from "./config.js";
import { AiServiceError } from "./errors.js";

const DEFAULT_FILE = "ai-config.local.json";
const MAX_KEY_LENGTH = 500;
const MAX_MODEL_LENGTH = 100;
const MAX_LABEL_LENGTH = 30;
const MAX_EXTRA_BODY_LENGTH = 2000;
// 模型名只允许常见字符，例如 claude-opus-5-5、qwen-plus-2025-01-25、org/model:tag
const MODEL_PATTERN = /^[\w.:/@-]+$/;

/** 配置文件路径。 */
export function aiConfigPath(env = process.env) {
  return path.resolve(projectRoot, clean(env.AI_CONFIG_FILE) || DEFAULT_FILE);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 只保留认识的字段；文件缺失或损坏时视为空配置。 */
function sanitize(raw) {
  const value = isObject(raw) ? raw : {};
  const pick = (source, keys) => Object.fromEntries(keys.filter((key) => source?.[key] != null).map((key) => [key, source[key]]));
  return {
    anthropic: pick(value.anthropic, ["apiKey", "model"]),
    openai: pick(value.openai, ["label", "baseUrl", "apiKey", "model", "jsonMode", "extraBody"]),
  };
}

export function loadStoredAiConfig(file) {
  try {
    return sanitize(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return sanitize(null);
  }
}

/** 先写临时文件再改名，避免写到一半留下损坏的配置；POSIX 上只允许本人读写。 */
export async function saveStoredAiConfig(file, stored) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

function invalid(message) {
  return new AiServiceError(message, 400);
}

/** 文本字段：undefined 不改，空串删除，否则校验后写入。 */
function applyText(target, key, value, validate) {
  if (value === undefined) return;
  if (typeof value !== "string") throw invalid("配置内容格式不对。");
  const text = value.trim();
  if (!text) delete target[key];
  else target[key] = validate(text);
}

function validModel(text) {
  if (text.length > MAX_MODEL_LENGTH || !MODEL_PATTERN.test(text)) throw invalid("模型名只能包含字母、数字和 . _ - : / @，且不超过 100 个字符。");
  return text;
}

function validKey(text) {
  if (text.length > MAX_KEY_LENGTH || /\s/.test(text)) throw invalid("密钥格式不对：不能包含空格或换行。");
  return text;
}

/**
 * 把设置页提交的修改合并进已保存的配置。
 *
 * @param {object} stored 当前已保存的网页配置
 * @param {object} update 提交的修改（结构见文件头）
 * @param {NodeJS.ProcessEnv} env 环境变量（判断地址是否变化要用合并后的值）
 * @returns {object} 新的网页配置
 */
export function mergeAiConfigUpdate(stored, update, env = process.env) {
  if (!isObject(update)) throw invalid("配置内容格式不对。");
  const next = sanitize(structuredClone(stored));

  const anthropic = isObject(update.anthropic) ? update.anthropic : {};
  applyText(next.anthropic, "model", anthropic.model, validModel);
  if (anthropic.clearKey === true) delete next.anthropic.apiKey;
  if (typeof anthropic.apiKey === "string" && anthropic.apiKey.trim()) next.anthropic.apiKey = validKey(anthropic.apiKey.trim());

  const openai = isObject(update.openai) ? update.openai : {};
  const before = describeAiConfig(env, stored).openai.baseUrl.value;
  applyText(next.openai, "label", openai.label, (text) => text.slice(0, MAX_LABEL_LENGTH));
  applyText(next.openai, "baseUrl", openai.baseUrl, (text) => {
    const url = parseBaseUrl(text);
    if (!url) throw invalid("接口地址必须是 https 地址（本机服务可以用 http）。");
    return url;
  });
  applyText(next.openai, "model", openai.model, validModel);
  applyText(next.openai, "jsonMode", openai.jsonMode, (text) => {
    if (!JSON_MODES.includes(text)) throw invalid("输出格式只能是 json_schema 或 json_object。");
    return text;
  });
  if (openai.extraBody !== undefined) {
    if (typeof openai.extraBody !== "string") throw invalid("附加参数必须是 JSON 对象。");
    const text = openai.extraBody.trim();
    if (!text) delete next.openai.extraBody;
    else {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw invalid("附加参数不是合法的 JSON。");
      }
      if (!isObject(parsed) || text.length > MAX_EXTRA_BODY_LENGTH) throw invalid("附加参数必须是不超过 2000 字符的 JSON 对象，例如 {\"enable_thinking\": false}。");
      next.openai.extraBody = parsed;
    }
  }
  if (openai.clearKey === true) delete next.openai.apiKey;
  const newKey = typeof openai.apiKey === "string" && openai.apiKey.trim() ? validKey(openai.apiKey.trim()) : "";
  if (newKey) next.openai.apiKey = newKey;

  const after = describeAiConfig(env, next).openai.baseUrl.value;
  if (parseBaseUrl(after) !== parseBaseUrl(before) && !newKey) {
    // 回到 .env 的地址：网页密钥一并清除，恢复 .env 里成对的地址与密钥
    if (next.openai.baseUrl == null) delete next.openai.apiKey;
    else throw invalid("更换接口地址时，请同时重新填写这个地址的密钥。");
  }
  // .env 的密钥只发往 .env 的地址：网页填了别的地址，就必须配网页填写的密钥
  const merged = describeAiConfig(env, next).openai;
  if (merged.baseUrl.source === "web" && merged.key.source === "env" && parseBaseUrl(merged.baseUrl.value) !== parseBaseUrl(env.OPENAI_COMPAT_BASE_URL)) {
    throw invalid("网页填写的接口地址需要配网页填写的密钥，不能沿用 .env 里另一个地址的密钥。");
  }
  return next;
}
