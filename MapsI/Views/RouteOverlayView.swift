import SwiftUI
import MapKit

// Route overlay for displaying the navigation path on the map
struct RouteOverlayView: View {
    let coordinates: [CLLocationCoordinate2D]

    var body: some View {
        // This is a placeholder - the actual route rendering is done in MapView
        // using MapKit's polyline capabilities
        EmptyView()
    }
}

// MARK: - Route Polyline for MapKit
struct RoutePolyline: Shape {
    let coordinates: [CLLocationCoordinate2D]
    let region: MKCoordinateRegion

    func path(in rect: CGRect) -> Path {
        var path = Path()

        guard coordinates.count >= 2 else { return path }

        let points = coordinates.map { coordinate -> CGPoint in
            let x = (coordinate.longitude - region.center.longitude + region.span.longitudeDelta / 2) / region.span.longitudeDelta * rect.width
            let y = (region.center.latitude + region.span.latitudeDelta / 2 - coordinate.latitude) / region.span.latitudeDelta * rect.height
            return CGPoint(x: x, y: y)
        }

        path.move(to: points[0])
        for point in points.dropFirst() {
            path.addLine(to: point)
        }

        return path
    }
}

// MARK: - Route Summary View
struct RouteSummaryView: View {
    let route: Route

    var body: some View {
        HStack(spacing: 20) {
            // Transport mode icon
            Image(systemName: route.transportMode.icon)
                .font(.title2)
                .foregroundColor(route.transportMode.color)
                .frame(width: 44, height: 44)
                .background(route.transportMode.color.opacity(0.1))
                .cornerRadius(22)

            VStack(alignment: .leading, spacing: 4) {
                // Duration
                Text(route.formattedDuration)
                    .font(.title3)
                    .fontWeight(.bold)

                // Distance
                Text(route.formattedDistance)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Arrival time
            VStack(alignment: .trailing, spacing: 4) {
                Text("Arrivee")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Text(route.formattedArrivalTime)
                    .font(.headline)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.1), radius: 5)
    }
}

// MARK: - Route Steps List
struct RouteStepsListView: View {
    let steps: [RouteStep]
    let currentStepIndex: Int

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                        RouteStepRow(
                            step: step,
                            stepNumber: index + 1,
                            isCurrentStep: index == currentStepIndex,
                            isCompleted: index < currentStepIndex
                        )
                        .id(index)

                        if index < steps.count - 1 {
                            StepConnector(isCompleted: index < currentStepIndex)
                        }
                    }
                }
                .padding()
            }
            .onChange(of: currentStepIndex) { newIndex in
                withAnimation {
                    proxy.scrollTo(newIndex, anchor: .center)
                }
            }
        }
    }
}

// MARK: - Route Step Row
struct RouteStepRow: View {
    let step: RouteStep
    let stepNumber: Int
    let isCurrentStep: Bool
    let isCompleted: Bool

    var body: some View {
        HStack(spacing: 12) {
            // Step icon
            ZStack {
                Circle()
                    .fill(backgroundColor)
                    .frame(width: 44, height: 44)

                Image(systemName: step.maneuverIcon)
                    .font(.system(size: 18))
                    .foregroundColor(iconColor)
            }

            VStack(alignment: .leading, spacing: 4) {
                // Instruction
                Text(step.instruction)
                    .font(.subheadline)
                    .fontWeight(isCurrentStep ? .semibold : .regular)
                    .foregroundColor(isCompleted ? .secondary : .primary)

                // Distance
                Text(step.formattedDistance)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(isCurrentStep ? Color.accentColor.opacity(0.1) : Color.clear)
        .cornerRadius(8)
    }

    private var backgroundColor: Color {
        if isCurrentStep {
            return .accentColor
        } else if isCompleted {
            return .green
        } else {
            return Color(.systemGray5)
        }
    }

    private var iconColor: Color {
        if isCurrentStep || isCompleted {
            return .white
        } else {
            return .secondary
        }
    }
}

// MARK: - Step Connector
struct StepConnector: View {
    let isCompleted: Bool

    var body: some View {
        HStack {
            Rectangle()
                .fill(isCompleted ? Color.green : Color(.systemGray4))
                .frame(width: 2, height: 20)
                .padding(.leading, 21)

            Spacer()
        }
    }
}

// MARK: - Compact Route Preview
struct CompactRoutePreview: View {
    let route: Route
    let onExpand: () -> Void

    var body: some View {
        Button(action: onExpand) {
            HStack {
                Image(systemName: route.transportMode.icon)
                    .foregroundColor(route.transportMode.color)

                Text(route.formattedDuration)
                    .fontWeight(.semibold)

                Text("(\(route.formattedDistance))")
                    .foregroundColor(.secondary)

                Spacer()

                Image(systemName: "chevron.up")
                    .foregroundColor(.secondary)
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(12)
            .shadow(radius: 3)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    VStack {
        RouteSummaryView(route: Route(
            coordinates: [],
            distance: 15400,
            duration: 1800,
            steps: [],
            transportMode: .car
        ))
        .padding()
    }
}
