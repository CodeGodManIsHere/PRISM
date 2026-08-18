(() => {
  "use strict";

  const extensionAPI = globalThis.browser ?? globalThis.chrome;
  const domain = globalThis.PRISMSettings.normalizeDomain(globalThis.location.hostname);
  let settings = { ...globalThis.PRISMProtocol.DEFAULT_EFFECTIVE_SETTINGS };
  let darkEngine = null;
  let elementHidingStyle = null;
  let elementPicker = null;
  let URLMetricDelta = 0;
  let metricTimer = null;

  async function requestSettings() {
    const response = await extensionAPI.runtime.sendMessage({ type: "getEffectiveSettings", domain });
    if (!response?.ok) throw new Error(response?.error || "Settings unavailable.");
    return globalThis.PRISMProtocol.sanitizeEffectiveSettings(response.settings);
  }

  function cleanCurrentLocation() {
    if (!settings.cleanURLs) return false;
    const result = globalThis.PRISMURLSanitizer.sanitizeURL(globalThis.location.href);
    if (!result.changed) return false;
    URLMetricDelta += 1;
    reportMetrics();
    globalThis.location.replace(result.url);
    return true;
  }

  function installLinkCleaner() {
    document.addEventListener("click", (event) => {
      if (!settings.cleanURLs || event.defaultPrevented || event.button !== 0) return;
      const anchor = event.composedPath().find((node) => node?.tagName === "A" && typeof node.href === "string");
      if (!anchor) return;
      const result = globalThis.PRISMURLSanitizer.sanitizeURL(anchor.href, { baseURL: globalThis.location.href });
      if (result.changed) {
        anchor.href = result.url;
        URLMetricDelta += 1;
        reportMetrics();
      }
    }, { capture: true });
  }

  function safeElementSelector(selector) {
    if (typeof selector !== "string" || selector.length === 0 || selector.length > 256) return false;
    if (/[{}@]/.test(selector) || /(?:javascript:|url\()/i.test(selector)) return false;
    try {
      document.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  function installElementHiding() {
    elementHidingStyle?.remove();
    elementHidingStyle = null;
    const selectors = [];
    for (const rule of settings.customRules) {
      if (typeof rule?.text !== "string") continue;
      const marker = rule.text.indexOf("##");
      if (marker <= 0) continue;
      const ruleDomain = globalThis.PRISMSettings.normalizeDomain(rule.text.slice(0, marker));
      const selector = rule.text.slice(marker + 2).trim();
      if (!ruleDomain || !(domain === ruleDomain || domain?.endsWith(`.${ruleDomain}`)) || !safeElementSelector(selector)) continue;
      selectors.push(selector);
    }
    if (selectors.length === 0) return;
    const style = document.createElement("style");
    style.id = "prism-element-hiding";
    style.textContent = `${selectors.join(",\n")} { display: none !important; }`;
    (document.head ?? document.documentElement).append(style);
    elementHidingStyle = style;
  }

  async function applySettings(nextSettings) {
    settings = globalThis.PRISMProtocol.sanitizeEffectiveSettings(nextSettings);
    installElementHiding();
    if (!darkEngine) darkEngine = new globalThis.PRISMDarkEngine.DarkEngine(document, window, scheduleMetricsReport);
    await darkEngine.update(settings);
    await reportMetrics();
    return darkEngine.diagnostics();
  }

  async function reportMetrics() {
    if (!settings.localStatisticsEnabled) return;
    const engineDelta = darkEngine?.takeMetricDelta() ?? {
      pagesProcessed: 0,
      urlsCleaned: 0,
      darkPagesTransformed: 0,
      mutationBatches: 0
    };
    const delta = { ...engineDelta, urlsCleaned: engineDelta.urlsCleaned + URLMetricDelta };
    URLMetricDelta = 0;
    if (Object.values(delta).every((value) => value === 0)) return;
    try {
      await extensionAPI.runtime.sendMessage({ type: "recordMetrics", delta });
    } catch {
      // Statistics are optional and must never interfere with browsing.
    }
  }

  function scheduleMetricsReport() {
    if (!settings.localStatisticsEnabled || metricTimer !== null) return;
    metricTimer = globalThis.setTimeout(async () => {
      metricTimer = null;
      await reportMetrics();
    }, 1000);
  }

  extensionAPI.runtime.onMessage.addListener((message) => {
    if (!globalThis.PRISMProtocol.isValidMessage(message)) return undefined;
    if (message.type === "applySettings") {
      return applySettings(message.settings).then((diagnostics) => ({ ok: true, diagnostics }));
    }
    if (message.type === "getContentDiagnostics") {
      return Promise.resolve({ ok: true, diagnostics: darkEngine?.diagnostics() ?? null });
    }
    if (message.type === "startElementPicker") {
      if (!elementPicker) elementPicker = new globalThis.PRISMElementPicker.ElementPicker(document);
      elementPicker.start(async (selector) => {
        const rule = `${domain}##${selector}`;
        const response = await extensionAPI.runtime.sendMessage({ type: "addCustomRule", domain, rule });
        if (!response?.ok) throw new Error(response?.error || "Rule was rejected.");
        await applySettings(response.settings);
      });
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });

  globalThis.addEventListener("pagehide", () => {
    if (metricTimer !== null) globalThis.clearTimeout(metricTimer);
    metricTimer = null;
    reportMetrics();
  }, { capture: true });

  async function initialize() {
    try {
      settings = await requestSettings();
      if (cleanCurrentLocation()) return;
      installLinkCleaner();
      await applySettings(settings);
    } catch {
      // Safe failure: leave the page unchanged.
    }
  }

  initialize();
})();
