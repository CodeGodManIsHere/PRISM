import test from "node:test";
import assert from "node:assert/strict";

await import("../../SafariExtension/Resources/shared/protocol.js");
await import("../../PrivacyEngine/Models/settings-resolution.js");
await import("../../PrivacyEngine/Compiler/custom-rule-compiler.js");
const { parseSource } = await import("../../PrivacyEngine/Parser/filter-parser.mjs");
const { compileRules } = await import("../../PrivacyEngine/Compiler/compile-rules.mjs");

test("parser canonicalizes and deduplicates supported rules", () => {
  const parsed = parseSource({
    schemaVersion: 1,
    id: "test",
    version: "1",
    license: "MIT",
    source: "test",
    rules: [
      { pattern: "||EXAMPLE.com^", action: "block", category: "Tracking", resourceTypes: ["script", "image"] },
      { pattern: "||example.com^", action: "block", category: "tracking", resourceTypes: ["image", "script"] }
    ]
  });
  assert.equal(parsed.rules.length, 1);
  assert.equal(parsed.diagnostics.deduplicatedRules, 1);
});

test("compiled IDs and bytes are deterministic", () => {
  const parsed = parseSource({
    schemaVersion: 1,
    id: "test",
    version: "1",
    license: "MIT",
    source: "test",
    rules: [
      { pattern: "||one.example^", action: "block", category: "tracking", resourceTypes: ["script"] },
      { pattern: "||two.example^", action: "allow", category: "allow", resourceTypes: ["image"] }
    ]
  });
  assert.deepEqual(compileRules(parsed), compileRules(parsed));
});

test("custom compiler rejects unsupported syntax and creates stable rules", () => {
  const compiler = globalThis.PRISMCustomRuleCompiler;
  assert.equal(compiler.parseNetworkRule("/regex/"), null);
  const source = [{ text: "||tracker.example^", enabled: true }];
  assert.deepEqual(compiler.compileCustomNetworkRules(source), compiler.compileCustomNetworkRules(source));
  assert.equal(compiler.compileCustomNetworkRules(source)[0].action.type, "block");
});

test("site profiles add and subtract scoped static categories", () => {
  const compiler = globalThis.PRISMCustomRuleCompiler;
  const staticRules = {
    minimal: [{ id: 1, condition: { urlFilter: "||ads.example^", resourceTypes: ["script"] } }],
    balanced: [{ id: 2, condition: { urlFilter: "||analytics.example^", resourceTypes: ["script"] } }],
    strict: [{ id: 3, condition: { urlFilter: "||social.example^", resourceTypes: ["script"] } }]
  };
  const strict = compiler.compileProfileRules(
    { "site.example": { protection: "strict" } },
    { protectionEnabled: true, protectionPreset: "balanced" },
    staticRules
  );
  assert.equal(strict.length, 1);
  assert.equal(strict[0].action.type, "block");
  assert.deepEqual(strict[0].condition.initiatorDomains, ["site.example"]);

  const minimal = compiler.compileProfileRules(
    { "site.example": { protection: "minimal" } },
    { protectionEnabled: true, protectionPreset: "strict" },
    staticRules
  );
  assert.equal(minimal.length, 2);
  assert.ok(minimal.every((rule) => rule.action.type === "allow"));
});
