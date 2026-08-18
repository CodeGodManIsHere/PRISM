import test from "node:test";
import assert from "node:assert/strict";

await import("../../SafariExtension/Resources/shared/protocol.js");
await import("../../PrivacyEngine/Models/settings-resolution.js");

test("normalizes domains without accepting malformed labels", () => {
  assert.equal(globalThis.PRISMSettings.normalizeDomain(" HTTPS://Example.COM/path "), "example.com");
  assert.equal(globalThis.PRISMSettings.normalizeDomain("-bad.example"), null);
  assert.equal(globalThis.PRISMSettings.normalizeDomain("bad_.example"), null);
});

test("resolves global, site, compatibility, then temporary precedence", () => {
  const envelope = {
    global: {
      protectionEnabled: true,
      protectionPreset: "strict",
      darkMode: "automatic",
      cleanURLs: true,
      imagePolicy: "automatic",
      scheduleStartMinutes: 1200,
      scheduleEndMinutes: 420
    },
    profiles: {
      "example.com": {
        protection: "balanced",
        darkMode: "alwaysOff",
        cleanURLs: false,
        imagePolicy: "unchanged",
        customCSS: "body { color: white; }",
        compatibilityMode: true
      }
    },
    customRules: []
  };
  const effective = globalThis.PRISMSettings.resolveSettings("example.com", envelope, {
    protection: "disabled",
    darkMode: "alwaysOn",
    cleanURLs: true
  });
  assert.equal(effective.protection, "disabled");
  assert.equal(effective.darkMode, "alwaysOn");
  assert.equal(effective.cleanURLs, true);
  assert.equal(effective.imagePolicy, "unchanged");
});

test("falls back to safe defaults for malformed settings", () => {
  const effective = globalThis.PRISMSettings.resolveSettings("example.com", { global: { darkMode: "unknown" } });
  assert.equal(effective.darkMode, "automatic");
  assert.equal(effective.protection, "balanced");
  assert.equal(effective.cleanURLs, true);
});

