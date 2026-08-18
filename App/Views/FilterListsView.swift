import SwiftUI

struct FilterListsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            Section("Active rulesets") {
                rulesetRow(
                    title: "PRISM Core",
                    detail: "Advertising, tracking, and analytics baseline",
                    active: model.envelope.global.protectionEnabled
                )
                rulesetRow(
                    title: "PRISM Strict",
                    detail: "Additional social and nuisance protection",
                    active: model.envelope.global.protectionEnabled && model.envelope.global.protectionPreset == .strict
                )
            }

            Section("Version") {
                LabeledContent("Ruleset", value: model.envelope.rulesetVersion)
                LabeledContent("Source", value: "Bundled with app")
            }

            Section {
                Text("No remote filter source is enabled in this version. The bundled rules are original MIT-licensed PRISM data and are compiled deterministically during validation.")
                    .foregroundStyle(.secondary)
            } header: {
                Text("Licensing")
            }
        }
    }

    private func rulesetRow(title: String, detail: String, active: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: active ? "checkmark.shield.fill" : "shield.slash")
                .foregroundStyle(active ? Color.green : Color.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(active ? "Active" : "Inactive")
                .font(.caption.weight(.semibold))
                .foregroundStyle(active ? Color.green : Color.secondary)
        }
    }
}

