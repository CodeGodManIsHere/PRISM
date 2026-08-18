import SwiftUI
import UIKit

struct DashboardView: View {
    @EnvironmentObject private var model: AppModel

    private let columns = [GridItem(.adaptive(minimum: 250), spacing: 16)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                hero
                quickControls
                LazyVGrid(columns: columns, spacing: 16) {
                    summaryCard(
                        title: "Protection",
                        value: model.envelope.global.protectionEnabled ? model.envelope.global.protectionPreset.title : "Off",
                        detail: "Safari-native declarative rules",
                        symbol: "shield.checkered",
                        color: .mint
                    )
                    summaryCard(
                        title: "Dark Mode",
                        value: model.envelope.global.darkMode.title,
                        detail: "Perceptual colors with native-theme detection",
                        symbol: "moon.fill",
                        color: .indigo
                    )
                    summaryCard(
                        title: "Clean URLs",
                        value: model.envelope.global.cleanURLs ? "On" : "Off",
                        detail: "Known trackers only; signed links preserved",
                        symbol: "link.badge.plus",
                        color: .cyan
                    )
                    summaryCard(
                        title: "Site Profiles",
                        value: "\(model.envelope.profiles.count)",
                        detail: "Local domain-specific overrides",
                        symbol: "globe",
                        color: .orange
                    )
                }

                Text("After changing settings here, reload an already-open Safari page so its content script can refresh. Safari controls extension and website permissions separately in Settings.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                if let error = model.lastError {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .accessibilityLabel("Error: \(error)")
                }
            }
            .padding()
            .frame(maxWidth: 1_000, alignment: .leading)
        }
        .onChange(of: model.lastError) { _, newError in
            guard let newError else { return }
            UIAccessibility.post(notification: .announcement, argument: newError)
        }
        .background {
            LinearGradient(
                colors: [Color.indigo.opacity(0.12), Color.cyan.opacity(0.06), .clear],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Image(systemName: "triangle.fill")
                    .font(.system(size: 42, weight: .semibold))
                    .foregroundStyle(.cyan, .indigo)
                    .accessibilityHidden(true)
                Spacer()
                StatusPill(text: "Local only", active: true)
            }
            Text("A quieter, darker Safari.")
                .font(.largeTitle.bold())
            Text("Protection, intelligent dark rendering, and cautious URL cleaning—without an account, backend, or telemetry.")
                .font(.title3)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(24)
        .prismGlassPanel()
    }

    private var quickControls: some View {
        VStack(spacing: 2) {
            Toggle(isOn: Binding(
                get: { model.envelope.global.protectionEnabled },
                set: { value in model.updateGlobal { $0.protectionEnabled = value } }
            )) {
                Label("Protection", systemImage: "shield.lefthalf.filled")
            }
            .padding()

            Divider().padding(.horizontal)

            Toggle(isOn: Binding(
                get: { model.envelope.global.cleanURLs },
                set: { value in model.updateGlobal { $0.cleanURLs = value } }
            )) {
                Label("Clean URLs", systemImage: "link")
            }
            .padding()
        }
        .prismGlassPanel()
    }

    private func summaryCard(title: String, value: String, detail: String, symbol: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: symbol)
                    .font(.title2)
                    .foregroundStyle(color)
                    .accessibilityHidden(true)
                Spacer()
                Text(value)
                    .font(.headline)
            }
            Text(title).font(.headline)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 145, alignment: .topLeading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
