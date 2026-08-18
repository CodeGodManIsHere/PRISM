(() => {
  "use strict";

  const CUSTOM_RULE_ID_MINIMUM = 1000000;
  const CUSTOM_RULE_ID_SPAN = 800000;
  const PROFILE_RULE_ID_MINIMUM = 2000000;
  const PROFILE_RULE_ID_SPAN = 8000000;

  function fnv1a(source) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function allocateID(source, minimum, span, used) {
    let candidate = minimum + (fnv1a(source) % span);
    while (used.has(candidate)) {
      candidate += 1;
      if (candidate >= minimum + span) candidate = minimum;
    }
    used.add(candidate);
    return candidate;
  }

  function parseNetworkRule(source) {
    if (typeof source !== "string" || source.length > 512) return null;
    const trimmed = source.trim();
    if (trimmed.includes("##")) return null;
    const allow = trimmed.startsWith("@@");
    const body = allow ? trimmed.slice(2) : trimmed;
    const match = /^\|\|([a-z0-9.-]+)\^$/i.exec(body);
    if (!match) return null;
    const domain = globalThis.PRISMSettings.normalizeDomain(match[1]);
    if (!domain || domain !== match[1].toLowerCase()) return null;
    return { allow, domain, canonical: `${allow ? "@@" : ""}||${domain}^` };
  }

  function compileCustomNetworkRules(customRules) {
    const used = new Set();
    const output = [];
    for (const entry of Array.isArray(customRules) ? customRules.slice(0, 1000) : []) {
      if (!entry || entry.enabled !== true) continue;
      const parsed = parseNetworkRule(entry.text);
      if (!parsed) continue;
      output.push({
        id: allocateID(parsed.canonical, CUSTOM_RULE_ID_MINIMUM, CUSTOM_RULE_ID_SPAN, used),
        priority: 150000,
        action: { type: parsed.allow ? "allow" : "block" },
        condition: {
          urlFilter: `||${parsed.domain}^`,
          resourceTypes: ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "media", "websocket", "other"]
        }
      });
    }
    return output.sort((left, right) => left.id - right.id);
  }

  function globalProtectionMode(globalSettings) {
    if (globalSettings?.protectionEnabled === false) return "disabled";
    return ["minimal", "strict"].includes(globalSettings?.protectionPreset)
      ? globalSettings.protectionPreset
      : "balanced";
  }

  function categoriesFor(mode) {
    if (mode === "minimal") return ["minimal"];
    if (mode === "balanced") return ["minimal", "balanced"];
    if (mode === "strict") return ["minimal", "balanced", "strict"];
    return [];
  }

  function scopedCondition(condition, domain) {
    return { ...condition, initiatorDomains: [domain] };
  }

  function compileProfileRules(profiles, globalSettings = {}, staticRules = {}) {
    const used = new Set();
    const output = [];
    const globalMode = globalProtectionMode(globalSettings);
    const globalCategories = new Set(categoriesFor(globalMode));
    const entries = Object.entries(profiles && typeof profiles === "object" ? profiles : {}).slice(0, 2000);
    for (const [rawDomain, profile] of entries) {
      const domain = globalThis.PRISMSettings.normalizeDomain(rawDomain);
      if (!domain || !profile) continue;
      let desiredMode = profile.protection === "inherit" || !profile.protection ? globalMode : profile.protection;
      if (profile.compatibilityMode === true || desiredMode === "compatibility") desiredMode = "disabled";
      if (desiredMode === globalMode) continue;

      if (desiredMode === "disabled") {
        output.push({
          id: allocateID(`profile:allow-all:${domain}`, PROFILE_RULE_ID_MINIMUM, PROFILE_RULE_ID_SPAN, used),
          priority: 200000,
          action: { type: "allowAllRequests" },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: ["main_frame", "sub_frame"]
          }
        });
        continue;
      }

      const desiredCategories = new Set(categoriesFor(desiredMode));
      const categoriesToRemove = [...globalCategories].filter((category) => !desiredCategories.has(category));
      const categoriesToAdd = [...desiredCategories].filter((category) => !globalCategories.has(category));

      for (const category of categoriesToRemove) {
        for (const rule of staticRules[category] ?? []) {
          output.push({
            id: allocateID(`profile:allow:${domain}:${category}:${rule.id}`, PROFILE_RULE_ID_MINIMUM, PROFILE_RULE_ID_SPAN, used),
            priority: 100000,
            action: { type: "allow" },
            condition: scopedCondition(rule.condition, domain)
          });
        }
      }
      for (const category of categoriesToAdd) {
        for (const rule of staticRules[category] ?? []) {
          output.push({
            id: allocateID(`profile:block:${domain}:${category}:${rule.id}`, PROFILE_RULE_ID_MINIMUM, PROFILE_RULE_ID_SPAN, used),
            priority: 50000,
            action: { type: "block" },
            condition: scopedCondition(rule.condition, domain)
          });
        }
      }
    }
    return output.sort((left, right) => left.id - right.id);
  }

  function isManagedDynamicRuleID(id) {
    return Number.isInteger(id) && (
      (id >= CUSTOM_RULE_ID_MINIMUM && id < CUSTOM_RULE_ID_MINIMUM + CUSTOM_RULE_ID_SPAN) ||
      (id >= PROFILE_RULE_ID_MINIMUM && id < PROFILE_RULE_ID_MINIMUM + PROFILE_RULE_ID_SPAN)
    );
  }

  globalThis.PRISMCustomRuleCompiler = Object.freeze({
    CUSTOM_RULE_ID_MINIMUM,
    PROFILE_RULE_ID_MINIMUM,
    fnv1a,
    parseNetworkRule,
    globalProtectionMode,
    categoriesFor,
    compileCustomNetworkRules,
    compileProfileRules,
    isManagedDynamicRuleID
  });
})();
