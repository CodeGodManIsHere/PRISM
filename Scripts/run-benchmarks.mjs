import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

await import("../SafariExtension/Resources/shared/protocol.js");
await import("../PrivacyEngine/Models/settings-resolution.js");
await import("../PrivacyEngine/Sanitizer/url-sanitizer.js");
await import("../DarkModeEngine/Color/color-science.js");

function measure(iterations, callback) {
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) callback(index);
  return performance.now() - started;
}

const results = {
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  platform: `${os.platform()} ${os.arch()}`,
  measurements: {
    colorTransform50000Milliseconds: measure(50000, (index) => {
      globalThis.PRISMColor.transformForDark(`rgb(${index % 256} ${(index * 3) % 256} ${(index * 7) % 256})`, index % 2 ? "text" : "background");
    }),
    URLSanitation50000Milliseconds: measure(50000, (index) => {
      globalThis.PRISMURLSanitizer.sanitizeURL(`https://example.com/item/${index}?utm_source=test&id=${index}`);
    }),
    profileResolution50000Milliseconds: measure(50000, () => {
      globalThis.PRISMSettings.resolveSettings("example.com", {
        global: { protectionEnabled: true, protectionPreset: "balanced", darkMode: "automatic", cleanURLs: true },
        profiles: {},
        customRules: []
      });
    })
  }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await writeFile(path.join(root, "benchmark-results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(results)}\n`);

