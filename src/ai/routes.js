/**
 * /api/ai 路由。
 *
 * 保护：拒绝跨站请求；设了 AI_ACCESS_CODE 时校验访问码（本机运行可以不设）；同时最多 2 个进行中的模型请求；
 * 错误只返回面向用户的说明。
 * 配置接口（/config）只接受本机直接访问：连接来自回环地址、Host 是本机名、且没有经过反向代理，
 * 防止局域网、代理或 DNS 重绑定的页面改写密钥和接口地址。
 */
import { Router } from "express";

import { ACCESS_CODE_HEADER, ACCESS_ERRORS, ALLOWED_FETCH_SITES, MODEL_ROUTES, accessAllowed, accessState } from "./api.js";
import { describeAiConfig, publicAiStatus, readAiConfig } from "./config.js";
import { AiServiceError } from "./errors.js";
import { aiConfigPath, loadStoredAiConfig, mergeAiConfigUpdate, saveStoredAiConfig } from "./store.js";

const MAX_IN_FLIGHT = 2;
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** 只允许在运行服务的这台电脑上直接访问。 */
function localOnly(request, response, next) {
  const proxied = request.get("x-forwarded-for") || request.get("forwarded");
  if (proxied || !LOOPBACK_ADDRESSES.has(request.socket.remoteAddress) || !LOCAL_HOSTNAMES.has(request.hostname)) {
    response.status(403).json({ error: "只能在运行服务的这台电脑上，用 localhost 或 127.0.0.1 打开页面修改 AI 配置；也可以改 .env。" });
    return;
  }
  next();
}

/**
 * 创建 AI 路由。.env 在启动时读取一次；设置页保存的配置立即生效，不用重启。
 *
 * @param {{ env?: NodeJS.ProcessEnv }} options 环境变量来源
 * @returns {import("express").Router} 路由
 */
export function createAiRouter({ env = process.env } = {}) {
  const router = Router();
  const configFile = aiConfigPath(env);
  let stored = loadStoredAiConfig(configFile);
  let config = readAiConfig(env, stored);
  let inFlight = 0;

  router.use((request, response, next) => {
    const site = request.get("sec-fetch-site");
    if (site && !ALLOWED_FETCH_SITES.has(site)) {
      response.status(403).json({ error: "只接受来自本应用页面的请求。" });
      return;
    }
    next();
  });

  const access = (request) => accessState(env.AI_ACCESS_CODE, request.get(ACCESS_CODE_HEADER));

  router.get("/status", (request, response) => {
    response.set("Cache-Control", "no-store").json({ ...publicAiStatus(config), configEditable: true, access: access(request) });
  });

  router.get("/config", localOnly, (_request, response) => {
    response.set("Cache-Control", "no-store").json(describeAiConfig(env, stored));
  });

  router.put("/config", localOnly, async (request, response, next) => {
    try {
      const updated = mergeAiConfigUpdate(stored, request.body ?? {}, env);
      await saveStoredAiConfig(configFile, updated).catch(() => {
        throw new AiServiceError(`无法写入配置文件 ${configFile}，请检查写入权限。`, 500);
      });
      stored = updated;
      config = readAiConfig(env, stored);
      response.set("Cache-Control", "no-store").json(describeAiConfig(env, stored));
    } catch (error) {
      if (error instanceof AiServiceError) response.status(error.status).json({ error: error.message });
      else next(error);
    }
  });

  /** 包装模型请求：访问码 + 并发限制 + 把 AiServiceError 翻译成 JSON 错误。 */
  function modelRoute(handler) {
    return async (request, response, next) => {
      const state = access(request);
      if (!accessAllowed(state)) {
        const [status, message] = ACCESS_ERRORS[state];
        response.status(status).json({ error: message });
        return;
      }
      if (inFlight >= MAX_IN_FLIGHT) {
        response.status(429).json({ error: "AI 正在处理其他请求，请稍后再试。" });
        return;
      }
      inFlight += 1;
      try {
        response.json(await handler(request.body ?? {}));
      } catch (error) {
        if (error instanceof AiServiceError) {
          response.status(error.status).json({ error: error.message });
        } else {
          next(error);
        }
      } finally {
        inFlight -= 1;
      }
    };
  }

  for (const [path, run] of Object.entries(MODEL_ROUTES)) {
    router.post(path, modelRoute((body) => run(config, body)));
  }

  return router;
}
