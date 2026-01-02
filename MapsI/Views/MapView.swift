import SwiftUI
import MapKit

struct MapView: View {
    @EnvironmentObject var mapViewModel: MapViewModel
    @EnvironmentObject var locationService: LocationService
    @EnvironmentObject var navigationViewModel: NavigationViewModel

    var body: some View {
        Map(
            coordinateRegion: $mapViewModel.region,
            showsUserLocation: mapViewModel.showsUserLocation,
            userTrackingMode: trackingMode,
            annotationItems: mapViewModel.annotations
        ) { annotation in
            MapAnnotation(coordinate: annotation.coordinate) {
                AnnotationView(annotation: annotation)
            }
        }
        .overlay(alignment: .topTrailing) {
            MapControlsView()
                .padding(.top, 60)
                .padding(.trailing, 8)
        }
        .overlay {
            if !mapViewModel.routeOverlay.isEmpty {
                RouteOverlayView(coordinates: mapViewModel.routeOverlay)
            }
        }
        .onChange(of: locationService.currentLocation) { location in
            if let location = location, navigationViewModel.isNavigating {
                navigationViewModel.updateLocation(location)
            }
        }
    }

    private var trackingMode: Binding<MapUserTrackingMode> {
        Binding(
            get: {
                switch mapViewModel.userTrackingMode {
                case .none: return .none
                case .follow: return .follow
                case .followWithHeading: return .followWithHeading
                }
            },
            set: { newValue in
                switch newValue {
                case .none: mapViewModel.userTrackingMode = .none
                case .follow: mapViewModel.userTrackingMode = .follow
                case .followWithHeading: mapViewModel.userTrackingMode = .followWithHeading
                @unknown default: mapViewModel.userTrackingMode = .none
                }
            }
        )
    }
}

// MARK: - Annotation View
struct AnnotationView: View {
    let annotation: MapAnnotation

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: annotation.iconName)
                .font(.title)
                .foregroundColor(annotationColor)
                .background(
                    Circle()
                        .fill(Color.white)
                        .frame(width: 30, height: 30)
                )

            if annotation.type == .destination {
                Text(annotation.title)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white)
                    .cornerRadius(4)
                    .shadow(radius: 2)
            }
        }
    }

    private var annotationColor: Color {
        switch annotation.type {
        case .destination: return .red
        case .searchResult: return .blue
        case .waypoint: return .orange
        case .userLocation: return .green
        }
    }
}

// MARK: - Map Controls View
struct MapControlsView: View {
    @EnvironmentObject var mapViewModel: MapViewModel

    var body: some View {
        VStack(spacing: 8) {
            // Zoom controls
            VStack(spacing: 0) {
                Button(action: { mapViewModel.zoomIn() }) {
                    Image(systemName: "plus")
                        .frame(width: 40, height: 40)
                }

                Divider()

                Button(action: { mapViewModel.zoomOut() }) {
                    Image(systemName: "minus")
                        .frame(width: 40, height: 40)
                }
            }
            .background(Color(.systemBackground))
            .cornerRadius(8)
            .shadow(radius: 2)

            // Map type toggle
            Button(action: { mapViewModel.toggleMapType() }) {
                Image(systemName: mapViewModel.mapType.icon)
                    .frame(width: 40, height: 40)
                    .background(Color(.systemBackground))
                    .cornerRadius(8)
                    .shadow(radius: 2)
            }
        }
        .foregroundColor(.accentColor)
    }
}

#Preview {
    MapView()
        .environmentObject(MapViewModel())
        .environmentObject(LocationService())
        .environmentObject(NavigationViewModel())
}
