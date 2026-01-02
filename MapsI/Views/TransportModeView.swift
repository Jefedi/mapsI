import SwiftUI

struct TransportModeView: View {
    @Binding var selectedMode: TransportMode
    @EnvironmentObject var navigationViewModel: NavigationViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Choisir le mode de transport")
                .font(.headline)

            // Transport mode buttons
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 12) {
                ForEach(TransportMode.allCases) { mode in
                    TransportModeCard(
                        mode: mode,
                        isSelected: selectedMode == mode,
                        estimatedTime: estimatedTime(for: mode)
                    ) {
                        selectedMode = mode
                    }
                }
            }

            // Mode-specific info
            ModeInfoView(mode: selectedMode)
        }
        .padding()
    }

    private func estimatedTime(for mode: TransportMode) -> String? {
        // This would ideally be calculated from actual route data
        // For now, return nil
        return nil
    }
}

// MARK: - Transport Mode Card
struct TransportModeCard: View {
    let mode: TransportMode
    let isSelected: Bool
    let estimatedTime: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: mode.icon)
                    .font(.system(size: 28))
                    .foregroundColor(isSelected ? .white : mode.color)

                Text(mode.displayName)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(isSelected ? .white : .primary)

                if let time = estimatedTime {
                    Text(time)
                        .font(.caption)
                        .foregroundColor(isSelected ? .white.opacity(0.8) : .secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .background(isSelected ? mode.color : Color(.systemGray6))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? mode.color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Mode Info View
struct ModeInfoView: View {
    let mode: TransportMode

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "info.circle")
                    .foregroundColor(.secondary)
                Text("A propos de ce mode")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Text(modeDescription)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }

    private var modeDescription: String {
        switch mode {
        case .car:
            return "Itineraire optimise pour les vehicules motorises. Prend en compte le trafic et les restrictions de circulation."
        case .walking:
            return "Itineraire pour les pietons. Inclut les chemins pietons, les escaliers et les passages souterrains."
        case .cycling:
            return "Itineraire pour velos. Privilegie les pistes cyclables et evite les routes a fort trafic."
        case .publicTransport:
            return "Combine transports en commun (bus, metro, tramway) avec la marche. Note: les horaires en temps reel ne sont pas disponibles."
        }
    }
}

// MARK: - Compact Transport Mode Selector
struct CompactTransportModeSelector: View {
    @Binding var selectedMode: TransportMode

    var body: some View {
        HStack(spacing: 4) {
            ForEach(TransportMode.allCases) { mode in
                Button(action: { selectedMode = mode }) {
                    VStack(spacing: 2) {
                        Image(systemName: mode.icon)
                            .font(.system(size: 16))

                        Text(shortName(for: mode))
                            .font(.system(size: 10))
                    }
                    .foregroundColor(selectedMode == mode ? .white : mode.color)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(selectedMode == mode ? mode.color : Color.clear)
                    .cornerRadius(8)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .padding(4)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func shortName(for mode: TransportMode) -> String {
        switch mode {
        case .car: return "Auto"
        case .walking: return "Pied"
        case .cycling: return "Velo"
        case .publicTransport: return "Bus"
        }
    }
}

#Preview {
    TransportModeView(selectedMode: .constant(.car))
        .environmentObject(NavigationViewModel())
}
