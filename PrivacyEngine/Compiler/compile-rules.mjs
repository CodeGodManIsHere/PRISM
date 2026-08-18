import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseSource } from "../Parser/filter-parser.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(currentDirectory, "../..");
const sourceDirectory = path.join(root, "PrivacyEngine", "Rules");
const outputDirectory = path.join(root, "SafariExtension", "Resources", "rules");
const RULESETS = ["minimal", "balanced", "strict"];

export function fnv1a(source) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function compileRules(parsed) {
  const used = new Set();
  return parsed.rules.map((rule) => {
    const key = `${rule.action}|${rule.pattern}|${rule.resourceTypes.join(",")}`;
    let identifier = 1 + (fnv1a(key) % 999998);
    while (used.has(identifier)) identifier = identifier === 999999 ? 1 : identifier + 1;
    used.add(identifier);
    return {
      id: identifier,
      priority: rule.action === "allow" ? 100 : 1,
      action: { type: rule.action },
      condition: {
        urlFilter: rule.pattern,
        resourceTypes: rule.resourceTypes
      }
    };
  }).sort((left, right) => left.id - right.id);
}

export async function buildRuleset(name) {
  const sourcePath = path.join(sourceDirectory, `${name}-rules.json`);
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const parsed = parseSource(source);
  const compiled = compileRules(parsed);
  const contents = `${JSON.stringify(compiled, null, 2)}\n`;
  return {
    name,
    outputPath: path.join(outputDirectory, `${name}.json`),
    contents,
    diagnostics: {
      ...parsed.diagnostics,
      compiledRules: compiled.length,
      ruleset: parsed.metadata.id,
      version: parsed.metadata.version
    }
  };
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") {
    throw new Error("Usage: node compile-rules.mjs --write|--check");
  }
  const builds = await Promise.all(RULESETS.map(buildRuleset));
  let mismatch = false;
  if (mode === "--write") await mkdir(outputDirectory, { recursive: true });
  for (const build of builds) {
    if (mode === "--write") {
      await writeFile(build.outputPath, build.contents, "utf8");
    } else {
      const existing = await readFile(build.outputPath, "utf8").catch(() => "");
      if (existing !== build.contents) {
        mismatch = true;
        process.stderr.write(`${build.name}.json is not the deterministic compiler output.\n`);
      }
    }
  }
  process.stdout.write(`${JSON.stringify(builds.map((build) => build.diagnostics))}\n`);
  if (mismatch) process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
