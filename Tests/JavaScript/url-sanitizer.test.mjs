import test from "node:test";
import assert from "node:assert/strict";

await import("../../PrivacyEngine/Sanitizer/url-sanitizer.js");
const sanitizer = globalThis.PRISMURLSanitizer;

test("removes only known tracking parameters", () => {
  const result = sanitizer.sanitizeURL("https://example.com/article?id=42&utm_source=newsletter&fbclid=abc#part");
  assert.equal(result.changed, true);
  assert.deepEqual(result.removed.sort(), ["fbclid", "utm_source"]);
  assert.equal(result.url, "https://example.com/article?id=42#part");
});

test("preserves OAuth and login flows wholesale", () => {
  const OAuth = sanitizer.sanitizeURL("https://example.com/oauth/callback?code=secret&state=opaque&utm_source=mail");
  assert.equal(OAuth.changed, false);
  assert.equal(OAuth.bypassReason, "protected-flow");

  const functional = sanitizer.sanitizeURL("https://example.com/callback?code=secret&utm_source=mail");
  assert.equal(functional.changed, false);
  assert.equal(functional.bypassReason, "signed-or-functional-parameter");
});

test("preserves signed CDN and payment URLs", () => {
  const signed = sanitizer.sanitizeURL("https://cdn.example.com/file?X-Amz-Signature=secret&utm_campaign=x");
  assert.equal(signed.changed, false);
  const payment = sanitizer.sanitizeURL("https://shop.example/checkout?utm_source=ad");
  assert.equal(payment.changed, false);
});

test("honors exclusions and rejects non-web schemes", () => {
  const excluded = sanitizer.sanitizeURL("https://example.com/?utm_source=x", { excludedDomains: ["example.com"] });
  assert.equal(excluded.changed, false);
  const mail = sanitizer.sanitizeURL("mailto:user@example.com?utm_source=x");
  assert.equal(mail.changed, false);
  assert.equal(mail.bypassReason, "unsupported-scheme");
});

