(() => {
  "use strict";

  const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IMG", "PICTURE", "VIDEO", "CANVAS", "IFRAME", "OBJECT", "EMBED"]);
  const BORDER_PROPERTIES = ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];
  const MAX_COLOR_CACHE = 2048;
  const MAX_ELEMENTS_PER_PASS = 50000;

  function customCSSIsSafe(source) {
    if (typeof source !== "string" || source.length > 20000) return false;
    const lowered = source.toLowerCase();
    const forbidden = ["@import", "javascript:", "expression(", "-moz-binding", "url(http:", "url(https:", "url(//"];
    if (forbidden.some((token) => lowered.includes(token))) return false;
    let depth = 0;
    for (const character of source) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth < 0) return false;
    }
    return depth === 0;
  }

  function shouldEnable(settings, windowObject = window, date = new Date()) {
    switch (settings.darkMode) {
      case "alwaysOn": return true;
      case "alwaysOff": return false;
      case "scheduled": {
        const current = date.getHours() * 60 + date.getMinutes();
        const start = settings.scheduleStartMinutes;
        const end = settings.scheduleEndMinutes;
        return start <= end ? current >= start && current < end : current >= start || current < end;
      }
      case "system":
      case "automatic":
      default:
        return windowObject.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
    }
  }

  class DarkEngine {
    constructor(documentObject = document, windowObject = window, onMetricsReady = null) {
      this.document = documentObject;
      this.window = windowObject;
      this.settings = { ...globalThis.PRISMProtocol.DEFAULT_EFFECTIVE_SETTINGS };
      this.onMetricsReady = typeof onMetricsReady === "function" ? onMetricsReady : null;
      this.active = false;
      this.nativeDark = false;
      this.observer = null;
      this.originalStyles = new WeakMap();
      this.colorCache = new Map();
      this.baseStyle = null;
      this.customStyle = null;
      this.metrics = {
        nodesScanned: 0,
        colorMappings: 0,
        mutationBatches: 0,
        initialPassMilliseconds: null,
        lastBatchMilliseconds: null
      };
      this.pendingMetricDelta = { pagesProcessed: 0, urlsCleaned: 0, darkPagesTransformed: 0, mutationBatches: 0 };
      this.queue = globalThis.PRISMMutationQueue.createDirtyRootQueue({
        limit: 128,
        processRoots: (roots, overflowed) => this.processMutationRoots(roots, overflowed)
      });
      this.mediaQuery = this.window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
      this.mediaListener = () => {
        if (["system", "automatic"].includes(this.settings.darkMode)) this.update(this.settings);
      };
    }

    async start(candidateSettings) {
      this.settings = globalThis.PRISMProtocol.sanitizeEffectiveSettings(candidateSettings);
      if (!shouldEnable(this.settings, this.window)) {
        this.stop("disabled-by-setting");
        return this.diagnostics();
      }

      await this.waitForDocumentElement();
      await this.waitForDOMReady();
      const nativeResult = globalThis.PRISMNativeDark.detectInDocument(this.document, this.window);
      this.nativeDark = nativeResult.isNativeDark;
      this.installCustomStyle();
      if (this.nativeDark) {
        this.stopTransformOnly();
        this.mediaQuery?.addEventListener?.("change", this.mediaListener);
        return this.diagnostics();
      }

      if (this.active) return this.diagnostics();
      this.active = true;
      this.document.documentElement.setAttribute("data-prism-dark-root", "");
      this.installBaseStyle();
      this.mediaQuery?.addEventListener?.("change", this.mediaListener);

      const started = this.window.performance.now();
      await this.processRoot(this.document.documentElement);
      this.metrics.initialPassMilliseconds = this.window.performance.now() - started;
      this.pendingMetricDelta.pagesProcessed += 1;
      this.pendingMetricDelta.darkPagesTransformed += 1;
      this.onMetricsReady?.();
      this.observe();
      return this.diagnostics();
    }

    async update(candidateSettings) {
      const next = globalThis.PRISMProtocol.sanitizeEffectiveSettings(candidateSettings);
      const wasEnabled = shouldEnable(this.settings, this.window);
      const willEnable = shouldEnable(next, this.window);
      const visualPolicyChanged = next.imagePolicy !== this.settings.imagePolicy;
      const CSSChanged = next.customCSS !== this.settings.customCSS;
      this.settings = next;

      if (!willEnable) {
        this.stop("disabled-by-setting");
        return this.diagnostics();
      }
      if (!wasEnabled || !this.active) return this.start(next);
      if (visualPolicyChanged) this.installBaseStyle();
      if (CSSChanged) this.installCustomStyle();
      return this.diagnostics();
    }

    stop(reason = "stopped") {
      this.stopTransformOnly();
      this.customStyle?.remove();
      this.customStyle = null;
      this.mediaQuery?.removeEventListener?.("change", this.mediaListener);
      this.stopReason = reason;
    }

    stopTransformOnly() {
      this.observer?.disconnect();
      this.observer = null;
      this.queue.clear();
      const transformed = this.document.querySelectorAll("[data-prism-dark]");
      for (const element of transformed) this.restoreElement(element);
      this.document.documentElement?.removeAttribute("data-prism-dark-root");
      this.baseStyle?.remove();
      this.baseStyle = null;
      this.active = false;
    }

    async waitForDocumentElement() {
      if (this.document.documentElement) return;
      await new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (this.document.documentElement) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(this.document, { childList: true });
      });
    }

    async waitForDOMReady() {
      if (this.document.readyState !== "loading") return;
      await new Promise((resolve) => {
        this.document.addEventListener("DOMContentLoaded", resolve, { once: true });
      });
    }

    installBaseStyle() {
      this.baseStyle?.remove();
      const style = this.document.createElement("style");
      style.id = "prism-dark-base";
      const mediaRule = this.settings.imagePolicy === "slightlyDimmed"
        ? "html[data-prism-dark-root] :is(img, video) { opacity: 0.88 !important; }"
        : "html[data-prism-dark-root] :is(img, video, canvas) { filter: none !important; }";
      style.textContent = `
        html[data-prism-dark-root] { color-scheme: dark !important; background: rgb(18 20 24) !important; }
        html[data-prism-dark-root] body { background-color: rgb(18 20 24) !important; }
        html[data-prism-dark-root] :is(input, textarea, select, button) { color-scheme: dark; }
        ${mediaRule}
      `;
      (this.document.head ?? this.document.documentElement).append(style);
      this.baseStyle = style;
    }

    installCustomStyle() {
      this.customStyle?.remove();
      this.customStyle = null;
      const siteFix = globalThis.PRISMSiteFixes.matchingCSS(this.window.location.hostname);
      const custom = customCSSIsSafe(this.settings.customCSS) ? this.settings.customCSS : "";
      const source = [siteFix, custom].filter(Boolean).join("\n");
      if (!source) return;
      const style = this.document.createElement("style");
      style.id = "prism-site-overrides";
      style.textContent = source;
      (this.document.head ?? this.document.documentElement).append(style);
      this.customStyle = style;
    }

    observe() {
      this.observer?.disconnect();
      this.observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === 1) this.queue.add(node);
          }
        }
      });
      this.observer.observe(this.document.documentElement, { childList: true, subtree: true });
    }

    async processMutationRoots(roots, overflowed) {
      if (!this.active) return;
      const started = this.window.performance.now();
      if (overflowed) {
        await this.processRoot(this.document.documentElement);
      } else {
        for (const root of roots) await this.processRoot(root);
      }
      this.metrics.mutationBatches += 1;
      this.metrics.lastBatchMilliseconds = this.window.performance.now() - started;
      this.pendingMetricDelta.mutationBatches += 1;
      this.onMetricsReady?.();
    }

    async processRoot(root) {
      const elements = [];
      if (root?.nodeType === 1) elements.push(root);
      if (typeof root?.querySelectorAll === "function") {
        for (const element of root.querySelectorAll("*")) {
          elements.push(element);
          if (elements.length >= MAX_ELEMENTS_PER_PASS) break;
        }
      }

      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        if (element.isConnected) this.transformElement(element);
        if (index > 0 && index % 350 === 0) await this.yieldToMain();
      }
    }

    transformElement(element) {
      if (SKIPPED_TAGS.has(element.tagName) || element.id?.startsWith("prism-")) return;
      let computed;
      try {
        computed = this.window.getComputedStyle(element);
      } catch {
        return;
      }
      if (computed.display === "none" || computed.visibility === "hidden") return;
      this.metrics.nodesScanned += 1;

      const background = this.mapColor(computed.backgroundColor, "background");
      if (background && background.parsed.a > 0.015) {
        this.setStyle(element, "backgroundColor", background.formatted);
      }

      if (computed.backgroundImage && computed.backgroundImage !== "none" && !/url\(/i.test(computed.backgroundImage)) {
        const gradient = this.transformGradient(computed.backgroundImage);
        if (gradient !== computed.backgroundImage) this.setStyle(element, "backgroundImage", gradient);
      }

      const role = element.closest?.("a[href]") ? "link" : "text";
      const foreground = this.mapColor(computed.color, role);
      if (foreground && foreground.parsed.a > 0.015) {
        const backgroundColor = background?.transformed ?? globalThis.PRISMColor.parseCSSColor("rgb(18 20 24)");
        const contrasted = globalThis.PRISMColor.ensureContrast(foreground.transformed, backgroundColor, this.minimumContrastFor(element));
        this.setStyle(element, "color", globalThis.PRISMColor.formatCSSColor(contrasted));
      }

      for (const property of BORDER_PROPERTIES) {
        const mapped = this.mapColor(computed[property], "border");
        if (mapped && mapped.parsed.a > 0.015) this.setStyle(element, property, mapped.formatted);
      }

      if (element.namespaceURI === "http://www.w3.org/2000/svg") {
        for (const property of ["fill", "stroke"]) {
          const source = computed[property];
          if (!source || source === "none" || source.startsWith("url(")) continue;
          const mapped = this.mapColor(source, property === "stroke" ? "border" : "accent");
          if (mapped) this.setStyle(element, property, mapped.formatted);
        }
      }
    }

    minimumContrastFor(element) {
      const size = Number.parseFloat(this.window.getComputedStyle(element).fontSize) || 16;
      const weight = Number.parseInt(this.window.getComputedStyle(element).fontWeight, 10) || 400;
      return size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    }

    mapColor(source, role) {
      const key = `${role}|${source}`;
      const cached = this.colorCache.get(key);
      if (cached) return cached;
      const parsed = globalThis.PRISMColor.parseCSSColor(source);
      if (!parsed) return null;
      const transformed = globalThis.PRISMColor.transformForDark(parsed, role);
      const result = { parsed, transformed, formatted: globalThis.PRISMColor.formatCSSColor(transformed) };
      this.colorCache.set(key, result);
      this.metrics.colorMappings += 1;
      if (this.colorCache.size > MAX_COLOR_CACHE) {
        this.colorCache.delete(this.colorCache.keys().next().value);
      }
      return result;
    }

    transformGradient(source) {
      return source.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi, (match) => this.mapColor(match, "background")?.formatted ?? match);
    }

    setStyle(element, property, value) {
      let state = this.originalStyles.get(element);
      if (!state) {
        state = new Map();
        this.originalStyles.set(element, state);
      }
      if (!state.has(property)) {
        state.set(property, {
          value: element.style.getPropertyValue(this.CSSName(property)),
          priority: element.style.getPropertyPriority(this.CSSName(property))
        });
      }
      element.style.setProperty(this.CSSName(property), value, "important");
      element.setAttribute("data-prism-dark", "");
    }

    restoreElement(element) {
      const state = this.originalStyles.get(element);
      if (state) {
        for (const [property, original] of state) {
          const CSSProperty = this.CSSName(property);
          if (original.value) element.style.setProperty(CSSProperty, original.value, original.priority);
          else element.style.removeProperty(CSSProperty);
        }
      }
      element.removeAttribute("data-prism-dark");
      this.originalStyles.delete(element);
    }

    CSSName(property) {
      return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
    }

    yieldToMain() {
      return new Promise((resolve) => {
        if (typeof this.window.requestIdleCallback === "function") {
          this.window.requestIdleCallback(resolve, { timeout: 40 });
        } else {
          this.window.setTimeout(resolve, 0);
        }
      });
    }

    diagnostics() {
      return Object.freeze({
        active: this.active,
        nativeDark: this.nativeDark,
        strategy: this.nativeDark ? "native" : (this.active ? "dynamic" : "off"),
        nodesScanned: this.metrics.nodesScanned,
        colorMappings: this.metrics.colorMappings,
        mutationBatches: this.metrics.mutationBatches,
        initialPassMilliseconds: this.metrics.initialPassMilliseconds,
        lastBatchMilliseconds: this.metrics.lastBatchMilliseconds,
        colorCacheSize: this.colorCache.size
      });
    }

    takeMetricDelta() {
      const delta = { ...this.pendingMetricDelta };
      this.pendingMetricDelta = { pagesProcessed: 0, urlsCleaned: 0, darkPagesTransformed: 0, mutationBatches: 0 };
      return delta;
    }
  }

  globalThis.PRISMDarkEngine = Object.freeze({ DarkEngine, shouldEnable, customCSSIsSafe });
})();
