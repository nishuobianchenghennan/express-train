import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { TASK_CARDS } from "../public/js/data/cards.js";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "public");
const distRoot = path.join(root, "dist");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

if (TASK_CARDS.length !== 365 || new Set(TASK_CARDS.map((card) => card.id)).size !== 365) {
  throw new Error("Task card bank must contain 365 unique cards");
}

function assetPathForPrecache(value) {
  return path.join(publicRoot, value === "/" ? "index.html" : value.replace(/^\//, ""));
}

const serviceWorker = await readFile(path.join(publicRoot, "sw.js"), "utf8");
const shellSource = serviceWorker.match(/APP_SHELL\s*=\s*\[([\s\S]*?)\];/)?.[1];
if (!shellSource) {
  throw new Error("Could not read service worker APP_SHELL");
}
const shell = new Set([...shellSource.matchAll(/"(\/[^"\n]*)"/g)].map((match) => match[1]));
for (const asset of shell) {
  if (!(await readFile(assetPathForPrecache(asset)).then(() => true).catch(() => false))) {
    throw new Error(`Service worker precache asset is missing: ${asset}`);
  }
}

async function validateModuleGraph(moduleUrl, visited = new Set()) {
  if (visited.has(moduleUrl)) {
    return;
  }
  visited.add(moduleUrl);
  const modulePath = assetPathForPrecache(moduleUrl);
  const source = await readFile(modulePath, "utf8");
  for (const match of source.matchAll(/(?:import\s+(?:[^"']+from\s+)?|import\s*\()\s*["']([^"']+)["']/g)) {
    const dependency = match[1];
    if (!dependency.startsWith(".")) {
      continue;
    }
    const dependencyPath = path.posix.normalize(path.posix.join(path.posix.dirname(moduleUrl), dependency));
    const dependencyUrl = dependencyPath.startsWith("/") ? dependencyPath : `/${dependencyPath}`;
    if (!shell.has(dependencyUrl)) {
      throw new Error(`Local module is missing from service worker APP_SHELL: ${dependencyUrl}`);
    }
    await validateModuleGraph(dependencyUrl, visited);
  }
}

await validateModuleGraph("/js/app.js");
await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
await cp(publicRoot, distRoot, { recursive: true });
await writeFile(path.join(distRoot, "build.json"), `${JSON.stringify({ version: packageJson.version }, null, 2)}\n`, "utf8");
console.log(`Built dist/ for ${packageJson.name} ${packageJson.version}.`);
