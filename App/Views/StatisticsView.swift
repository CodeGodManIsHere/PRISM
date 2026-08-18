import SwiftUI

struct StatisticsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            Section {
                Toggle("Store aggregate local counters", isOn: Binding(
                    get: { model.envelope.global.localStatisticsEnabled },
                    set: { value in model.updateGlobal { $0.localStatisticsEnabled = value } }
                ))
            } footer: {
                Text("Disabled by default. Counters contain no URL, domain, timestamp, or page content and never leave the device.")
            }

            if model.envelope.global.localStatisticsEnabled {
                Section("Observed locally") {
                    metric("Pages processed", value: model.envelope.metrics.pagesProcessed)
                    metric("URLs cleaned", value: model.envelope.metrics.urlsCleaned)
                    metric("Dark pages transformed", value: model.envelope.metrics.darkPagesTransformed)
                    metric("Mutation batches", value: model.envelope.metrics.mutationBatches)
                    Button("Reset Counters", role: .destructive, action: model.resetMetrics)
                }
            } else {
                Section {
                    ContentUnavailableView(
                        "No Activity History",
                        systemImage: "chart.bar.xaxis",
                        description: Text("PRISM does not manufacture blocked-request totals. Enable local counters only if you want aggregate engine activity.")
                    )
                }
            }
        }
    }

    private func metric(_ title: String, value: Int) -> some View {
        LabeledContent(title) {
            Text(value, format: .number)
                .font(.headline.monospacedDigit())
        }
    }
}

