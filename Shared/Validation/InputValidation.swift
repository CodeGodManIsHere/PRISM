import Foundation

enum DomainNormalizer {
    static func normalize(_ rawValue: String) -> String? {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty, trimmed.count <= 253 else { return nil }

        let candidate = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
        guard let components = URLComponents(string: candidate), var host = components.host else {
            return nil
        }
        host = host.lowercased()
        while host.hasSuffix(".") { host.removeLast() }
        guard !host.isEmpty, host.count <= 253 else { return nil }
        if host == "localhost" { return host }

        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-")
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard !labels.isEmpty else { return nil }
        for label in labels {
            guard !label.isEmpty, label.count <= 63 else { return nil }
            guard label.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }
            guard label.first != "-", label.last != "-" else { return nil }
        }
        return host
    }
}

enum CustomCSSValidator {
    static let maximumLength = 20_000

    static func error(for source: String) -> String? {
        guard source.count <= maximumLength else {
            return "CSS exceeds the \(maximumLength)-character limit."
        }
        let lowered = source.lowercased()
        let forbidden = ["@import", "javascript:", "expression(", "-moz-binding", "url(http:", "url(https:", "url(//"]
        if let token = forbidden.first(where: lowered.contains) {
            return "CSS contains a disallowed construct: \(token)"
        }
        var depth = 0
        for character in source {
            if character == "{" { depth += 1 }
            if character == "}" { depth -= 1 }
            if depth < 0 { return "CSS contains an unmatched closing brace." }
        }
        return depth == 0 ? nil : "CSS contains an unmatched opening brace."
    }
}

enum ParsedCustomRule: Equatable, Sendable {
    case blockDomain(String)
    case allowDomain(String)
    case hideElement(domain: String, selector: String)
}

enum CustomRuleValidator {
    static let maximumLength = 512

    static func parse(_ source: String) -> Result<ParsedCustomRule, RuleValidationError> {
        let rule = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !rule.isEmpty else { return .failure(.empty) }
        guard rule.count <= maximumLength else { return .failure(.tooLong) }

        if let marker = rule.range(of: "##") {
            let rawDomain = String(rule[..<marker.lowerBound])
            let selector = String(rule[marker.upperBound...]).trimmingCharacters(in: .whitespaces)
            guard let domain = DomainNormalizer.normalize(rawDomain) else {
                return .failure(.invalidDomain)
            }
            guard isSafeSelector(selector) else { return .failure(.invalidSelector) }
            return .success(.hideElement(domain: domain, selector: selector))
        }

        let isAllow = rule.hasPrefix("@@")
        let body = isAllow ? String(rule.dropFirst(2)) : rule
        guard body.hasPrefix("||"), body.hasSuffix("^") else {
            return .failure(.unsupportedSyntax)
        }
        let rawDomain = String(body.dropFirst(2).dropLast())
        guard let domain = DomainNormalizer.normalize(rawDomain), domain == rawDomain.lowercased() else {
            return .failure(.invalidDomain)
        }
        return .success(isAllow ? .allowDomain(domain) : .blockDomain(domain))
    }

    private static func isSafeSelector(_ selector: String) -> Bool {
        guard !selector.isEmpty, selector.count <= 256 else { return false }
        let forbidden = ["{", "}", "@", "javascript:", "url("]
        return !forbidden.contains(where: selector.lowercased().contains)
    }
}

enum RuleValidationError: Error, Equatable, LocalizedError, Sendable {
    case empty
    case tooLong
    case invalidDomain
    case invalidSelector
    case unsupportedSyntax

    var errorDescription: String? {
        switch self {
        case .empty: "Rule is empty."
        case .tooLong: "Rule is too long."
        case .invalidDomain: "Rule contains an invalid domain."
        case .invalidSelector: "Element-hiding selector is invalid or unsafe."
        case .unsupportedSyntax: "Use ||domain^, @@||domain^, or domain##selector."
        }
    }
}

