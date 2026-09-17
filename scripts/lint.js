import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "public/js", "public/sw.js", "scripts", "test", "eslint.config.js"];
const files = [];

async function collect(target) {
  const entries = await readdir(target, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    files.push(target);
    return;
  }
  for (const entry of entries) {
    const entryPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await collect(entryPath);
    } else if (entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }
}

for (const root of roots) {
  await collect(root);
}

const failures = [];
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failures.push(`${file}: ${result.stderr.trim()}`);
  }
  const content = await readFile(file, "utf8");
  content.split("\n").forEach((line, index) => {
    if (/[\t ]+$/.test(line)) {
      failures.push(`${file}:${index + 1}: trailing whitespace`);
    }
  });
}

for (const jsonFile of ["package.json", "public/manifest.webmanifest"]) {
  try {
    JSON.parse(await readFile(jsonFile, "utf8"));
  } catch (error) {
    failures.push(`${jsonFile}: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Checked ${files.length} JavaScript files and 2 JSON files.`);
