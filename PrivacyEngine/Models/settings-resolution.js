(() => {
  "use strict";

  const allowedLabel = /^[a-z0-9-]{1,63}$/;

  function normalizeDomain(rawValue) {
    if (typeof rawValue !== "string") return null;
    const trimmed = rawValue.trim().toLowerCase();
    if (!trimmed || trimmed.length > 253) return null;
    let host;
    try {
      const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
      host = new URL(candidate).hostname.toLowerCase().replace(/\.+$/, "");
    } catch {
      return null;
    }
    if (host === "localhost") return host;
    if (!host || host.length > 253) return null;
    const labels = host.split(".");
    if (labels.some((label) => !allowedLabel.test(label) || label.startsWith("-") || label.endsWith("-"))) {
      return null;
    }
    return host;
  }

  function defaultProtection(globalSettings = {}) {
    if (globalSettings.protectionEnabled === false) return "disabled";
    const preset = globalSettings.protectionPreset;
    return ["strict", "minimal"].includes(preset) ? preset : "balanced";
  }

  function resolveSettings(domain, envelope, temporary = null) {
    const protocol = globalThis.PRISMProtocol;
    const safeEnvelope = envelope && typeof envelope === "object" ? envelope : {};
    const globalSettings = safeEnvelope.global && typeof safeEnvelope.global === "object" ? safeEnvelope.global : {};
    const normalized = normalizeDomain(domain);
    const profiles = safeEnvelope.profiles && typeof safeEnvelope.profiles === "object" ? safeEnvelope.profiles : {};
    const profile = normalized ? profiles[normalized] : null;

    let protection = defaultProtection(globalSettings);
    if (profile && ["strict", "balanced", "minimal", "compatibility", "disabled"].includes(profile.protection)) {
      protection = profile.protection;
    }
    if (profile?.compatibilityMode === true) protection = "compatibility";
    if (temporary?.protection) protection = temporary.protection;

    const candidate = {
      protection,
      darkMode: temporary?.darkMode ?? profile?.darkMode ?? globalSettings.darkMode,
      cleanURLs: temporary?.cleanURLs ?? profile?.cleanURLs ?? globalSettings.cleanURLs,
      imagePolicy: profile?.imagePolicy ?? globalSettings.imagePolicy,
      customCSS: profile?.customCSS ?? "",
      compatibilityMode: profile?.compatibilityMode === true,
      scheduleStartMinutes: globalSettings.scheduleStartMinutes,
      scheduleEndMinutes: globalSettings.scheduleEndMinutes,
      localStatisticsEnabled: globalSettings.localStatisticsEnabled === true,
      customRules: Array.isArray(safeEnvelope.customRules) ? safeEnvelope.customRules.filter((rule) => rule?.enabled === true) : []
    };
    return protocol ? protocol.sanitizeEffectiveSettings(candidate) : candidate;
  }

  globalThis.PRISMSettings = Object.freeze({ normalizeDomain, resolveSettings, defaultProtection });
})();

