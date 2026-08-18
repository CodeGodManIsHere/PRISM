import SwiftUI

struct ProtectionView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Form {
            Section {
                Toggle("Protection", isOn: Binding(
                    get: { model.envelope.global.protectionEnabled },
                    set: { value in model.updateGlobal { $0.protectionEnabled = value } }
                ))

                Picker("Preset", selection: Binding(
                    get: { model.envelope.global.protectionPreset },
                    set: { value in model.updateGlobal { $0.protectionPreset = value } }
                )) {
                    ForEach(ProtectionPreset.allCases) { preset in
                        Text(preset.title).tag(preset)
                    }
                }
                .disabled(!model.envelope.global.protectionEnabled)
            } header: {
                Text("Default protection")
            } footer: {
                Text("Balanced is the default. Strict enables additional social and nuisance rules and may cause more site breakage. Minimal keeps only the smallest core set.")
            }

            Section("Recovery") {
                Label("Use the Safari popup to pause a page or domain.", systemImage: "pause.circle")
                Label("Compatibility mode keeps URL cleaning and dark mode available while relaxing protection.", systemImage: "wrench.and.screwdriver")
            }

            Section("What Safari exposes") {
                Text("PRISM does not claim an exact historical blocked-request total. Declarative rule matches are not a complete durable network log.")
                    .foregroundStyle(.secondary)
            }
        }
    }
}

