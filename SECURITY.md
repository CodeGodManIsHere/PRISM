# Security

## Trust boundaries

PRISM treats the webpage, content script, extension background context, native extension, and containing app as separate trust zones. Every cross-zone message is a versioned object with an allowlisted operation and bounded values.

Security controls include:

- no `eval`, `new Function`, remote scripts, inline extension scripts, or unsafe HTML assignment;
- a restrictive extension-page content security policy;
- normalized domain inputs and bounded custom-rule/CSS lengths;
- custom CSS rejects imports, remote URLs, script schemes, and legacy executable constructs;
- no arbitrary file paths or URL fetching through native messaging;
- App Group storage contains one validated Codable envelope;
- signing material is accepted only through CI secrets and never logged or committed.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that exposes user data or enables code execution. Send a private report to the repository owner with reproduction steps, affected version, impact, and a proposed mitigation if available. No public security contact exists yet; this must be configured before a public release.

## Supported versions

Until the first tagged public release, only the latest commit is supported. This is a source repository under active development, not a security-audited release.

