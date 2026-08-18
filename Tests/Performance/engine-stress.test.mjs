import test from "node:test";
import assert from "node:assert/strict";

await import("../../DarkModeEngine/Color/color-science.js");
const { parseSource } = await import("../../PrivacyEngine/Parser/filter-parser.mjs");
const { compileRules } = await import("../../PrivacyEngine/Compiler/compile-rules.mjs");

test("transforms 50,000 deterministic colors without invalid channels", () => {
  for (let index = 0; index < 50000; index += 1) {
    const transformed = globalThis.PRISMColor.transformForDark(
      `rgb(${index % 256} ${(index * 3) % 256} ${(index * 7) % 256})`,
      index % 3 === 0 ? "background" : "text"
    );
    assert.ok(Object.values(transformed).every(Number.isFinite));
  }
});

test("parses and compiles 50,000 supported rules deterministically", () => {
  const rules = Array.from({ length: 50000 }, (_, index) => ({
    pattern: `||tracker-${index}.example^`,
    action: "block",
    category: "stress",
    resourceTypes: ["script", "image"]
  }));
  const parsed = parseSource({ schemaVersion: 1, id: "stress", version: "1", license: "MIT", source: "test", rules });
  const compiled = compileRules(parsed);
  assert.equal(compiled.length, 50000);
  assert.equal(new Set(compiled.map((rule) => rule.id)).size, 50000);
});

