import Foundation
import OSLog
import SafariServices

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let repository = SettingsRepository()
    private let logger = Logger(subsystem: "com.prism.privacy.extension", category: "NativeMessaging")

    func beginRequest(with context: NSExtensionContext) {
        let response: [String: Any]
        do {
            guard let input = context.inputItems.first as? NSExtensionItem,
                  let message = input.userInfo?[SFExtensionMessageKey] as? [String: Any]
            else {
                throw NativeMessageError.invalidEnvelope
            }
            response = try route(message)
        } catch {
            logger.error("Rejected native message: \(error.localizedDescription, privacy: .public)")
            response = [
                "ok": false,
                "version": 1,
                "error": error.localizedDescription
            ]
        }

        let item = NSExtensionItem()
        item.userInfo = [SFExtensionMessageKey: response]
        context.completeRequest(returningItems: [item])
    }

    private func route(_ message: [String: Any]) throws -> [String: Any] {
        guard integer(message["version"]) == 1,
              let operation = message["type"] as? String,
              operation.count <= 64
        else {
            throw NativeMessageError.unsupportedVersion
        }

        switch operation {
        case "getSettings":
            return success(["settings": try jsonObject(repository.load())])

        case "getEffectiveSettings":
            let domain = try normalizedDomain(from: message)
            let effective = ProfileResolver.resolve(domain: domain, envelope: repository.load())
            return success(["settings": try jsonObject(effective)])

        case "setGlobalSetting":
            return try setGlobalSetting(message)

        case "setSiteSetting":
            return try setSiteSetting(message)

        case "recordMetrics":
            return try recordMetrics(message)

        case "addCustomRule":
            return try addCustomRule(message)

        default:
            throw NativeMessageError.unsupportedOperation
        }
    }

    private func setGlobalSetting(_ message: [String: Any]) throws -> [String: Any] {
        guard let key = message["key"] as? String else { throw NativeMessageError.invalidValue }
        let envelope = try repository.update { envelope in
            switch key {
            case "protectionEnabled":
                guard let value = message["value"] as? Bool else { throw NativeMessageError.invalidValue }
                envelope.global.protectionEnabled = value
            case "cleanURLs":
                guard let value = message["value"] as? Bool else { throw NativeMessageError.invalidValue }
                envelope.global.cleanURLs = value
            case "darkMode":
                guard let raw = message["value"] as? String,
                      let value = DarkModePreference(rawValue: raw)
                else { throw NativeMessageError.invalidValue }
                envelope.global.darkMode = value
            case "protectionPreset":
                guard let raw = message["value"] as? String,
                      let value = ProtectionPreset(rawValue: raw)
                else { throw NativeMessageError.invalidValue }
                envelope.global.protectionPreset = value
            default:
                throw NativeMessageError.unsupportedSetting
            }
        }
        return success(["revision": envelope.revision])
    }

    private func setSiteSetting(_ message: [String: Any]) throws -> [String: Any] {
        let domain = try normalizedDomain(from: message)
        guard let key = message["key"] as? String else { throw NativeMessageError.invalidValue }

        let envelope = try repository.update { envelope in
            var profile = envelope.profiles[domain] ?? SiteProfile(domain: domain)
            switch key {
            case "protection":
                guard let raw = message["value"] as? String,
                      let value = ProtectionMode(rawValue: raw)
                else { throw NativeMessageError.invalidValue }
                profile.protection = value
            case "darkMode":
                guard let raw = message["value"] as? String else { throw NativeMessageError.invalidValue }
                if raw == "inherit" {
                    profile.darkMode = nil
                } else if let value = DarkModePreference(rawValue: raw) {
                    profile.darkMode = value
                } else {
                    throw NativeMessageError.invalidValue
                }
            case "cleanURLs":
                if message["value"] is NSNull {
                    profile.cleanURLs = nil
                } else if let value = message["value"] as? Bool {
                    profile.cleanURLs = value
                } else {
                    throw NativeMessageError.invalidValue
                }
            case "imagePolicy":
                guard let raw = message["value"] as? String else { throw NativeMessageError.invalidValue }
                if raw == "inherit" {
                    profile.imagePolicy = nil
                } else if let value = ImagePolicy(rawValue: raw) {
                    profile.imagePolicy = value
                } else {
                    throw NativeMessageError.invalidValue
                }
            case "compatibilityMode":
                guard let value = message["value"] as? Bool else { throw NativeMessageError.invalidValue }
                profile.compatibilityMode = value
            case "customCSS":
                guard let value = message["value"] as? String,
                      CustomCSSValidator.error(for: value) == nil
                else { throw NativeMessageError.invalidValue }
                profile.customCSS = value
            default:
                throw NativeMessageError.unsupportedSetting
            }
            envelope.profiles[domain] = profile
        }
        let effective = ProfileResolver.resolve(domain: domain, envelope: envelope)
        return success([
            "revision": envelope.revision,
            "settings": try jsonObject(effective)
        ])
    }

    private func recordMetrics(_ message: [String: Any]) throws -> [String: Any] {
        guard let raw = message["delta"] as? [String: Any] else {
            throw NativeMessageError.invalidValue
        }
        let delta = LocalMetrics(
            pagesProcessed: boundedDelta(raw["pagesProcessed"]),
            urlsCleaned: boundedDelta(raw["urlsCleaned"]),
            darkPagesTransformed: boundedDelta(raw["darkPagesTransformed"]),
            mutationBatches: boundedDelta(raw["mutationBatches"])
        )
        let envelope = try repository.update { envelope in
            guard envelope.global.localStatisticsEnabled else { return }
            envelope.metrics.add(delta)
        }
        return success(["revision": envelope.revision])
    }

    private func addCustomRule(_ message: [String: Any]) throws -> [String: Any] {
        guard let source = message["rule"] as? String else { throw NativeMessageError.invalidValue }
        switch CustomRuleValidator.parse(source) {
        case .failure:
            throw NativeMessageError.invalidValue
        case .success:
            break
        }
        let canonical = source.trimmingCharacters(in: .whitespacesAndNewlines)
        let envelope = try repository.update { envelope in
            guard envelope.customRules.count < 1_000 else { throw NativeMessageError.invalidValue }
            if !envelope.customRules.contains(where: { $0.text == canonical }) {
                envelope.customRules.append(CustomRule(text: canonical))
            }
        }
        return success(["revision": envelope.revision])
    }

    private func normalizedDomain(from message: [String: Any]) throws -> String {
        guard let raw = message["domain"] as? String,
              let domain = DomainNormalizer.normalize(raw)
        else {
            throw NativeMessageError.invalidDomain
        }
        return domain
    }

    private func success(_ payload: [String: Any] = [:]) -> [String: Any] {
        var response = payload
        response["ok"] = true
        response["version"] = 1
        return response
    }

    private func jsonObject<T: Encodable>(_ value: T) throws -> Any {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(value)
        return try JSONSerialization.jsonObject(with: data)
    }

    private func integer(_ value: Any?) -> Int? {
        if let int = value as? Int { return int }
        if let number = value as? NSNumber { return number.intValue }
        return nil
    }

    private func boundedDelta(_ value: Any?) -> Int {
        min(max(integer(value) ?? 0, 0), 10_000)
    }
}

private enum NativeMessageError: LocalizedError {
    case invalidEnvelope
    case unsupportedVersion
    case unsupportedOperation
    case unsupportedSetting
    case invalidDomain
    case invalidValue

    var errorDescription: String? {
        switch self {
        case .invalidEnvelope: "Invalid native-message envelope."
        case .unsupportedVersion: "Unsupported message schema."
        case .unsupportedOperation: "Unsupported native-message operation."
        case .unsupportedSetting: "Unsupported setting key."
        case .invalidDomain: "Invalid domain."
        case .invalidValue: "Invalid or unsafe value."
        }
    }
}
