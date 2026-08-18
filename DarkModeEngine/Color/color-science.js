(() => {
  "use strict";

  const clamp = (value, minimum = 0, maximum = 1) => Math.min(Math.max(value, minimum), maximum);

  function parseCSSColor(source) {
    if (typeof source !== "string") return null;
    const value = source.trim().toLowerCase();
    if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

    const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
    if (hex) {
      const raw = hex[1];
      if (![3, 4, 6, 8].includes(raw.length)) return null;
      const expanded = raw.length <= 4 ? [...raw].map((character) => character + character).join("") : raw;
      return {
        r: Number.parseInt(expanded.slice(0, 2), 16) / 255,
        g: Number.parseInt(expanded.slice(2, 4), 16) / 255,
        b: Number.parseInt(expanded.slice(4, 6), 16) / 255,
        a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
      };
    }

    const functional = /^rgba?\((.+)\)$/i.exec(value);
    if (!functional) return null;
    const normalized = functional[1].replace(/\s*\/\s*/, ",");
    const parts = normalized.includes(",") ? normalized.split(/\s*,\s*/) : normalized.trim().split(/\s+/);
    if (parts.length < 3 || parts.length > 4) return null;

    const channel = (part) => {
      if (part.endsWith("%")) return clamp(Number.parseFloat(part) / 100);
      return clamp(Number.parseFloat(part) / 255);
    };
    const alpha = (part) => {
      if (part === undefined) return 1;
      if (part.endsWith("%")) return clamp(Number.parseFloat(part) / 100);
      return clamp(Number.parseFloat(part));
    };
    const color = { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: alpha(parts[3]) };
    return Object.values(color).every(Number.isFinite) ? color : null;
  }

  function formatCSSColor(color) {
    const r = Math.round(clamp(color.r) * 255);
    const g = Math.round(clamp(color.g) * 255);
    const b = Math.round(clamp(color.b) * 255);
    const a = clamp(color.a ?? 1);
    return a >= 0.999 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a.toFixed(3)})`;
  }

  const srgbToLinearChannel = (value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const linearToSrgbChannel = (value) => value <= 0.0031308 ? 12.92 * value : 1.055 * (value ** (1 / 2.4)) - 0.055;

  function srgbToOKLab(color) {
    const r = srgbToLinearChannel(clamp(color.r));
    const g = srgbToLinearChannel(clamp(color.g));
    const b = srgbToLinearChannel(clamp(color.b));
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const lRoot = Math.cbrt(l);
    const mRoot = Math.cbrt(m);
    const sRoot = Math.cbrt(s);
    return {
      L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
      a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
      b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
      alpha: color.a ?? 1
    };
  }

  function oklabToSrgb(color) {
    const lRoot = color.L + 0.3963377774 * color.a + 0.2158037573 * color.b;
    const mRoot = color.L - 0.1055613458 * color.a - 0.0638541728 * color.b;
    const sRoot = color.L - 0.0894841775 * color.a - 1.291485548 * color.b;
    const l = lRoot ** 3;
    const m = mRoot ** 3;
    const s = sRoot ** 3;
    return {
      r: clamp(linearToSrgbChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
      g: clamp(linearToSrgbChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
      b: clamp(linearToSrgbChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
      a: clamp(color.alpha ?? 1)
    };
  }

  function oklabToOKLCH(color) {
    const C = Math.hypot(color.a, color.b);
    const h = C < 0.000001 ? 0 : ((Math.atan2(color.b, color.a) * 180 / Math.PI) + 360) % 360;
    return { L: color.L, C, h, alpha: color.alpha ?? 1 };
  }

  function oklchToOKLab(color) {
    const radians = color.h * Math.PI / 180;
    return {
      L: color.L,
      a: color.C * Math.cos(radians),
      b: color.C * Math.sin(radians),
      alpha: color.alpha ?? 1
    };
  }

  function relativeLuminance(color) {
    return 0.2126 * srgbToLinearChannel(clamp(color.r)) +
      0.7152 * srgbToLinearChannel(clamp(color.g)) +
      0.0722 * srgbToLinearChannel(clamp(color.b));
  }

  function contrastRatio(foreground, background) {
    const first = relativeLuminance(foreground);
    const second = relativeLuminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }

  function transformForDark(source, role = "background") {
    const parsed = typeof source === "string" ? parseCSSColor(source) : source;
    if (!parsed || parsed.a < 0.015) return parsed;
    const lch = oklabToOKLCH(srgbToOKLab(parsed));

    if (role === "background") {
      if (lch.L > 0.34) lch.L = clamp(0.08 + (1 - lch.L) * 0.18, 0.08, 0.25);
      lch.C = Math.min(lch.C, 0.08);
    } else if (role === "text") {
      if (lch.L < 0.68) lch.L = clamp(0.82 + lch.L * 0.12, 0.82, 0.94);
      lch.C = Math.min(lch.C, 0.12);
    } else if (role === "link" || role === "accent") {
      lch.L = clamp(Math.max(lch.L, 0.7), 0.7, 0.86);
      lch.C = Math.min(lch.C, 0.18);
    } else if (role === "border") {
      lch.L = clamp(0.34 + lch.L * 0.12, 0.34, 0.5);
      lch.C = Math.min(lch.C, 0.06);
    }
    return oklabToSrgb(oklchToOKLab(lch));
  }

  function ensureContrast(foreground, background, minimum = 4.5) {
    if (contrastRatio(foreground, background) >= minimum) return foreground;
    const lch = oklabToOKLCH(srgbToOKLab(foreground));
    const backgroundLuminance = relativeLuminance(background);
    const direction = backgroundLuminance < 0.5 ? 1 : -1;
    for (let index = 0; index < 24; index += 1) {
      lch.L = clamp(lch.L + direction * 0.03);
      lch.C *= 0.98;
      const candidate = oklabToSrgb(oklchToOKLab(lch));
      if (contrastRatio(candidate, background) >= minimum) return candidate;
    }
    return backgroundLuminance < 0.5
      ? { r: 0.95, g: 0.95, b: 0.95, a: foreground.a ?? 1 }
      : { r: 0.05, g: 0.05, b: 0.05, a: foreground.a ?? 1 };
  }

  globalThis.PRISMColor = Object.freeze({
    clamp,
    parseCSSColor,
    formatCSSColor,
    srgbToOKLab,
    oklabToSrgb,
    oklabToOKLCH,
    oklchToOKLab,
    relativeLuminance,
    contrastRatio,
    transformForDark,
    ensureContrast
  });
})();

