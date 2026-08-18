(() => {
  "use strict";

  function median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  }

  function evaluateSamples({ declaredColorScheme = "", prefersDark = false, backgrounds = [], foregrounds = [] }) {
    const color = globalThis.PRISMColor;
    const backgroundLuminances = backgrounds
      .map((value) => color?.parseCSSColor(value))
      .filter(Boolean)
      .filter((value) => value.a > 0.1)
      .map((value) => color.relativeLuminance(value));
    const foregroundLuminances = foregrounds
      .map((value) => color?.parseCSSColor(value))
      .filter(Boolean)
      .filter((value) => value.a > 0.1)
      .map((value) => color.relativeLuminance(value));

    const backgroundMedian = median(backgroundLuminances);
    const foregroundMedian = median(foregroundLuminances);
    const declaresDark = /(^|\s)dark($|\s)/i.test(declaredColorScheme);
    let score = 0;
    const reasons = [];

    if (declaresDark && prefersDark) {
      score += 2;
      reasons.push("declared-dark-scheme");
    }
    if (backgroundMedian !== null && backgroundMedian < 0.18) {
      score += 3;
      reasons.push("dark-rendered-surfaces");
    } else if (backgroundMedian !== null && backgroundMedian < 0.3) {
      score += 2;
      reasons.push("mostly-dark-surfaces");
    }
    if (backgroundMedian !== null && foregroundMedian !== null && foregroundMedian > backgroundMedian + 0.3) {
      score += 1;
      reasons.push("light-text-on-dark-surface");
    }

    return {
      isNativeDark: score >= 3,
      confidence: Math.min(score / 6, 1),
      backgroundMedian,
      foregroundMedian,
      reasons
    };
  }

  function detectInDocument(documentObject = document, windowObject = window) {
    const selectors = ["html", "body", "main", "header", "nav", "article"];
    const backgrounds = [];
    const foregrounds = [];
    let declaredColorScheme = "";

    for (const selector of selectors) {
      const element = documentObject.querySelector(selector);
      if (!element) continue;
      const style = windowObject.getComputedStyle(element);
      backgrounds.push(style.backgroundColor);
      foregrounds.push(style.color);
      if (!declaredColorScheme && style.colorScheme) declaredColorScheme = style.colorScheme;
    }
    const meta = documentObject.querySelector('meta[name="color-scheme"]');
    if (meta?.content) declaredColorScheme += ` ${meta.content}`;
    const prefersDark = windowObject.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
    return evaluateSamples({ declaredColorScheme, prefersDark, backgrounds, foregrounds });
  }

  globalThis.PRISMNativeDark = Object.freeze({ median, evaluateSamples, detectInDocument });
})();

