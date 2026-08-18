# Architecture

## Design boundary

PRISM is an iOS/iPadOS containing app plus one embedded Safari Web Extension. Version 0.1 intentionally does not add a VPN, proxy, backend, analytics service, large database, or separate legacy Content Blocker target.

The selected split is:

| Component | Responsibility | Trust level |
| --- | --- | --- |
| SwiftUI app | durable settings UI, site profiles, custom rules/CSS, diagnostics | trusted local app |
| App Group envelope | versioned Codable state shared across app and native extension | trusted local storage |
| `SafariWebExtensionHandler` | allowlisted request/response bridge and validation | privileged extension boundary |
| MV3 service worker | short-lived state hydration and DNR ruleset synchronization | privileged extension JS |
| Popup | active-site controls | privileged extension page |
| Content script | URL cleaning, dark rendering, element hiding | isolated but exposed to hostile page structure |
| Safari DNR | declarative network decisions | browser-owned engine |

## State model

`SettingsEnvelope` is the single durable record. It contains schema/revision numbers, global settings, normalized-domain profiles, validated custom rules, optional aggregate metrics, and ruleset version. The repository writes one sorted JSON value to App Group `UserDefaults`; mutation happens under a process-local lock and values are sanitized before every write.

Resolution order is:

```text
safe defaults
→ global preset
→ normalized-domain profile
→ compatibility override
→ temporary override
```

The Swift and JavaScript resolvers have parallel deterministic tests. Native settings are authoritative; `browser.storage.local` is only a service-worker fallback cache and is profile-scoped by Safari.

## Messaging

Every native message has `version: 1`, an allowlisted `type`, bounded keys/values, and a structured response. Supported native operations are:

- `getSettings`;
- `getEffectiveSettings`;
- `setGlobalSetting`;
- `setSiteSetting`;
- `recordMetrics`.

There is no generic method invocation, arbitrary file access, remote URL fetch, or code-string execution. Domain, CSS, enum, length, and metric bounds are revalidated natively even if JavaScript validated them first.

## Privacy rule pipeline

```text
MIT source JSON
→ schema validation
→ canonicalization
→ deterministic deduplication
→ stable FNV-1a ID allocation
→ DNR JSON
→ byte comparison in validation
```

Bundled static categories are Minimal, Balanced, and Strict. The service worker enables the desired category combination and compiles validated user block/allow rules into one atomic `updateDynamicRules` call. Per-site Disabled/Compatibility profiles create high-priority `allowAllRequests` rules for the main frame. Dynamic additions are checked against Safari's runtime capacity when exposed.

An external updater is intentionally absent in 0.1. A future updater must download data, verify, parse, compile, validate, stage, and activate in that order, retaining the previous known-good set on any failure.

## URL sanitizer

The sanitizer removes only a documented allowlist of tracking parameters. It bypasses the entire URL when it detects credentials, OAuth/authentication paths, payment/checkout, password reset, invitation/download flows, functional tokens, or signature families such as `X-Amz-*` and `X-Goog-*`. It supports domain and parameter exclusions.

The current-page cleaner runs at `document_start`; link cleaning runs on the capture phase immediately before navigation. Safari may already have requested the top-level URL before a content script can replace it, so this is not claimed as pre-request interception.

## Dark engine

The pipeline is:

```text
settings and system appearance
→ rendered/declarative native-dark evidence
→ computed style scan
→ sRGB ↔ OKLab/OKLCH transformation
→ semantic role mapping
→ contrast correction
→ important inline override with reversible state
→ incremental mutation processing
```

Photographs, video, canvas, iframes, objects, and embedded media are never inverted. SVG paint colors are transformed without touching external paint servers. Gradients with explicit colors are transformed; gradients containing `url()` are left unchanged. Forms receive native dark `color-scheme` handling.

Original inline property values and priorities are kept in a `WeakMap`; tagged connected elements are restored when the engine stops. The color cache is capped at 2,048 entries. Mutation roots are ancestor-deduplicated and capped at 128; overflow triggers one bounded document recovery pass rather than unbounded queue growth. Work yields every 350 elements and caps a pass at 50,000 nodes.

## Native dark detection

Detection combines declared `color-scheme`, system preference, representative rendered surface luminance, and foreground/background direction. A declaration alone is not accepted as proof unless supported by appearance/rendered evidence. If a credible native dark theme exists, PRISM applies only validated user/site CSS and avoids dynamic recoloring.

## Custom CSS and element hiding

CSS is local and domain-scoped. Both Swift and JavaScript reject overlong input, imports, remote URLs, `javascript:`, legacy `expression()`, `-moz-binding`, and unbalanced braces. Styles are assigned through `textContent`, never HTML parsing.

Element selectors are bounded, reject rule/URL constructs, and must parse through `querySelector` before they are inserted into a style element. Invalid custom rules never activate.

## Native UI

`NavigationSplitView` supplies compact iPhone adaptation and a real iPad sidebar/detail structure. The main reading surfaces remain opaque and stable. Interface chrome/panels use public `glassEffect`/glass button APIs only inside iOS 26 availability checks. Reduce Transparency receives an opaque system-background fallback; older systems use standard native materials and are not described as Liquid Glass.

## Concurrency and lifecycle

- Filter compilation and JS tests run outside the app process at build time.
- App state mutations are serialized by `SettingsRepository` and performed from the main-actor `AppModel`.
- The MV3 service worker assumes suspension at any time and rehydrates on install, startup, or page/popup request.
- Content processing is event-driven; there is no permanent polling timer.
- Optional metrics are bounded aggregate deltas and never block page behavior.

## Failure behavior

| Failure | Safe outcome |
| --- | --- |
| App Group unavailable | app uses local fallback and reports degraded sharing |
| Native message fails | cached safe settings or unchanged page |
| DNR synchronization fails | previously active dynamic rules remain; error is diagnostic state |
| URL parse/protected flow | leave URL untouched |
| CSS/rule validation fails | reject without activation |
| Native dark uncertainty | transform only when rendered evidence does not indicate a native dark theme |
| Dark transformation exception | leave affected element/page unchanged |
| Optional metrics fail | browsing continues with no counter update |

## Reproducibility

XcodeGen 2.46.0 and Xcode 26.6 are checked by CI. `project.yml` uses JSON-compatible YAML so it is parseable on Windows/Linux without a YAML dependency. Every XcodeGen source/configuration path is validated before generation. Extension resources use explicit file references and resource-destination copy phases so their bundle subpaths do not depend on nested folder-reference behavior. Compiled rules are checked byte-for-byte. Generated Xcode projects, derived data, signing material, and host-specific benchmarks are untracked.
