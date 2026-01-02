import Foundation
import SwiftUI

enum TransportMode: String, CaseIterable, Identifiable {
    case car = "driving"
    case walking = "foot"
    case cycling = "bike"
    case publicTransport = "transit"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .car: return "Voiture"
        case .walking: return "A pied"
        case .cycling: return "Velo"
        case .publicTransport: return "Transports"
        }
    }

    var icon: String {
        switch self {
        case .car: return "car.fill"
        case .walking: return "figure.walk"
        case .cycling: return "bicycle"
        case .publicTransport: return "bus.fill"
        }
    }

    var osrmProfile: String {
        switch self {
        case .car: return "car"
        case .walking: return "foot"
        case .cycling: return "bike"
        case .publicTransport: return "car" // OSRM doesn't support transit, fallback to car
        }
    }

    var color: Color {
        switch self {
        case .car: return .blue
        case .walking: return .green
        case .cycling: return .orange
        case .publicTransport: return .purple
        }
    }

    var averageSpeed: Double { // km/h
        switch self {
        case .car: return 50
        case .walking: return 5
        case .cycling: return 15
        case .publicTransport: return 30
        }
    }
}

// MARK: - Transport Mode Selection
struct TransportModeButton: View {
    let mode: TransportMode
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: mode.icon)
                    .font(.system(size: 24))
                Text(mode.displayName)
                    .font(.caption)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(isSelected ? mode.color.opacity(0.2) : Color(.systemGray6))
            .foregroundColor(isSelected ? mode.color : .primary)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? mode.color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}
