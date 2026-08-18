(() => {
  "use strict";

  const MESSAGE_VERSION = 1;
  const ALLOWED_DARK_MODES = new Set(["system", "automatic", "alwaysOn", "alwaysOff", "scheduled"]);
  const ALLOWED_PROTECTION = new Set(["inherit", "strict", "balanced", "minimal", "compatibility", "disabled"]);
  const ALLOWED_IMAGE_POLICIES = new Set(["automatic", "unchanged", "slightlyDimmed"]);

  const DEFAULT_EFFECTIVE_SETTINGS = Object.freeze({
    protection: "balanced",
    darkMode: "automatic",
    cleanURLs: true,
    imagePolicy: "automatic",
    customCSS: "",
    compatibilityMode: false,
    scheduleStartMinutes: 1200,
    scheduleEndMinutes: 420,
    localStatisticsEnabled: false,
    customRules: []
  });

  function clampInteger(value, minimum, maximum, fallback) {
    return Number.isInteger(value) ? Math.min(Math.max(value, minimum), maximum) : fallback;
  }

  function sanitizeEffectiveSettings(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { ...DEFAULT_EFFECTIVE_SETTINGS };
    }
    return {
      protection: ALLOWED_PROTECTION.has(candidate.protection) ? candidate.protection : "balanced",
      darkMode: ALLOWED_DARK_MODES.has(candidate.darkMode) ? candidate.darkMode : "automatic",
      cleanURLs: typeof candidate.cleanURLs === "boolean" ? candidate.cleanURLs : true,
      imagePolicy: ALLOWED_IMAGE_POLICIES.has(candidate.imagePolicy) ? candidate.imagePolicy : "automatic",
      customCSS: typeof candidate.customCSS === "string" && candidate.customCSS.length <= 20000 ? candidate.customCSS : "",
      compatibilityMode: candidate.compatibilityMode === true,
      scheduleStartMinutes: clampInteger(candidate.scheduleStartMinutes, 0, 1439, 1200),
      scheduleEndMinutes: clampInteger(candidate.scheduleEndMinutes, 0, 1439, 420),
      localStatisticsEnabled: candidate.localStatisticsEnabled === true,
      customRules: Array.isArray(candidate.customRules) ? candidate.customRules.slice(0, 1000) : []
    };
  }

  function isValidMessage(message) {
    return Boolean(
      message &&
      typeof message === "object" &&
      !Array.isArray(message) &&
      typeof message.type === "string" &&
      message.type.length > 0 &&
      message.type.length <= 64
    );
  }

  globalThis.PRISMProtocol = Object.freeze({
    MESSAGE_VERSION,
    DEFAULT_EFFECTIVE_SETTINGS,
    sanitizeEffectiveSettings,
    isValidMessage
  });
})();

