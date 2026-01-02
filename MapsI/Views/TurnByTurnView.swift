import SwiftUI

// Turn-by-turn navigation overlay shown during active navigation
struct TurnByTurnView: View {
    @EnvironmentObject var navigationViewModel: NavigationViewModel
    @State private var isExpanded = false

    var body: some View {
        VStack(spacing: 0) {
            // Current instruction card
            CurrentInstructionCard(
                step: navigationViewModel.currentStep,
                distanceToStep: navigationViewModel.distanceToNextStep,
                isExpanded: $isExpanded
            )

            // Expanded view with more details
            if isExpanded {
                ExpandedNavigationView()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3), value: isExpanded)
    }
}

// MARK: - Current Instruction Card
struct CurrentInstructionCard: View {
    let step: RouteStep?
    let distanceToStep: Double
    @Binding var isExpanded: Bool

    var body: some View {
        Button(action: { isExpanded.toggle() }) {
            HStack(spacing: 16) {
                // Maneuver icon
                if let step = step {
                    Image(systemName: step.maneuverIcon)
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 56, height: 56)
                        .background(Color.accentColor)
                        .cornerRadius(12)
                } else {
                    Image(systemName: "location.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.white)
                        .frame(width: 56, height: 56)
                        .background(Color.gray)
                        .cornerRadius(12)
                }

                VStack(alignment: .leading, spacing: 4) {
                    // Distance
                    Text(formatDistance(distanceToStep))
                        .font(.title2)
                        .fontWeight(.bold)

                    // Instruction
                    if let step = step {
                        Text(step.instruction)
                            .font(.subheadline)
                            .lineLimit(2)
                    }
                }

                Spacer()

                // Expand indicator
                Image(systemName: isExpanded ? "chevron.down" : "chevron.up")
                    .foregroundColor(.secondary)
                    .padding(.trailing, 8)
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(16)
            .shadow(color: .black.opacity(0.15), radius: 10, y: -5)
        }
        .buttonStyle(PlainButtonStyle())
        .padding(.horizontal)
    }

    private func formatDistance(_ distance: Double) -> String {
        if distance >= 1000 {
            return String(format: "%.1f km", distance / 1000)
        } else {
            return String(format: "%.0f m", distance)
        }
    }
}

// MARK: - Expanded Navigation View
struct ExpandedNavigationView: View {
    @EnvironmentObject var navigationViewModel: NavigationViewModel

    var body: some View {
        VStack(spacing: 16) {
            // Route progress
            RouteProgressBar(progress: navigationViewModel.progress)

            // Stats row
            HStack(spacing: 0) {
                StatItem(
                    value: navigationViewModel.formattedRemainingDuration,
                    label: "Temps restant",
                    icon: "clock"
                )

                Divider()
                    .frame(height: 40)

                StatItem(
                    value: navigationViewModel.formattedRemainingDistance,
                    label: "Distance",
                    icon: "arrow.left.and.right"
                )

                Divider()
                    .frame(height: 40)

                StatItem(
                    value: navigationViewModel.formattedArrivalTime,
                    label: "Arrivee",
                    icon: "flag.checkered"
                )
            }

            // Next steps preview
            if let route = navigationViewModel.currentRoute {
                NextStepsPreview(
                    steps: route.steps,
                    currentIndex: navigationViewModel.currentStepIndex
                )
            }

            // Controls
            NavigationControls()
        }
        .padding()
        .background(Color(.systemBackground))
    }
}

// MARK: - Route Progress Bar
struct RouteProgressBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                // Background
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))

                // Progress
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.accentColor)
                    .frame(width: geometry.size.width * progress)
            }
        }
        .frame(height: 8)
    }
}

// MARK: - Stat Item
struct StatItem: View {
    let value: String
    let label: String
    let icon: String

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundColor(.secondary)

                Text(value)
                    .font(.headline)
                    .fontWeight(.bold)
            }

            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Next Steps Preview
struct NextStepsPreview: View {
    let steps: [RouteStep]
    let currentIndex: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Prochaines etapes")
                .font(.caption)
                .foregroundColor(.secondary)

            ForEach(Array(upcomingSteps.enumerated()), id: \.element.id) { index, step in
                HStack(spacing: 12) {
                    // Step number
                    Text("\(currentIndex + index + 2)")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                        .frame(width: 24, height: 24)
                        .background(Color.secondary)
                        .cornerRadius(12)

                    // Icon
                    Image(systemName: step.maneuverIcon)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    // Instruction
                    Text(step.instruction)
                        .font(.caption)
                        .lineLimit(1)

                    Spacer()

                    // Distance
                    Text(step.formattedDistance)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private var upcomingSteps: [RouteStep] {
        let startIndex = currentIndex + 1
        let endIndex = min(startIndex + 3, steps.count)
        guard startIndex < steps.count else { return [] }
        return Array(steps[startIndex..<endIndex])
    }
}

// MARK: - Navigation Controls
struct NavigationControls: View {
    @EnvironmentObject var navigationViewModel: NavigationViewModel

    var body: some View {
        HStack(spacing: 16) {
            // Voice toggle
            ControlButton(
                icon: navigationViewModel.isVoiceEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill",
                label: "Son",
                isActive: navigationViewModel.isVoiceEnabled
            ) {
                navigationViewModel.toggleVoice()
            }

            // Overview (would show full route)
            ControlButton(
                icon: "map",
                label: "Apercu",
                isActive: false
            ) {
                // Show route overview
            }

            // Report (would allow reporting issues)
            ControlButton(
                icon: "exclamationmark.triangle",
                label: "Signaler",
                isActive: false
            ) {
                // Report issue
            }

            // Stop navigation
            ControlButton(
                icon: "xmark",
                label: "Arreter",
                isActive: false,
                tint: .red
            ) {
                navigationViewModel.stopNavigation()
            }
        }
    }
}

// MARK: - Control Button
struct ControlButton: View {
    let icon: String
    let label: String
    let isActive: Bool
    var tint: Color = .accentColor
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(isActive ? .white : tint)
                    .frame(width: 44, height: 44)
                    .background(isActive ? tint : tint.opacity(0.1))
                    .cornerRadius(22)

                Text(label)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .buttonStyle(PlainButtonStyle())
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    VStack {
        Spacer()
        TurnByTurnView()
            .environmentObject(NavigationViewModel())
    }
    .background(Color(.systemGray6))
}
