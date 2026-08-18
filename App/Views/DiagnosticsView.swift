import SwiftUI

struct DiagnosticsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Privacy-safe diagnostic snapshot")
                    .font(.headline)
                Spacer()
                ShareLink(item: model.diagnosticsJSON()) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }

            TextEditor(text: .constant(model.diagnosticsJSON()))
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
                .accessibilityLabel("Diagnostic JSON")
                .overlay {
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(.secondary.opacity(0.25))
                }

            Text("Domains, URLs, tokens, cookies, form values, and page text are excluded.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

