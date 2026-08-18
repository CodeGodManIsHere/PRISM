# Dependencies

PRISM runtime code uses only Swift, SwiftUI, Foundation, SafariServices, and browser/Web APIs supplied by Apple. There are no third-party runtime SDKs.

| Dependency | Version | Purpose | License | Upstream |
| --- | --- | --- | --- | --- |
| Xcode | 26.6 | compile, test, archive | Apple developer tools terms | [Apple](https://developer.apple.com/xcode/) |
| XcodeGen | 2.46.0 | reproducible `.xcodeproj` generation | MIT | [GitHub](https://github.com/yonaskolb/XcodeGen) |
| Node.js | 24.x | deterministic filter compiler and Linux tests | MIT | [Node.js](https://nodejs.org/) |
| GitHub Actions official actions | major versions pinned in workflows | checkout, Node setup, artifacts | MIT | [GitHub Actions](https://github.com/actions) |

The generated Xcode project is intentionally untracked; `project.yml` is the source of truth.

