# Safari capability record

Last reviewed: 2026-08-18. Target toolchain: Xcode 26.6 (Swift 6.3, iOS 26.5 SDK). Minimum deployment: iOS/iPadOS 18.0. Xcode 27 is still a preview and is intentionally not part of the reproducible build.

This document records platform limits that directly shape PRISM. It is not a generic WebExtensions compatibility table.

| Feature | Supported | API / mechanism | Minimum OS used by PRISM | Limitations | PRISM fallback |
| --- | --- | --- | --- | --- | --- |
| Safari Web Extension | Yes | SafariServices + WebExtensions | iOS/iPadOS 18 | Users control extension and website access. APIs differ from Chromium. | Features remain off until Safari access is granted. |
| Manifest V3 | Yes | `manifest_version: 3` | iOS/iPadOS 18 | Background logic has a service-worker lifecycle; it is not a permanent process. | Persist durable state and rehydrate on every wake. |
| Declarative blocking | Yes | `browser.declarativeNetRequest` | iOS/iPadOS 18 | Declarative rules do not expose a general request-interception callback. | Compile deterministic static/dynamic rules; never proxy traffic. |
| Static rulesets | Yes | `declarative_net_request.rule_resources` | iOS/iPadOS 18 | Updates normally arrive with an app release. | Keep a small audited bundled baseline. |
| Dynamic/session rules | Yes | `updateDynamicRules`, `updateSessionRules` | iOS/iPadOS 18 | Capacity is platform-defined. Safari 16.4 documented a combined dynamic/session limit of 5,000; code must read the runtime constant rather than assume it. | Reject overflow safely and retain the last active rules. |
| Rule match information | Partial | `getMatchedRules`, action-count badge | iOS/iPadOS 18 | This is not a complete request log and permission/lifecycle constraints apply. | Do not present historical blocked-request totals as exact telemetry. |
| Traditional Safari Content Blocker | Yes, not selected for v0.1 | `SFContentBlockerManager`, JSON content-blocking rules | iOS 9 | Separate target and activation path; limited runtime coordination. | PRISM v0.1 uses DNR to avoid two contradictory blocker states. Revisit only with measured benefit. |
| Element hiding | Yes | Content-script CSS and DNR-compatible rules | iOS/iPadOS 18 | Requires website access; selectors can break sites. | Validate selectors and allow per-site compatibility mode. |
| Content scripts | Yes | Manifest content scripts | iOS/iPadOS 18 | Execute only where the user grants access; webpage data is hostile. | Validate all messages and keep page content out of native storage. |
| Background/service worker | Yes | MV3 `background.service_worker` | iOS/iPadOS 18 | May be suspended at any time. Timers are not a durability mechanism. | Event-driven initialization and idempotent synchronization. |
| Extension storage | Yes | `browser.storage.local` | iOS/iPadOS 18 | Safari Profiles have separate extension instances/storage. | Native settings remain authoritative; extension storage is only a cache. |
| Native messaging | Yes | `browser.runtime.sendNativeMessage` → `SafariWebExtensionHandler` | iOS/iPadOS 18 | Messages are asynchronous and untrusted; the containing app cannot directly run page JavaScript. | Small versioned message schema with allowlisted operations. |
| Containing app communication | Yes, request/response | `SafariWebExtensionHandler`, App Group | iOS/iPadOS 18 | No reliable always-live app-to-service-worker push channel on iOS. | New pages and popup interactions refresh state; current pages may require reload after an app-only change. |
| Shared app state | Yes | App Group `UserDefaults` | iOS/iPadOS 18 | Requires matching entitlements/provisioning. | Safe in-process defaults if the suite is unavailable; UI reports degraded storage. |
| Per-site permissions | Yes | Safari website-access UI and WebExtension host permissions | iOS/iPadOS 18 | The user, not the extension, grants access. | Explain activation; never attempt to bypass the permission model. |
| Private Browsing | User controlled | Safari extension setting | iOS/iPadOS 18 | Since Safari 17, extensions that access webpage/browsing data are off by default in Private Browsing. | Work only when explicitly enabled; collect no page history in either mode. |
| Safari Profiles | Yes | Safari profile-scoped extension instances | iOS/iPadOS 18 | Each profile has distinct storage/background context; site permissions are shared. | Rehydrate native settings in each instance. |
| Popup UI | Yes | HTML/CSS/JavaScript action popup | iOS/iPadOS 18 | It is web UI, not SwiftUI; CSS blur is not native Liquid Glass. | Compact accessible controls with no fake glass claim. |
| Native app UI | Yes | SwiftUI | iOS/iPadOS 18 | Extension activation still occurs in Safari Settings. | Provide accurate onboarding and state, not a fake enable switch. |
| Liquid Glass | Yes on new OS | `glassEffect(_:in:)`, `GlassEffectContainer`, `.buttonStyle(.glass)` | iOS/iPadOS 26 for glass; iOS/iPadOS 18 overall | APIs require the iOS 26 SDK/runtime. | Availability-gated system materials on iOS 18–25, clearly documented as fallback. |
| Native dark-site detection | Yes, content-script derived | `color-scheme`, media query, computed styles | iOS/iPadOS 18 | Sites can provide incomplete or misleading signals. | Combine declared and rendered evidence; favor the native theme when credible. |
| DOM mutation handling | Yes | `MutationObserver`, `requestIdleCallback` when present | iOS/iPadOS 18 | Virtualized/closed shadow DOM may be inaccessible. | Batch dirty roots and leave inaccessible content unchanged. |
| URL cleaning | Partial | Content-script navigation/link sanitation | iOS/iPadOS 18 | A content script cannot safely rewrite every navigation before the first request, and signed/auth URLs must be preserved. | Clean known parameters only; bypass protected flows and provide exclusions. |
| Full request observation | No | Not exposed as a general privacy-safe stream | — | PRISM cannot defensibly reconstruct every blocked load, response, or winning rule. | Report only settings and locally observed engine actions. |
| Arbitrary request callback blocking | No for chosen architecture | DNR is declarative | — | Blocking decisions cannot depend on executing custom code for every request. | Compile supported custom rules to DNR. |
| Remote executable code | Technically possible on the web, prohibited by product policy | — | — | Violates PRISM's trust model and App Store expectations. | Ship all JavaScript in the signed extension bundle; download data only. |
| Packaging | Yes | Containing `.app` with `PlugIns/*.appex` | iOS/iPadOS 18 | Device installation requires valid Apple signing/provisioning. | CI may emit a verified unsigned archive for inspection, explicitly not installable. |

