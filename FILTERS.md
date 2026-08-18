# Filter sources

Version 0.1 contains a small, original baseline ruleset authored for PRISM and distributed under the repository's MIT license. It targets a conservative set of widely identified advertising, analytics, and social-widget hostnames. It is not copied from Wipr, Noir, EasyList, AdGuard, or any proprietary database.

| Source | Canonical source | Version | License | Transformation | Category |
| --- | --- | --- | --- | --- | --- |
| PRISM Core | `PrivacyEngine/Rules/core-rules.json` | `bundled-1` | MIT | validated, canonicalized, deduplicated, stable-ID DNR compilation | advertising, tracking, analytics |
| PRISM Strict | `PrivacyEngine/Rules/strict-rules.json` | `bundled-1` | MIT | same compiler; enabled only by Strict | social and additional trackers |

The compiler emits deterministic JSON into `SafariExtension/Resources/rules/`. Diagnostics come from actual input/output values. Invalid rules fail the build; an updater must retain the previous known-good ruleset.

No remote list updater is enabled in 0.1. Before integrating any third-party list, record its exact license, attribution requirements, update URL, version mechanism, and redistribution/transformation permission here.

