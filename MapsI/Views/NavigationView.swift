import SwiftUI
import CoreLocation

// Main navigation screen shown during active navigation
struct ActiveNavigationView: View {
    @EnvironmentObject var navigationViewModel: NavigationViewModel
    @EnvironmentObject var mapViewModel: MapViewModel
    @EnvironmentObject var locationService: LocationService
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            // Full screen map
            MapView()
                .ignoresSafeArea()

            VStack {
                // Top bar with current instruction
                NavigationTopBar()

                Spacer()

                // Bottom panel with route info
                NavigationBottomPanel(onStop: stopNavigation)
            }

            // OSM Attribution
            VStack {
                Spacer()
                HStack {
                    OSMAttributionView()
                    Spacer()
                }
                .padding(.leading, 8)
                .padding(.bottom, 160)
            }
        }
        .onAppear {
            setupNavigationMode()
        }
        .onDisappear {
            cleanupNavigationMode()
        }
    }

    private func setupNavigationMode() {
        mapViewModel.userTrackingMode = .follow
        locationService.startNavigationMode()
    }

    private func cleanupNavigationMode() {
        locationService.stopNavigationMode()
    }

    private func stopNavigation() {
        navigationViewModel.stopNavigation()
        mapViewModel.clearRoute()
        mapViewModel.clearAnnotations()
        dismiss()
    }
}

// MARK: - Navigation Top Bar
struct NavigationTopBar: View {
    @EnvironmentObject var navigationViewModel: NavigationViewModel

    var body: some View {
        VStack(spacing: 0) {
            if let step = navigationViewModel.currentStep {
                HStack(spacing: 16) {
                    // Maneuver icon
                    Image(systemName: step.maneuverIcon)
                        .font(.system(size: 32))
                        .foregroundColor(.white)
                        .frame(width: 60, height: 60)
                        .background(Color.accentColor)
                        .cornerRadius(12)

                    VStack(alignment: .leading, spacing: 4) {
                        // Distance to next maneuver
                        Text(formatDistance(navigationViewModel.distanceToNextStep))
                            .font(.title)
                            .fontWeight(.bold)

                        // Instruction
                        Text(step.instruction)
                            .font(.subheadline)
                            .lineLimit(2)

                        // Street name
                        if let name = step.name {
                            Text(name)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()
                }
                .padding()
                .background(Color(.systemBackground))
                .cornerRadius(16)
                .shadow(radius: 5)
                .padding()
            }

            // Next step preview
            if let nextStep = navigationViewModel.nextStep {
                HStack {
                    Text("Puis")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Image(systemName: nextStep.maneuverIcon)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Text(nextStep.name ?? "")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)

                    Spacer()
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(Color(.systemBackground).opacity(0.9))
                .cornerRadius(8)
                .padding(.horizontal)
            }
        }
    }

    private func formatDistance(_ distance: Double) -> String {
        if distance >= 1000 {
            return String(format: "%.1f km", distance / 1000)
        } else {
            return String(format: "%.0f m", distance)
        }
    }
}

// MARK: - Navigation Bottom Panel
struct NavigationBottomPanel: View {
    @EnvironmentObject var navigationViewModel: NavigationViewModel
    let onStop: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            // Progress bar
            ProgressView(value: navigationViewModel.progress)
                .progressViewStyle(LinearProgressViewStyle(tint: .accentColor))
                .padding(.horizontal)

            HStack(spacing: 24) {
                // Remaining time
                VStack {
                    Text(navigationViewModel.formattedRemainingDuration)
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("restant")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Divider()
                    .frame(height: 40)

                // Remaining distance
                VStack {
                    Text(navigationViewModel.formattedRemainingDistance)
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("distance")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Divider()
                    .frame(height: 40)

                // Arrival time
                VStack {
                    Text(navigationViewModel.formattedArrivalTime)
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("arrivee")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            HStack(spacing: 16) {
                // Voice toggle
                Button(action: {
                    navigationViewModel.toggleVoice()
                }) {
                    Image(systemName: navigationViewModel.isVoiceEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                        .font(.title2)
                        .foregroundColor(navigationViewModel.isVoiceEnabled ? .accentColor : .gray)
                        .frame(width: 50, height: 50)
                        .background(Color(.systemGray6))
                        .cornerRadius(25)
                }

                Spacer()

                // Stop navigation
                Button(action: onStop) {
                    HStack {
                        Image(systemName: "xmark")
                        Text("Arreter")
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.red)
                    .cornerRadius(25)
                }
            }
            .padding(.horizontal)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(20)
        .shadow(radius: 10)
        .padding()
    }
}

#Preview {
    ActiveNavigationView()
        .environmentObject(NavigationViewModel())
        .environmentObject(MapViewModel())
        .environmentObject(LocationService())
}
