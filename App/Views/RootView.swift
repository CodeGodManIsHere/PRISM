import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case dashboard = "Dashboard"
    case protection = "Protection"
    case darkMode = "Dark Mode"
    case sites = "Sites"
    case filterLists = "Filter Lists"
    case customRules = "Custom Rules"
    case statistics = "Statistics"
    case diagnostics = "Diagnostics"
    case settings = "Settings"
    case about = "About"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .dashboard: "square.grid.2x2"
        case .protection: "shield.lefthalf.filled"
        case .darkMode: "moon.stars"
        case .sites: "globe"
        case .filterLists: "line.3.horizontal.decrease.circle"
        case .customRules: "curlybraces"
        case .statistics: "chart.bar"
        case .diagnostics: "stethoscope"
        case .settings: "gearshape"
        case .about: "info.circle"
        }
    }
}

struct RootView: View {
    @State private var selection: AppSection? = .dashboard
    @State private var columnVisibility: NavigationSplitViewVisibility = .automatic

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            List(AppSection.allCases, selection: $selection) { section in
                Label(section.rawValue, systemImage: section.symbol)
                    .tag(section)
            }
            .navigationTitle("PRISM")
        } detail: {
            destination(for: selection ?? .dashboard)
                .navigationTitle((selection ?? .dashboard).rawValue)
                .navigationBarTitleDisplayMode(.large)
        }
    }

    @ViewBuilder
    private func destination(for section: AppSection) -> some View {
        switch section {
        case .dashboard: DashboardView()
        case .protection: ProtectionView()
        case .darkMode: DarkModeSettingsView()
        case .sites: SitesView()
        case .filterLists: FilterListsView()
        case .customRules: CustomRulesView()
        case .statistics: StatisticsView()
        case .diagnostics: DiagnosticsView()
        case .settings: SettingsView()
        case .about: AboutView()
        }
    }
}

