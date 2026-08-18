import test from "node:test";
import assert from "node:assert/strict";

await import("../../DarkModeEngine/Color/color-science.js");
await import("../../DarkModeEngine/Analyzer/native-dark.js");
const color = globalThis.PRISMColor;

test("round-trips sRGB through OKLab", () => {
  const original = { r: 0.18, g: 0.52, b: 0.91, a: 1 };
  const roundTrip = color.oklabToSrgb(color.srgbToOKLab(original));
  assert.ok(Math.abs(roundTrip.r - original.r) < 0.0001);
  assert.ok(Math.abs(roundTrip.g - original.g) < 0.0001);
  assert.ok(Math.abs(roundTrip.b - original.b) < 0.0001);
});

test("dark transformation creates dark surfaces and readable text", () => {
  const background = color.transformForDark("rgb(250 250 250)", "background");
  const text = color.transformForDark("rgb(25 25 25)", "text");
  const adjusted = color.ensureContrast(text, background, 4.5);
  assert.ok(color.relativeLuminance(background) < 0.12);
  assert.ok(color.contrastRatio(adjusted, background) >= 4.5);
});

test("native-dark detection requires rendered evidence or a strong combination", () => {
  const dark = globalThis.PRISMNativeDark.evaluateSamples({
    declaredColorScheme: "light dark",
    prefersDark: true,
    backgrounds: ["rgb(18 20 24)", "rgb(25 28 33)"],
    foregrounds: ["rgb(235 235 238)", "rgb(210 213 220)"]
  });
  assert.equal(dark.isNativeDark, true);
  const light = globalThis.PRISMNativeDark.evaluateSamples({
    backgrounds: ["rgb(255 255 255)"],
    foregrounds: ["rgb(20 20 20)"]
  });
  assert.equal(light.isNativeDark, false);
});