## Architecture consequences

1. PRISM uses DNR static rules plus bounded dynamic/session rules. It does not run a local VPN, proxy, or per-request JavaScript hook.
2. Exact historical “blocked” totals are omitted. Safari can expose action counts/matched rules in some contexts, but that is not equivalent to complete, durable network telemetry.
3. The app and extension share a versioned settings envelope through an App Group. Native messaging refreshes that state into the extension's short-lived background context.
4. Dark mode and URL cleaning require website permission because they operate as content scripts.
5. A setting changed only in the containing app may require the page or popup to be reopened. The UI must state this rather than implying live push.
6. Liquid Glass is native only on iOS/iPadOS 26+. Older systems use standard SwiftUI material as an explicit compatibility fallback.

## Primary references

- [Apple: Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
- [Apple: Adopting declarative content blocking](https://developer.apple.com/documentation/safariservices/adopting-declarative-content-blocking-in-safari-web-extensions)
- [Apple: Messaging between the app and JavaScript](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)
- [Apple: Managing Safari Web Extension permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions)
- [Apple WWDC21: Meet Safari Web Extensions on iOS](https://developer.apple.com/videos/play/wwdc2021/10104/)
- [Apple WWDC21: Explore Safari Web Extension improvements](https://developer.apple.com/videos/play/wwdc2021/10027/)
- [WebKit: Safari 16.4 DNR enhancements](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
- [WebKit: Safari 17 extension permissions and Private Browsing](https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/)
- [Apple: Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
- [Apple: `GlassEffectContainer`](https://developer.apple.com/documentation/swiftui/glasseffectcontainer)
- [Apple: Xcode 26.6 release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-26_6-release-notes)
- [GitHub runner-images: Xcode 27 preview image and stable Xcode inventory](https://github.com/actions/runner-images/issues/14404)
- [XcodeGen 2.46.0 release](https://github.com/yonaskolb/XcodeGen/releases/tag/2.46.0)

