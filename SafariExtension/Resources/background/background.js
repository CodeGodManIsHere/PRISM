"use strict";

importScripts(
  "../shared/protocol.js",
  "../PrivacyEngine/Models/settings-resolution.js",
  "../PrivacyEngine/Compiler/custom-rule-compiler.js"
);

const extensionAPI = globalThis.browser ?? globalThis.chrome;
const NATIVE_APPLICATION_ID = "com.prism.privacy";
const SETTINGS_CACHE_KEY = "prism.settings.cache.v1";
let cachedEnvelope = null;
let synchronizedRevision = null;
let synchronizedFingerprint = null;
let lastSynchronizationError = null;
let staticRuleResources = null;

async function nativeMessage(message) {
  const response = await extensionAPI.runtime.sendNativeMessage(NATIVE_APPLICATION_ID, {
    version: globalThis.PRISMProtocol.MESSAGE_VERSION,
    ...message
  });
  if (!response || response.ok !== true || response.version !== 1) {
    throw new Error(response?.error || "Native bridge rejected the request.");
  }
  return response;
}

async function loadEnvelope(force = false) {
  if (!force && cachedEnvelope) return cachedEnvelope;
  try {
    const response = await nativeMessage({ type: "getSettings" });
    cachedEnvelope = response.settings;
    await extensionAPI.storage.local.set({ [SETTINGS_CACHE_KEY]: cachedEnvelope });
    return cachedEnvelope;
  } catch (error) {
    const stored = await extensionAPI.storage.local.get(SETTINGS_CACHE_KEY);
    if (stored?.[SETTINGS_CACHE_KEY]) {
      cachedEnvelope = stored[SETTINGS_CACHE_KEY];
      return cachedEnvelope;
    }
    throw error;
  }
}

function desiredStaticRulesets(envelope) {
  if (envelope?.global?.protectionEnabled === false) return [];
  const preset = envelope?.global?.protectionPreset;
  if (preset === "strict") return ["prism_minimal", "prism_balanced", "prism_strict"];
  if (preset === "minimal") return ["prism_minimal"];
  return ["prism_minimal", "prism_balanced"];
}

async function synchronizeRules(envelope) {
  const revision = Number.isInteger(envelope?.revision) ? envelope.revision : 0;
  const fingerprint = JSON.stringify({
    protectionEnabled: envelope?.global?.protectionEnabled,
    protectionPreset: envelope?.global?.protectionPreset,
    profiles: Object.fromEntries(Object.entries(envelope?.profiles ?? {}).map(([domain, profile]) => [domain, {
      protection: profile?.protection,
      compatibilityMode: profile?.compatibilityMode
    }])),
    customRules: envelope?.customRules
  });
  if (synchronizedFingerprint === fingerprint) {
    synchronizedRevision = revision;
    return;
  }

  const desired = new Set(desiredStaticRulesets(envelope));
  const allStatic = ["prism_minimal", "prism_balanced", "prism_strict"];
  await extensionAPI.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: allStatic.filter((identifier) => desired.has(identifier)),
    disableRulesetIds: allStatic.filter((identifier) => !desired.has(identifier))
  });

  if (!staticRuleResources) {
    const entries = await Promise.all(["minimal", "balanced", "strict"].map(async (name) => {
      const response = await fetch(extensionAPI.runtime.getURL(`rules/${name}.json`));
      if (!response.ok) throw new Error(`Could not load bundled ${name} rules.`);
      return [name, await response.json()];
    }));
    staticRuleResources = Object.fromEntries(entries);
  }
  const custom = globalThis.PRISMCustomRuleCompiler.compileCustomNetworkRules(envelope?.customRules);
  const profiles = globalThis.PRISMCustomRuleCompiler.compileProfileRules(
    envelope?.profiles,
    envelope?.global,
    staticRuleResources
  );
  const additions = [...custom, ...profiles];
  const runtimeLimit = extensionAPI.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES;
  if (Number.isInteger(runtimeLimit) && additions.length > runtimeLimit) {
    throw new Error(`Dynamic rule limit exceeded: ${additions.length} > ${runtimeLimit}`);
  }
  const existing = await extensionAPI.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((rule) => globalThis.PRISMCustomRuleCompiler.isManagedDynamicRuleID(rule.id))
    .map((rule) => rule.id);
  await extensionAPI.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: additions });

  synchronizedRevision = revision;
  synchronizedFingerprint = fingerprint;
  lastSynchronizationError = null;
}

async function currentEffectiveSettings(domain, force = true) {
  const envelope = await loadEnvelope(force);
  try {
    await synchronizeRules(envelope);
  } catch (error) {
    lastSynchronizationError = String(error?.message ?? error);
  }
  return globalThis.PRISMSettings.resolveSettings(domain, envelope);
}

async function setSiteSetting(message) {
  const domain = globalThis.PRISMSettings.normalizeDomain(message.domain);
  if (!domain || typeof message.key !== "string") throw new Error("Invalid site setting request.");
  await nativeMessage({
    type: "setSiteSetting",
    domain,
    key: message.key,
    value: message.value
  });
  cachedEnvelope = null;
  synchronizedRevision = null;
  synchronizedFingerprint = null;
  return currentEffectiveSettings(domain, true);
}

async function setGlobalSetting(message) {
  if (typeof message.key !== "string") throw new Error("Invalid global setting request.");
  await nativeMessage({ type: "setGlobalSetting", key: message.key, value: message.value });
  cachedEnvelope = null;
  synchronizedRevision = null;
  synchronizedFingerprint = null;
  const envelope = await loadEnvelope(true);
  await synchronizeRules(envelope);
  return envelope;
}

async function handleMessage(message) {
  if (!globalThis.PRISMProtocol.isValidMessage(message)) return { ok: false, error: "Invalid message." };
  try {
    switch (message.type) {
      case "getEffectiveSettings":
        return { ok: true, settings: await currentEffectiveSettings(message.domain, true) };
      case "setSiteSetting":
        return { ok: true, settings: await setSiteSetting(message) };
      case "setGlobalSetting":
        return { ok: true, envelope: await setGlobalSetting(message) };
      case "recordMetrics":
        await nativeMessage({ type: "recordMetrics", delta: message.delta });
        return { ok: true };
      case "addCustomRule": {
        if (typeof message.rule !== "string" || message.rule.length > 512) throw new Error("Invalid custom rule.");
        await nativeMessage({ type: "addCustomRule", rule: message.rule });
        cachedEnvelope = null;
        synchronizedRevision = null;
        synchronizedFingerprint = null;
        const settings = await currentEffectiveSettings(message.domain, true);
        return { ok: true, settings };
      }
      case "getBackgroundDiagnostics":
        return {
          ok: true,
          diagnostics: {
            synchronizedRevision,
            lastSynchronizationError,
            cacheAvailable: cachedEnvelope !== null
          }
        };
      default:
        return { ok: false, error: "Unsupported message type." };
    }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

extensionAPI.runtime.onMessage.addListener((message) => handleMessage(message));

async function initialize() {
  if (extensionAPI.declarativeNetRequest.setExtensionActionOptions) {
    try {
      await extensionAPI.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
    } catch {
      // The badge is optional; blocking remains active if Safari declines this UI feature.
    }
  }
  try {
    const envelope = await loadEnvelope(true);
    await synchronizeRules(envelope);
  } catch (error) {
    lastSynchronizationError = String(error?.message ?? error);
  }
}

extensionAPI.runtime.onInstalled?.addListener(() => initialize());
extensionAPI.runtime.onStartup?.addListener(() => initialize());
initialize();
