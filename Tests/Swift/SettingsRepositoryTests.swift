import XCTest
@testable import PRISM

final class SettingsRepositoryTests: XCTestCase {
    func testRoundTripAndRevision() throws {
        let suiteName = "com.prism.tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let repository = SettingsRepository(defaults: defaults)

        let saved = try repository.update { envelope in
            envelope.global.cleanURLs = false
            envelope.profiles["example.com"] = SiteProfile(domain: "example.com", darkMode: .alwaysOn)
        }
        XCTAssertEqual(saved.revision, 1)
        XCTAssertFalse(repository.load().global.cleanURLs)
        XCTAssertEqual(repository.load().profiles["example.com"]?.darkMode, .alwaysOn)
    }

    func testInvalidCSSIsRemovedDuringSanitization() throws {
        let suiteName = "com.prism.tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let repository = SettingsRepository(defaults: defaults)
        var envelope = SettingsEnvelope.default
        envelope.profiles["example.com"] = SiteProfile(domain: "example.com", customCSS: "@import 'remote.css';")
        let saved = try repository.save(envelope)
        XCTAssertEqual(saved.profiles["example.com"]?.customCSS, "")
    }
}

