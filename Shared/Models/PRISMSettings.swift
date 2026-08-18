import Foundation

enum ProtectionPreset: String, Codable, CaseIterable, Identifiable, Sendable {
    case balanced
    case strict
    case minimal
    case custom

    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

enum ProtectionMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case inherit
    case strict
    case balanced
    case minimal
    case compatibility
    case disabled

    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

enum DarkModePreference: String, Codable, CaseIterable, Identifiable, Sendable {
    case system
    case automatic
    case alwaysOn
    case alwaysOff
    case scheduled

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "System"
        case .automatic: "Automatic"
        case .alwaysOn: "Always On"
        case .alwaysOff: "Always Off"
        case .scheduled: "Scheduled"
        }
    }
}

enum ImagePolicy: String, Codable, CaseIterable, Identifiable, Sendable {
    case automatic
    case unchanged
    case slightlyDimmed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .automatic: "Automatic"
        case .unchanged: "Unchanged"
        case .slightlyDimmed: "Slightly Dimmed"
        }
    }
}

struct GlobalSettings: Codable, Equatable, Sendable {
    var protectionEnabled: Bool
    var protectionPreset: ProtectionPreset
    var darkMode: DarkModePreference
    var cleanURLs: Bool
    var imagePolicy: ImagePolicy
    var advancedMode: Bool
    var localStatisticsEnabled: Bool
    var scheduleStartMinutes: Int
    var scheduleEndMinutes: Int

    static let `default` = GlobalSettings(
        protectionEnabled: true,
        protectionPreset: .balanced,
        darkMode: .automatic,
        cleanURLs: true,
        imagePolicy: .automatic,
        advancedMode: false,
        localStatisticsEnabled: false,
        scheduleStartMinutes: 20 * 60,
        scheduleEndMinutes: 7 * 60
    )
}

struct SiteProfile: Codable, Equatable, Identifiable, Sendable {
    var domain: String
    var protection: ProtectionMode
    var darkMode: DarkModePreference?
    var cleanURLs: Bool?
    var imagePolicy: ImagePolicy?
    var customCSS: String
    var compatibilityMode: Bool

    var id: String { domain }

    init(
        domain: String,
        protection: ProtectionMode = .inherit,
        darkMode: DarkModePreference? = nil,
        cleanURLs: Bool? = nil,
        imagePolicy: ImagePolicy? = nil,
        customCSS: String = "",
        compatibilityMode: Bool = false
    ) {
        self.domain = domain
        self.protection = protection
        self.darkMode = darkMode
        self.cleanURLs = cleanURLs
        self.imagePolicy = imagePolicy
        self.customCSS = customCSS
        self.compatibilityMode = compatibilityMode
    }
}

struct CustomRule: Codable, Equatable, Identifiable, Sendable {
    var id: UUID
    var text: String
    var enabled: Bool

    init(id: UUID = UUID(), text: String, enabled: Bool = true) {
        self.id = id
        self.text = text
        self.enabled = enabled
    }
}

struct LocalMetrics: Codable, Equatable, Sendable {
    var pagesProcessed: Int
    var urlsCleaned: Int
    var darkPagesTransformed: Int
    var mutationBatches: Int

    static let zero = LocalMetrics(
        pagesProcessed: 0,
        urlsCleaned: 0,
        darkPagesTransformed: 0,
        mutationBatches: 0
    )

    mutating func add(_ delta: LocalMetrics) {
        pagesProcessed = Self.safeAdd(pagesProcessed, delta.pagesProcessed)
        urlsCleaned = Self.safeAdd(urlsCleaned, delta.urlsCleaned)
        darkPagesTransformed = Self.safeAdd(darkPagesTransformed, delta.darkPagesTransformed)
        mutationBatches = Self.safeAdd(mutationBatches, delta.mutationBatches)
    }

    private static func safeAdd(_ lhs: Int, _ rhs: Int) -> Int {
        let bounded = min(max(rhs, 0), 10_000)
        return lhs > Int.max - bounded ? Int.max : lhs + bounded
    }
}

struct SettingsEnvelope: Codable, Equatable, Sendable {
    static let currentSchemaVersion = 1

    var schemaVersion: Int
    var revision: Int
    var global: GlobalSettings
    var profiles: [String: SiteProfile]
    var customRules: [CustomRule]
    var metrics: LocalMetrics
    var rulesetVersion: String

    static let `default` = SettingsEnvelope(
        schemaVersion: currentSchemaVersion,
        revision: 0,
        global: .default,
        profiles: [:],
        customRules: [],
        metrics: .zero,
        rulesetVersion: "bundled-1"
    )
}

struct TemporaryOverride: Equatable, Sendable {
    var protection: ProtectionMode?
    var darkMode: DarkModePreference?
    var cleanURLs: Bool?
}

struct EffectiveSettings: Codable, Equatable, Sendable {
    var protection: ProtectionMode
    var darkMode: DarkModePreference
    var cleanURLs: Bool
    var imagePolicy: ImagePolicy
    var customCSS: String
    var compatibilityMode: Bool
    var scheduleStartMinutes: Int
    var scheduleEndMinutes: Int
    var localStatisticsEnabled: Bool
    var customRules: [CustomRule]
}

enum ProfileResolver {
    static func resolve(
        domain: String,
        envelope: SettingsEnvelope,
        temporary: TemporaryOverride? = nil
    ) -> EffectiveSettings {
        let normalized = DomainNormalizer.normalize(domain)
        let profile = normalized.flatMap { envelope.profiles[$0] }

        var protection = defaultProtection(for: envelope.global)
        if let profile, profile.protection != .inherit {
            protection = profile.protection
        }
        if profile?.compatibilityMode == true {
            protection = .compatibility
        }
        if let override = temporary?.protection {
            protection = override
        }

        var darkMode = profile?.darkMode ?? envelope.global.darkMode
        if let override = temporary?.darkMode {
            darkMode = override
        }

        var cleanURLs = profile?.cleanURLs ?? envelope.global.cleanURLs
        if let override = temporary?.cleanURLs {
            cleanURLs = override
        }

        return EffectiveSettings(
            protection: protection,
            darkMode: darkMode,
            cleanURLs: cleanURLs,
            imagePolicy: profile?.imagePolicy ?? envelope.global.imagePolicy,
            customCSS: profile?.customCSS ?? "",
            compatibilityMode: profile?.compatibilityMode ?? false,
            scheduleStartMinutes: envelope.global.scheduleStartMinutes,
            scheduleEndMinutes: envelope.global.scheduleEndMinutes,
            localStatisticsEnabled: envelope.global.localStatisticsEnabled,
            customRules: envelope.customRules.filter(\.enabled)
        )
    }

    private static func defaultProtection(for global: GlobalSettings) -> ProtectionMode {
        guard global.protectionEnabled else { return .disabled }
        switch global.protectionPreset {
        case .balanced, .custom: .balanced
        case .strict: .strict
        case .minimal: .minimal
        }
    }
}
