import SwiftUI

struct SitesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var newDomain = ""
    @State private var validationMessage: String?

    private var domains: [String] {
        model.envelope.profiles.keys.sorted()
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("example.com", text: $newDomain)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .onSubmit(addDomain)
                        Button("Add", action: addDomain)
                            .disabled(newDomain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    if let validationMessage {
                        Text(validationMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                } header: {
                    Text("Add site profile")
                } footer: {
                    Text("Only the normalized host is stored. Profiles override global settings for that domain.")
                }

                Section("Profiles") {
                    if domains.isEmpty {
                        ContentUnavailableView(
                            "No Site Profiles",
                            systemImage: "globe",
                            description: Text("Add a domain when a site needs different protection or dark-mode behavior.")
                        )
                    } else {
                        ForEach(domains, id: \.self) { domain in
                            if let profile = model.envelope.profiles[domain] {
                                NavigationLink {
                                    SiteProfileEditor(profile: profile)
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(domain).font(.headline)
                                        Text(summary(for: profile))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        .onDelete { offsets in
                            model.deleteSites(at: offsets, from: domains)
                        }
                    }
                }
            }
        }
    }

    private func addDomain() {
        validationMessage = model.addSite(newDomain)
        if validationMessage == nil {
            newDomain = ""
        }
    }

    private func summary(for profile: SiteProfile) -> String {
        var parts: [String] = []
        if profile.compatibilityMode { parts.append("Compatibility") }
        else if profile.protection != .inherit { parts.append(profile.protection.title) }
        if let mode = profile.darkMode { parts.append(mode.title) }
        if profile.cleanURLs != nil { parts.append("URL override") }
        return parts.isEmpty ? "Inherits global defaults" : parts.joined(separator: " · ")
    }
}

private struct SiteProfileEditor: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var profile: SiteProfile
    @State private var validationMessage: String?

    init(profile: SiteProfile) {
        _profile = State(initialValue: profile)
    }

    var body: some View {
        Form {
            Section("Site") {
                LabeledContent("Domain", value: profile.domain)
                Picker("Protection", selection: $profile.protection) {
                    ForEach(ProtectionMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                Toggle("Compatibility mode", isOn: $profile.compatibilityMode)
            }

            Section("Dark mode") {
                Picker("Behavior", selection: $profile.darkMode) {
                    Text("Inherit").tag(nil as DarkModePreference?)
                    ForEach(DarkModePreference.allCases) { mode in
                        Text(mode.title).tag(Optional(mode))
                    }
                }
                Picker("Images", selection: $profile.imagePolicy) {
                    Text("Inherit").tag(nil as ImagePolicy?)
                    ForEach(ImagePolicy.allCases) { policy in
                        Text(policy.title).tag(Optional(policy))
                    }
                }
            }

            Section("URL cleaning") {
                Picker("Behavior", selection: $profile.cleanURLs) {
                    Text("Inherit").tag(nil as Bool?)
                    Text("On").tag(Optional(true))
                    Text("Off").tag(Optional(false))
                }
                .pickerStyle(.segmented)
            }

            Section {
                TextEditor(text: $profile.customCSS)
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 160)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                Text("Local CSS only. Imports, remote URLs, and executable constructs are rejected.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Custom CSS")
            }

            if let validationMessage {
                Section {
                    Label(validationMessage, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle(profile.domain)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    validationMessage = model.updateSite(profile)
                    if validationMessage == nil { dismiss() }
                }
            }
        }
    }
}

