import SwiftUI

struct AboutView: View {
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: "triangle.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.cyan, .indigo)
                    Text("PRISM").font(.largeTitle.bold())
                    Text("Independent, open-source Safari privacy and dark mode.")
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical)
            }

            Section("Privacy promises") {
                Label("No account or backend", systemImage: "person.crop.circle.badge.xmark")
                Label("No telemetry or analytics SDK", systemImage: "waveform.badge.minus")
                Label("No browsing-history upload", systemImage: "icloud.slash")
                Label("No remote executable code", systemImage: "chevron.left.forwardslash.chevron.right")
            }

            Section("Open source") {
                LabeledContent("License", value: "MIT")
                Text("PRISM is an original implementation using public Apple and Web standards. It contains no proprietary Wipr or Noir code, assets, rules, or algorithms.")
                    .foregroundStyle(.secondary)
            }
        }
    }
}

