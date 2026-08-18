import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set(["node_modules", "Build", "DerivedData", ".git", "__pycache__"]);

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(absolute));
    else files.push(absolute);
  }
  return files;
}

function fail(message) {
  throw new Error(message);
}

function normalizedRelativePath(value, description) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${description} must be a non-empty path.`);
  }
  if (path.isAbsolute(value)) {
    fail(`${description} must be relative to the project root: ${value}`);
  }
  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    fail(`${description} escapes the project root: ${value}`);
  }
  return normalized;
}

async function requireProjectPath(value, description, optional = false) {
  const normalized = normalizedRelativePath(value, description);
  const absolute = path.join(root, normalized);
  try {
    return { normalized, metadata: await stat(absolute) };
  } catch (error) {
    if (optional && error?.code === "ENOENT") return undefined;
    if (error?.code === "ENOENT") fail(`${description} does not exist: ${value}`);
    throw error;
  }
}

function sourceObject(source, targetName) {
  if (typeof source === "string") return { path: source };
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    fail(`Target ${targetName} contains an invalid source entry.`);
  }
  return source;
}

function safeBundleSubpath(value, sourcePath) {
  if (typeof value !== "string") fail(`Copy-files subpath must be a string for ${sourcePath}.`);
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalized === ".") return "";
  if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    fail(`Copy-files subpath escapes the extension bundle for ${sourcePath}: ${value}`);
  }
  return normalized;
}

function bundleDestinationForSource(source, targetName) {
  const entry = sourceObject(source, targetName);
  const sourcePath = normalizedRelativePath(entry.path, `Target ${targetName} source path`).replaceAll("\\", "/");
  const basename = path.posix.basename(sourcePath);
  if (entry.buildPhase === "resources") return basename;

  const copyFiles = entry.buildPhase?.copyFiles;
  if (!copyFiles) return undefined;
  if (copyFiles.destination !== "resources") {
    fail(`Safari extension resource ${sourcePath} must copy to the resources destination.`);
  }
  const subpath = safeBundleSubpath(copyFiles.subpath ?? "", sourcePath);
  return subpath ? path.posix.join(subpath, basename) : basename;
}

function flattenIconPaths(value) {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).filter((entry) => typeof entry === "string");
  }
  return [];
}

const files = await collect(root);
const JSONFiles = files.filter((file) => file.endsWith(".json") || path.basename(file) === "project.yml");
for (const file of JSONFiles) {
  try {
    JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`Invalid JSON-compatible file ${path.relative(root, file)}: ${error.message}`);
  }
}

const project = JSON.parse(await readFile(path.join(root, "project.yml"), "utf8"));
if (!project.targets?.PRISM || !project.targets?.PRISMSafariExtension || !project.targets?.PRISMTests) {
  fail("project.yml must define the app, Safari extension, and tests.");
}

let validatedProjectPathCount = 0;
for (const [targetName, target] of Object.entries(project.targets)) {
  const seenSources = new Set();
  for (const source of target.sources ?? []) {
    const entry = sourceObject(source, targetName);
    const validated = await requireProjectPath(
      entry.path,
      `Target ${targetName} source path`,
      entry.optional === true
    );
    if (!validated) continue;
    validatedProjectPathCount += 1;

    const normalized = validated.normalized.replaceAll("\\", "/");
    if (seenSources.has(normalized)) fail(`Target ${targetName} repeats source path: ${normalized}`);
    seenSources.add(normalized);

    if (entry.type === "file" && !validated.metadata.isFile()) {
      fail(`Target ${targetName} declares a non-file as type file: ${normalized}`);
    }
    if (["folder", "group", "syncedFolder"].includes(entry.type) && !validated.metadata.isDirectory()) {
      fail(`Target ${targetName} declares a non-directory as type ${entry.type}: ${normalized}`);
    }
    if (entry.type === "folder" && normalized.includes("/")) {
      fail(`Nested type: folder sources are forbidden because XcodeGen 2.46.0 can emit an invalid PBXFileReference: ${normalized}`);
    }
    if (entry.buildPhase && typeof entry.buildPhase === "object") {
      const copyFiles = entry.buildPhase.copyFiles;
      if (!copyFiles || typeof copyFiles !== "object") {
        fail(`Target ${targetName} has an invalid buildPhase object for ${normalized}.`);
      }
      safeBundleSubpath(copyFiles.subpath ?? "", normalized);
    }
    if (validated.metadata.isDirectory()) {
      for (const [patternKind, patterns] of [["include", entry.includes], ["exclude", entry.excludes]]) {
        for (const pattern of patterns ?? []) {
          if (typeof pattern !== "string" || /[*?{}[\]]/.test(pattern)) continue;
          await requireProjectPath(path.join(normalized, pattern), `Target ${targetName} ${patternKind} path`);
          validatedProjectPathCount += 1;
        }
      }
    }
  }

  const settingContainers = [target.settings?.base, ...Object.values(target.settings?.configs ?? {})].filter(Boolean);
  for (const settings of settingContainers) {
    for (const settingName of ["INFOPLIST_FILE", "CODE_SIGN_ENTITLEMENTS"]) {
      const settingValue = settings[settingName];
      if (typeof settingValue !== "string" || settingValue.includes("$(")) continue;
      await requireProjectPath(settingValue, `Target ${targetName} ${settingName}`);
      validatedProjectPathCount += 1;
    }
  }

  for (const configPath of Object.values(target.configFiles ?? {})) {
    await requireProjectPath(configPath, `Target ${targetName} configuration file`);
    validatedProjectPathCount += 1;
  }
  for (const phaseName of ["preBuildScripts", "postCompileScripts", "postBuildScripts"]) {
    for (const script of target[phaseName] ?? []) {
      if (!script.path) continue;
      await requireProjectPath(script.path, `Target ${targetName} ${phaseName} script`);
      validatedProjectPathCount += 1;
    }
  }
  for (const dependency of target.dependencies ?? []) {
    if (dependency.target && !project.targets[dependency.target]) {
      fail(`Target ${targetName} references missing target dependency: ${dependency.target}`);
    }
  }
}

const includes = project.include === undefined ? [] : (Array.isArray(project.include) ? project.include : [project.include]);
for (const include of includes) {
  const includePath = typeof include === "string" ? include : include.path;
  if (typeof include === "object" && include.enable === false) continue;
  await requireProjectPath(includePath, "XcodeGen included specification");
  validatedProjectPathCount += 1;
}

const extensionDependency = project.targets.PRISM.dependencies?.find((dependency) => dependency.target === "PRISMSafariExtension");
if (!extensionDependency?.embed) fail("The Safari extension is not configured as an embedded app dependency.");

const extensionSources = project.targets.PRISMSafariExtension.sources ?? [];
const bundleSourcePaths = new Map();
const bundleDestinations = new Map();
for (const source of extensionSources) {
  const entry = sourceObject(source, "PRISMSafariExtension");
  const sourcePath = normalizedRelativePath(entry.path, "Safari extension source path").replaceAll("\\", "/");
  const destination = bundleDestinationForSource(entry, "PRISMSafariExtension");
  if (!destination) continue;
  if (bundleDestinations.has(destination)) {
    fail(`Multiple Safari extension sources copy to ${destination}: ${bundleDestinations.get(destination)} and ${sourcePath}`);
  }
  bundleSourcePaths.set(sourcePath, destination);
  bundleDestinations.set(destination, sourcePath);
}

const runtimeSourcePrefixes = ["SafariExtension/Resources/", "PrivacyEngine/", "DarkModeEngine/"];
const runtimeSourceFiles = files
  .map((file) => path.relative(root, file).replaceAll("\\", "/"))
  .filter((file) => runtimeSourcePrefixes.some((prefix) => file.startsWith(prefix)));
for (const sourcePath of runtimeSourceFiles) {
  const destination = bundleSourcePaths.get(sourcePath);
  if (!destination) fail(`Safari extension runtime file is not represented in project.yml: ${sourcePath}`);
  const expectedDestination = sourcePath.startsWith("SafariExtension/Resources/")
    ? sourcePath.slice("SafariExtension/Resources/".length)
    : sourcePath;
  if (destination !== expectedDestination) {
    fail(`Safari extension runtime path mismatch for ${sourcePath}: expected ${expectedDestination}, got ${destination}`);
  }
}

for (const requiredDirectory of [
  "background",
  "content",
  "icons",
  "popup",
  "rules",
  "shared",
  "PrivacyEngine",
  "DarkModeEngine"
]) {
  if (![...bundleDestinations.keys()].some((destination) => destination.startsWith(`${requiredDirectory}/`))) {
    fail(`Safari extension bundle has no files under required directory: ${requiredDirectory}/`);
  }
}
if (bundleSourcePaths.get("SafariExtension/Resources/manifest.json") !== "manifest.json") {
  fail("manifest.json must be copied to the Safari extension bundle root.");
}

const manifestPath = path.join(root, "SafariExtension", "Resources", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.manifest_version !== 3) fail("Safari manifest must use Manifest V3.");
if (!manifest.content_security_policy?.extension_pages.includes("object-src 'none'")) fail("Extension CSP is not restrictive enough.");
if (manifest.content_security_policy.extension_pages.includes("unsafe-eval")) fail("unsafe-eval is forbidden.");
const forbiddenPermissions = new Set(["webRequest", "webRequestBlocking", "cookies", "history", "downloads", "geolocation"]);
if ((manifest.permissions ?? []).some((permission) => forbiddenPermissions.has(permission))) {
  fail("Manifest contains an unnecessary high-risk permission.");
}

const referencedResources = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_page,
  manifest.options_ui?.page,
  manifest.devtools_page,
  ...flattenIconPaths(manifest.icons),
  ...flattenIconPaths(manifest.action?.default_icon),
  ...(manifest.content_scripts ?? []).flatMap((script) => [...(script.js ?? []), ...(script.css ?? [])]),
  ...(manifest.declarative_net_request?.rule_resources ?? []).map((resource) => resource.path)
].filter(Boolean);

for (const resource of referencedResources) {
  const normalized = safeBundleSubpath(resource, "manifest.json");
  if (!normalized || normalized !== resource.replaceAll("\\", "/")) {
    fail(`Manifest resource path is not canonical: ${resource}`);
  }
  if (!bundleDestinations.has(normalized)) fail(`Manifest resource will not exist in the extension bundle: ${resource}`);
}

for (const resource of manifest.declarative_net_request?.rule_resources ?? []) {
  const rules = JSON.parse(await readFile(path.join(root, "SafariExtension", "Resources", resource.path), "utf8"));
  const identifiers = new Set();
  for (const rule of rules) {
    if (!Number.isInteger(rule.id) || rule.id <= 0 || identifiers.has(rule.id)) fail(`Invalid or duplicate rule id in ${resource.path}`);
    identifiers.add(rule.id);
    if (!rule.action?.type || !rule.condition?.urlFilter || !Array.isArray(rule.condition.resourceTypes)) {
      fail(`Malformed DNR rule in ${resource.path}`);
    }
  }
}

const appIconDirectory = path.join(root, "App", "Assets.xcassets", "AppIcon.appiconset");
const appIconContents = JSON.parse(await readFile(path.join(appIconDirectory, "Contents.json"), "utf8"));
for (const image of appIconContents.images) {
  const imagePath = path.join(appIconDirectory, image.filename);
  const data = await readFile(imagePath);
  if (data.subarray(1, 4).toString("ascii") !== "PNG") fail(`App icon is not PNG: ${image.filename}`);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const scale = Number.parseInt(image.scale, 10);
  const expected = Math.round(Number.parseFloat(image.size) * scale);
  if (width !== expected || height !== expected) fail(`Wrong app-icon dimensions for ${image.filename}: ${width}x${height}, expected ${expected}`);
  const colorType = data.readUInt8(25);
  if (colorType === 4 || colorType === 6) fail(`App icon contains an alpha channel: ${image.filename}`);
}

const productionTextFiles = files.filter((file) =>
  /\.(?:js|mjs|html|swift)$/.test(file) &&
  !file.includes(`${path.sep}Tests${path.sep}`) &&
  !file.includes(`${path.sep}Scripts${path.sep}`)
);
const forbiddenPatterns = [
  { expression: /\beval\s*\(/, label: "eval" },
  { expression: /\bnew\s+Function\s*\(/, label: "new Function" },
  { expression: /\.innerHTML\s*=/, label: "innerHTML assignment" },
  { expression: /\.outerHTML\s*=/, label: "outerHTML assignment" },
  { expression: /insertAdjacentHTML\s*\(/, label: "HTML injection" },
  { expression: /<script[^>]+src=["']https?:/i, label: "remote script" },
  { expression: /\b(?:TODO|FIXME)\b/, label: "unfinished production marker" }
];
for (const file of productionTextFiles) {
  const source = await readFile(file, "utf8");
  for (const forbidden of forbiddenPatterns) {
    if (forbidden.expression.test(source)) fail(`${forbidden.label} found in ${path.relative(root, file)}`);
  }
}

const plistResult = spawnSync("python3", [path.join(root, "Scripts", "validate-plists.py")], { encoding: "utf8" });
if (plistResult.status !== 0) fail(plistResult.stderr || "Property-list validation failed.");
process.stdout.write(plistResult.stdout);
const PythonResult = spawnSync("python3", ["-m", "py_compile", path.join(root, "Scripts", "validate-plists.py")], { encoding: "utf8" });
if (PythonResult.status !== 0) fail(PythonResult.stderr || "Python syntax validation failed.");
const shellScripts = files.filter((file) => file.endsWith(".sh"));
if (shellScripts.length > 0) {
  const shellResult = spawnSync("bash", ["-n", ...shellScripts], { encoding: "utf8" });
  if (shellResult.status !== 0) fail(shellResult.stderr || "Shell syntax validation failed.");
}
process.stdout.write(
  `Project validation passed: ${files.length} files, ${JSONFiles.length} JSON documents, ` +
  `${validatedProjectPathCount} XcodeGen paths, ${bundleDestinations.size} extension bundle resources\n`
);
