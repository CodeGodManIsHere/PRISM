(() => {
  "use strict";

  const TRACKING_PARAMETERS = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "utm_name",
    "fbclid",
    "gclid",
    "dclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
    "igshid",
    "twclid",
    "vero_conv",
    "vero_id",
    "oly_anon_id",
    "oly_enc_id"
  ]);

  const PROTECTED_PARAMETERS = new Set([
    "code",
    "state",
    "token",
    "access_token",
    "id_token",
    "refresh_token",
    "signature",
    "sig",
    "key",
    "expires",
    "expiry",
    "nonce",
    "session",
    "session_id",
    "redirect_uri",
    "return_url",
    "continue",
    "invite",
    "invitation",
    "password_reset_token"
  ]);

  const PROTECTED_PATH = /\/(?:oauth|authorize|auth|login|signin|sso|payment|checkout|purchase|reset|recover|invite|download)(?:\/|$)/i;
  const SIGNATURE_PREFIXES = ["x-amz-", "x-goog-", "aws", "cloudfront-"];

  function hasProtectedFlow(url) {
    if (url.username || url.password || PROTECTED_PATH.test(url.pathname)) {
      return "protected-flow";
    }
    for (const key of url.searchParams.keys()) {
      const normalized = key.toLowerCase();
      if (PROTECTED_PARAMETERS.has(normalized) || SIGNATURE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
        return "signed-or-functional-parameter";
      }
    }
    return null;
  }

  function sanitizeURL(rawValue, options = {}) {
    if (typeof rawValue !== "string" || rawValue.length > 16384) {
      return { url: rawValue, changed: false, removed: [], bypassReason: "invalid-input" };
    }

    let url;
    try {
      url = new URL(rawValue, options.baseURL);
    } catch {
      return { url: rawValue, changed: false, removed: [], bypassReason: "invalid-url" };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { url: rawValue, changed: false, removed: [], bypassReason: "unsupported-scheme" };
    }

    const excludedDomains = new Set((options.excludedDomains ?? []).map((value) => String(value).toLowerCase()));
    if (excludedDomains.has(url.hostname.toLowerCase())) {
      return { url: rawValue, changed: false, removed: [], bypassReason: "domain-exclusion" };
    }

    const protectedReason = hasProtectedFlow(url);
    if (protectedReason) {
      return { url: rawValue, changed: false, removed: [], bypassReason: protectedReason };
    }

    const excludedParameters = new Set((options.excludedParameters ?? []).map((value) => String(value).toLowerCase()));
    const additionalParameters = new Set((options.additionalParameters ?? []).map((value) => String(value).toLowerCase()));
    const removed = [];

    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase();
      if (!excludedParameters.has(normalized) && (TRACKING_PARAMETERS.has(normalized) || additionalParameters.has(normalized))) {
        url.searchParams.delete(key);
        removed.push(key);
      }
    }

    if (removed.length === 0) {
      return { url: rawValue, changed: false, removed, bypassReason: null };
    }
    return { url: url.href, changed: true, removed, bypassReason: null };
  }

  globalThis.PRISMURLSanitizer = Object.freeze({
    TRACKING_PARAMETERS,
    PROTECTED_PARAMETERS,
    hasProtectedFlow,
    sanitizeURL
  });
})();

