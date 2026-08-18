# Privacy model

PRISM has no account, backend, telemetry, analytics SDK, advertising SDK, user profile, or browsing-history upload. All product settings and optional aggregate counters stay in the App Group container on the device.

## Data handled locally

- global protection, dark-mode, and URL-cleaning settings;
- site profiles keyed by normalized host name;
- custom rules and per-site CSS authored by the user;
- ruleset metadata and compiler status;
- optional aggregate operational counters, disabled by default.

PRISM does not persist page text, form values, cookies, passwords, tokens, full URLs, or a chronological list of visited sites. A domain is persisted only when the user creates a site profile. Diagnostics omit domains unless the user explicitly includes one for a support export.

## Network use

Version 0.1 performs no application-originated network requests. Future filter updates may download documented data files from allowlisted upstream projects. Such requests must contain no browsing data and must pass the stage/validate/activate process before use.

## Website access

Safari asks the user where the extension may run. PRISM needs website access for content-script dark mode and URL cleaning. Declarative blocking uses Safari's own rules engine. The extension does not operate outside permissions granted in Safari.

## Optional local statistics

When enabled, PRISM stores only aggregate integer counts such as pages processed, URLs cleaned, and dark transformations completed. It does not attach timestamps, URLs, domains, or page content. Counters can be reset at any time.

## Diagnostic export

Exports may include the app/OS version, non-sensitive settings, ruleset version, aggregate counters, engine timings, and validation warnings. They exclude credentials, cookies, tokens, form values, private page text, and browsing history.

