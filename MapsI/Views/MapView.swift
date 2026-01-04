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
                MarkerView(marker: annotation)
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
        .onChange(of: locationService.currentLocation) { _, newLocation in
            if let location = newLocation, navigationViewModel.isNavigating {
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
                }
            },
            set: { newValue in
                switch newValue {
                case .none: mapViewModel.userTrackingMode = .none
                case .follow: mapViewModel.userTrackingMode = .follow
                @unknown default: mapViewModel.userTrackingMode = .none
                }
            }
        )
    }
}

// MARK: - Marker View
struct MarkerView: View {
    let marker: MapMarker

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: marker.iconName)
                .font(.title)
                .foregroundColor(markerColor)
                .background(
                    Circle()
                        .fill(Color.white)
                        .frame(width: 30, height: 30)
                )

            if marker.type == .destination {
                Text(marker.title)
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

    private var markerColor: Color {
        switch marker.type {
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
