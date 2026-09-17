import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDirectory, "..");
const projectRootReal = realpathSync(projectRoot);

export function parseHost(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "127.0.0.1";
}

export function parsePort(value) {
  const normalized = value == null || String(value).trim() === "" ? "3000" : String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("PORT must be a decimal integer between 1 and 65535");
  }
  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a decimal integer between 1 and 65535");
  }
  return port;
}

function insideProject(candidate) {
  const relative = path.relative(projectRootReal, candidate);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveStaticRoot({ configured = process.env.STATIC_DIR, nodeEnv = process.env.NODE_ENV } = {}) {
  const requested = typeof configured === "string" && configured.trim()
    ? configured.trim()
    : nodeEnv === "production"
      ? "dist"
      : "public";
  const requestedPath = path.resolve(projectRoot, requested);
  if (!existsSync(requestedPath)) {
    throw new Error(`Static directory does not exist: ${requested}`);
  }
  let resolved;
  try {
    resolved = realpathSync(requestedPath);
  } catch (error) {
    throw new Error(`Static directory cannot be resolved: ${requested}`, { cause: error });
  }
  if (!insideProject(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error("STATIC_DIR must point to a directory inside the project");
  }
  if (!existsSync(path.join(resolved, "index.html"))) {
    throw new Error(`Static directory does not contain index.html: ${requested}`);
  }
  return resolved;
}
