import SwiftUI

@main
struct PRISMApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .active {
                        model.reload()
                    }
                }
        }
    }
}

