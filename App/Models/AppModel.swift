import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var envelope: SettingsEnvelope
    @Published private(set) var lastError: String?

    let repository: SettingsRepository

    init(repository: SettingsRepository = SettingsRepository()) {
        self.repository = repository
        envelope = repository.load()
    }

    var storageStatus: String {
        repository.usesAppGroup ? "Shared with Safari" : "Local fallback — App Group unavailable"
    }

    func reload() {
        envelope = repository.load()
    }

    func updateGlobal(_ mutation: (inout GlobalSettings) -> Void) {
        persist { mutation(&$0.global) }
    }

    func addSite(_ rawDomain: String) -> String? {
        guard let domain = DomainNormalizer.normalize(rawDomain) else {
            return "Enter a valid host name such as example.com."
        }
        persist { envelope in
            if envelope.profiles[domain] == nil {
                envelope.profiles[domain] = SiteProfile(domain: domain)
            }
        }
        return nil
    }

    func updateSite(_ profile: SiteProfile) -> String? {
        guard let domain = DomainNormalizer.normalize(profile.domain) else {
            return "The profile domain is invalid."
        }
        if let error = CustomCSSValidator.error(for: profile.customCSS) {
            return error
        }
        var validated = profile
        validated.domain = domain
        persist { $0.profiles[domain] = validated }
        return nil
    }

    func deleteSites(at offsets: IndexSet, from domains: [String]) {
        persist { envelope in
            for offset in offsets where domains.indices.contains(offset) {
                envelope.profiles.removeValue(forKey: domains[offset])
            }
        }
    }

    func addCustomRule(_ source: String) -> String? {
        switch CustomRuleValidator.parse(source) {
        case .failure(let error):
            return error.localizedDescription
        case .success:
            persist { $0.customRules.append(CustomRule(text: source.trimmingCharacters(in: .whitespacesAndNewlines))) }
            return nil
        }
    }

    func setRuleEnabled(id: UUID, enabled: Bool) {
        persist { envelope in
            guard let index = envelope.customRules.firstIndex(where: { $0.id == id }) else { return }
            envelope.customRules[index].enabled = enabled
        }
    }

    func deleteRules(at offsets: IndexSet) {
        persist { $0.customRules.remove(atOffsets: offsets) }
    }

    func resetMetrics() {
        persist { $0.metrics = .zero }
    }

    func resetAllSettings() {
        repository.reset()
        envelope = .default
        lastError = nil
    }

    func diagnosticsJSON() -> String {
        let snapshot = DiagnosticSnapshot(
            appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
            build: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
            operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString,
            schemaVersion: envelope.schemaVersion,
            revision: envelope.revision,
            rulesetVersion: envelope.rulesetVersion,
            profileCount: envelope.profiles.count,
            enabledCustomRuleCount: envelope.customRules.filter(\.enabled).count,
            global: envelope.global,
            metrics: envelope.global.localStatisticsEnabled ? envelope.metrics : nil,
            storage: storageStatus
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(snapshot) else { return "{\"error\":\"encoding failed\"}" }
        return String(decoding: data, as: UTF8.self)
    }

    private func persist(_ mutation: (inout SettingsEnvelope) -> Void) {
        do {
            envelope = try repository.update(mutation)
            lastError = nil
        } catch {
            lastError = "Could not save settings: \(error.localizedDescription)"
        }
    }
}

private struct DiagnosticSnapshot: Codable {
    let appVersion: String
    let build: String
    let operatingSystem: String
    let schemaVersion: Int
    let revision: Int
    let rulesetVersion: String
    let profileCount: Int
    let enabledCustomRuleCount: Int
    let global: GlobalSettings
    let metrics: LocalMetrics?
    let storage: String
}

