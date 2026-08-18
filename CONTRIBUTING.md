# Contributing

1. Use Node.js 24 or later and run `npm test && npm run validate` on every change.
2. On macOS, install Xcode 26.6 and XcodeGen 2.46.0, run `xcodegen generate`, then build and test the `PRISM` scheme.
3. Do not commit generated `.xcodeproj`, derived data, signing material, or benchmark results.
4. Add a deterministic test for behavior changes. Site fixes belong in the site-fix registry, not scattered hostname checks.
5. Document every external filter source and license before adding its data.
6. Do not add telemetry, analytics SDKs, remote executable code, or a backend.

Pull requests should state what was implemented, what was actually validated, and what still requires Xcode/device verification.

