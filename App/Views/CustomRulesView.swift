import SwiftUI

struct CustomRulesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = ""
    @State private var validationMessage: String?

    var body: some View {
        List {
            Section {
                TextField("||tracker.example^", text: $draft, axis: .vertical)
                    .font(.system(.body, design: .monospaced))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit(addRule)
                Button("Validate and Add", action: addRule)
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if let validationMessage {
                    Text(validationMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            } header: {
                Text("New rule")
            } footer: {
                Text("Supported: ||domain^ to block, @@||domain^ to allow, and domain##selector to hide an element.")
            }

            Section("Rules") {
                if model.envelope.customRules.isEmpty {
                    ContentUnavailableView(
                        "No Custom Rules",
                        systemImage: "curlybraces",
                        description: Text("Malformed or unsupported rules are rejected before activation.")
                    )
                } else {
                    ForEach(model.envelope.customRules) { rule in
                        Toggle(isOn: Binding(
                            get: { rule.enabled },
                            set: { model.setRuleEnabled(id: rule.id, enabled: $0) }
                        )) {
                            Text(rule.text)
                                .font(.system(.body, design: .monospaced))
                                .textSelection(.enabled)
                        }
                    }
                    .onDelete(perform: model.deleteRules)
                }
            }
        }
    }

    private func addRule() {
        validationMessage = model.addCustomRule(draft)
        if validationMessage == nil { draft = "" }
    }
}

