const ALLOWED_ACTIONS = new Set(["block", "allow"]);
const ALLOWED_RESOURCE_TYPES = new Set([
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "media",
  "websocket",
  "other"
]);

export function canonicalizeRule(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Rule must be an object.");
  }
  const pattern = typeof candidate.pattern === "string" ? candidate.pattern.trim().toLowerCase() : "";
  if (!/^\|\|[a-z0-9.-]+\^$/.test(pattern)) throw new TypeError(`Unsupported pattern: ${pattern || "<empty>"}`);
  if (!ALLOWED_ACTIONS.has(candidate.action)) throw new TypeError(`Unsupported action for ${pattern}`);
  if (typeof candidate.category !== "string" || candidate.category.length === 0 || candidate.category.length > 64) {
    throw new TypeError(`Invalid category for ${pattern}`);
  }
  const resourceTypes = [...new Set(candidate.resourceTypes ?? [])].sort();
  if (resourceTypes.length === 0 || resourceTypes.some((type) => !ALLOWED_RESOURCE_TYPES.has(type))) {
    throw new TypeError(`Invalid resource types for ${pattern}`);
  }
  return Object.freeze({
    pattern,
    action: candidate.action,
    category: candidate.category.toLowerCase(),
    resourceTypes
  });
}

export function parseSource(document) {
  if (!document || document.schemaVersion !== 1 || typeof document.id !== "string" || !Array.isArray(document.rules)) {
    throw new TypeError("Invalid filter source document.");
  }
  if (document.license !== "MIT") throw new TypeError(`Unapproved bundled license: ${document.license}`);

  const canonical = [];
  const seen = new Set();
  let deduplicatedRules = 0;
  for (const candidate of document.rules) {
    const rule = canonicalizeRule(candidate);
    const key = JSON.stringify(rule);
    if (seen.has(key)) {
      deduplicatedRules += 1;
      continue;
    }
    seen.add(key);
    canonical.push(rule);
  }
  canonical.sort((left, right) => {
    const pattern = left.pattern.localeCompare(right.pattern);
    if (pattern !== 0) return pattern;
    return left.action.localeCompare(right.action);
  });
  return {
    metadata: {
      id: document.id,
      version: document.version,
      license: document.license,
      source: document.source
    },
    rules: canonical,
    diagnostics: {
      inputRules: document.rules.length,
      validRules: canonical.length,
      deduplicatedRules,
      rejectedRules: 0,
      warnings: []
    }
  };
}

