import SwiftUI

struct DarkModeSettingsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Form {
            Section {
                Picker("Behavior", selection: Binding(
                    get: { model.envelope.global.darkMode },
                    set: { value in model.updateGlobal { $0.darkMode = value } }
                )) {
                    ForEach(DarkModePreference.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }

                Picker("Images", selection: Binding(
                    get: { model.envelope.global.imagePolicy },
                    set: { value in model.updateGlobal { $0.imagePolicy = value } }
                )) {
                    ForEach(ImagePolicy.allCases) { policy in
                        Text(policy.title).tag(policy)
                    }
                }
            } header: {
                Text("Rendering")
            } footer: {
                Text("Automatic follows system appearance and first checks whether the website already provides a credible dark theme. Photographs and video are never inverted.")
            }

            if model.envelope.global.darkMode == .scheduled {
                Section("Schedule") {
                    DatePicker("Start", selection: minutesBinding(\.scheduleStartMinutes), displayedComponents: .hourAndMinute)
                    DatePicker("End", selection: minutesBinding(\.scheduleEndMinutes), displayedComponents: .hourAndMinute)
                }
            }

            Section("Compatibility") {
                Text("The engine transforms computed colors in OKLab/OKLCH space, validates contrast, batches DOM mutations, and leaves unsupported or risky media unchanged.")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func minutesBinding(_ keyPath: WritableKeyPath<GlobalSettings, Int>) -> Binding<Date> {
        Binding(
            get: {
                let value = model.envelope.global[keyPath: keyPath]
                return Calendar.current.date(bySettingHour: value / 60, minute: value % 60, second: 0, of: Date()) ?? Date()
            },
            set: { date in
                let components = Calendar.current.dateComponents([.hour, .minute], from: date)
                let minutes = (components.hour ?? 0) * 60 + (components.minute ?? 0)
                model.updateGlobal { $0[keyPath: keyPath] = minutes }
            }
        )
    }
}

