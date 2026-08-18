import XCTest
@testable import PRISM

final class ProfileResolverTests: XCTestCase {
    func testResolutionPrecedence() {
        var envelope = SettingsEnvelope.default
        envelope.global.protectionPreset = .strict
        envelope.global.darkMode = .automatic
        envelope.profiles["example.com"] = SiteProfile(
            domain: "example.com",
            protection: .balanced,
            darkMode: .alwaysOff,
            cleanURLs: false,
            imagePolicy: .unchanged,
            compatibilityMode: true
        )

        let effective = ProfileResolver.resolve(
            domain: "example.com",
            envelope: envelope,
            temporary: TemporaryOverride(protection: .disabled, darkMode: .alwaysOn, cleanURLs: true)
        )
        XCTAssertEqual(effective.protection, .disabled)
        XCTAssertEqual(effective.darkMode, .alwaysOn)
        XCTAssertTrue(effective.cleanURLs)
        XCTAssertEqual(effective.imagePolicy, .unchanged)
    }

    func testDomainValidation() {
        XCTAssertEqual(DomainNormalizer.normalize("HTTPS://Example.COM/path"), "example.com")
        XCTAssertNil(DomainNormalizer.normalize("-invalid.example"))
        XCTAssertNil(DomainNormalizer.normalize("bad_.example"))
    }

    func testCustomRuleValidation() {
        XCTAssertEqual(CustomRuleValidator.parse("||tracker.example^"), .success(.blockDomain("tracker.example")))
        XCTAssertEqual(CustomRuleValidator.parse("@@||safe.example^"), .success(.allowDomain("safe.example")))
        XCTAssertEqual(
            CustomRuleValidator.parse("example.com##.advert"),
            .success(.hideElement(domain: "example.com", selector: ".advert"))
        )
        XCTAssertNotNil(CustomCSSValidator.error(for: "@import url(https://example.com/style.css);"))
    }
}

