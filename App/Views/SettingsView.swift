import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var confirmReset = false

    var body: some View {
        Form {
            Section {
                Toggle("Advanced Mode", isOn: Binding(
                    get: { model.envelope.global.advancedMode },
                    set: { value in model.updateGlobal { $0.advancedMode = value } }
                ))
            } footer: {
                Text("Advanced Mode exposes custom rules, CSS, diagnostics, and compatibility controls. It does not change protection by itself.")
            }

            Section("Storage") {
                LabeledContent("State", value: model.storageStatus)
                LabeledContent("Revision", value: String(model.envelope.revision))
            }

            Section("Safari activation") {
                Text("Enable PRISM and choose website access in Settings › Apps › Safari › Extensions. Apple does not provide an API for this app to silently enable itself.")
                    .foregroundStyle(.secondary)
            }

            Section {
                Button("Reset All Local Settings", role: .destructive) {
                    confirmReset = true
                }
            }
        }
        .confirmationDialog("Reset every PRISM setting and counter?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset", role: .destructive, action: model.resetAllSettings)
            Button("Cancel", role: .cancel) {}
        }
    }
}

