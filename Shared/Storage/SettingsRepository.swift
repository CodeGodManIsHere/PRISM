import Foundation

final class SettingsRepository: @unchecked Sendable {
    static let appGroupIdentifier = "group.com.prism.privacy.shared"
    private static let storageKey = "prism.settings.envelope.v1"

    private let defaults: UserDefaults
    private let lock = NSLock()
    let usesAppGroup: Bool

    init(defaults: UserDefaults? = UserDefaults(suiteName: SettingsRepository.appGroupIdentifier)) {
        if let defaults {
            self.defaults = defaults
            usesAppGroup = true
        } else {
            self.defaults = .standard
            usesAppGroup = false
        }
    }

    func load() -> SettingsEnvelope {
        lock.prismWithLock {
            guard let data = defaults.data(forKey: Self.storageKey),
                  let envelope = try? JSONDecoder().decode(SettingsEnvelope.self, from: data),
                  envelope.schemaVersion == SettingsEnvelope.currentSchemaVersion
            else {
                return .default
            }
            return sanitize(envelope)
        }
    }

    @discardableResult
    func save(_ proposed: SettingsEnvelope) throws -> SettingsEnvelope {
        try lock.prismWithLock {
            var envelope = sanitize(proposed)
            envelope.schemaVersion = SettingsEnvelope.currentSchemaVersion
            envelope.revision = max(0, proposed.revision) + 1
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(envelope)
            defaults.set(data, forKey: Self.storageKey)
            return envelope
        }
    }

    @discardableResult
    func update(_ mutation: (inout SettingsEnvelope) throws -> Void) throws -> SettingsEnvelope {
        try lock.prismWithLock {
            var envelope: SettingsEnvelope
            if let data = defaults.data(forKey: Self.storageKey),
               let decoded = try? JSONDecoder().decode(SettingsEnvelope.self, from: data),
               decoded.schemaVersion == SettingsEnvelope.currentSchemaVersion {
                envelope = sanitize(decoded)
            } else {
                envelope = .default
            }
            try mutation(&envelope)
            envelope = sanitize(envelope)
            envelope.schemaVersion = SettingsEnvelope.currentSchemaVersion
            envelope.revision = max(0, envelope.revision) + 1
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            defaults.set(try encoder.encode(envelope), forKey: Self.storageKey)
            return envelope
        }
    }

    func reset() {
        lock.prismWithLock {
            defaults.removeObject(forKey: Self.storageKey)
        }
    }

    private func sanitize(_ input: SettingsEnvelope) -> SettingsEnvelope {
        var envelope = input
        envelope.global.scheduleStartMinutes = min(max(envelope.global.scheduleStartMinutes, 0), 1_439)
        envelope.global.scheduleEndMinutes = min(max(envelope.global.scheduleEndMinutes, 0), 1_439)
        envelope.customRules = Array(envelope.customRules.prefix(1_000)).filter {
            $0.text.count <= CustomRuleValidator.maximumLength
        }

        var profiles: [String: SiteProfile] = [:]
        for profile in envelope.profiles.values.prefix(2_000) {
            guard let domain = DomainNormalizer.normalize(profile.domain) else { continue }
            var sanitized = profile
            sanitized.domain = domain
            if sanitized.customCSS.count > CustomCSSValidator.maximumLength {
                sanitized.customCSS = String(sanitized.customCSS.prefix(CustomCSSValidator.maximumLength))
            }
            if CustomCSSValidator.error(for: sanitized.customCSS) != nil {
                sanitized.customCSS = ""
            }
            profiles[domain] = sanitized
        }
        envelope.profiles = profiles
        return envelope
    }
}

private extension NSLock {
    func prismWithLock<T>(_ body: () throws -> T) rethrows -> T {
        lock()
        defer { unlock() }
        return try body()
    }
}
