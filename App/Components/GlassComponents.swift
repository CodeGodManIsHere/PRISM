import SwiftUI

private struct PRISMGlassPanelModifier: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    @ViewBuilder
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        if reduceTransparency {
            content
                .background(Color(uiColor: .secondarySystemBackground), in: shape)
                .overlay(shape.stroke(.primary.opacity(0.08)))
        } else if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: shape)
        } else {
            content
                .background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(.white.opacity(0.16)))
        }
    }
}

extension View {
    func prismGlassPanel() -> some View {
        modifier(PRISMGlassPanelModifier())
    }
}

struct PRISMGlassButton<Label: View>: View {
    let action: () -> Void
    let label: Label

    init(action: @escaping () -> Void, @ViewBuilder label: () -> Label) {
        self.action = action
        self.label = label()
    }

    @ViewBuilder
    var body: some View {
        if #available(iOS 26.0, *) {
            Button(action: action) { label }
                .buttonStyle(.glass)
        } else {
            Button(action: action) { label }
                .buttonStyle(.bordered)
        }
    }
}

struct StatusPill: View {
    let text: String
    let active: Bool

    var body: some View {
        Label(text, systemImage: active ? "checkmark.circle.fill" : "pause.circle.fill")
            .font(.caption.weight(.semibold))
            .foregroundStyle(active ? Color.green : Color.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background((active ? Color.green : Color.secondary).opacity(0.12), in: Capsule())
            .accessibilityLabel("\(text), \(active ? "active" : "inactive")")
    }
}
