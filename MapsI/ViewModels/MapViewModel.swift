import Foundation
import CoreLocation
import Combine
import MapKit

class MapViewModel: ObservableObject {
    @Published var region: MKCoordinateRegion
    @Published var mapType: MapDisplayType = .standard
    @Published var showsUserLocation = true
    @Published var userTrackingMode: UserTrackingMode = .follow
    @Published var annotations: [MapMarker] = []
    @Published var routeOverlay: [CLLocationCoordinate2D] = []
    @Published var selectedAnnotation: MapMarker?
    @Published var zoomLevel: Double = 14

    private var cancellables = Set<AnyCancellable>()

    // Default region (Paris)
    private let defaultRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522),
        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
    )

    init() {
        self.region = defaultRegion
    }

    // MARK: - Map Controls
    func centerOnUserLocation() {
        userTrackingMode = .follow
    }

    func centerOn(coordinate: CLLocationCoordinate2D, animated: Bool = true) {
        region = MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
        )
    }

    func centerOn(location: Location, animated: Bool = true) {
        centerOn(coordinate: location.coordinate, animated: animated)
        addDestinationMarker(for: location)
    }

    func fitRoute(_ route: Route) {
        guard !route.coordinates.isEmpty else { return }

        var minLat = route.coordinates[0].latitude
        var maxLat = route.coordinates[0].latitude
        var minLon = route.coordinates[0].longitude
        var maxLon = route.coordinates[0].longitude

        for coord in route.coordinates {
            minLat = min(minLat, coord.latitude)
            maxLat = max(maxLat, coord.latitude)
            minLon = min(minLon, coord.longitude)
            maxLon = max(maxLon, coord.longitude)
        }

        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2
        )

        let span = MKCoordinateSpan(
            latitudeDelta: (maxLat - minLat) * 1.3,
            longitudeDelta: (maxLon - minLon) * 1.3
        )

        region = MKCoordinateRegion(center: center, span: span)
    }

    func zoomIn() {
        let newSpan = MKCoordinateSpan(
            latitudeDelta: region.span.latitudeDelta / 2,
            longitudeDelta: region.span.longitudeDelta / 2
        )
        region = MKCoordinateRegion(center: region.center, span: newSpan)
    }

    func zoomOut() {
        let newSpan = MKCoordinateSpan(
            latitudeDelta: min(region.span.latitudeDelta * 2, 180),
            longitudeDelta: min(region.span.longitudeDelta * 2, 360)
        )
        region = MKCoordinateRegion(center: region.center, span: newSpan)
    }

    // MARK: - Annotations
    func addDestinationMarker(for location: Location) {
        // Remove existing destination markers
        annotations.removeAll { $0.type == .destination }

        let annotation = MapMarker(
            id: location.id,
            coordinate: location.coordinate,
            title: location.shortName,
            subtitle: location.formattedAddress,
            type: .destination
        )

        annotations.append(annotation)
        selectedAnnotation = annotation
    }

    func addSearchResultMarkers(_ locations: [Location]) {
        // Remove existing search result markers
        annotations.removeAll { $0.type == .searchResult }

        for location in locations {
            let annotation = MapMarker(
                id: location.id,
                coordinate: location.coordinate,
                title: location.shortName,
                subtitle: location.city,
                type: .searchResult
            )
            annotations.append(annotation)
        }
    }

    func clearAnnotations() {
        annotations.removeAll()
        selectedAnnotation = nil
    }

    func clearRoute() {
        routeOverlay = []
    }

    // MARK: - Route Display
    func displayRoute(_ route: Route) {
        routeOverlay = route.coordinates
        fitRoute(route)
    }

    // MARK: - Map Type
    func toggleMapType() {
        switch mapType {
        case .standard:
            mapType = .satellite
        case .satellite:
            mapType = .hybrid
        case .hybrid:
            mapType = .standard
        }
    }
}

// MARK: - Supporting Types
enum MapDisplayType: String, CaseIterable {
    case standard = "Standard"
    case satellite = "Satellite"
    case hybrid = "Hybride"

    var icon: String {
        switch self {
        case .standard: return "map"
        case .satellite: return "globe.europe.africa"
        case .hybrid: return "square.stack.3d.up"
        }
    }
}

enum UserTrackingMode {
    case none
    case follow
}

struct MapMarker: Identifiable {
    let id: String
    let coordinate: CLLocationCoordinate2D
    let title: String
    let subtitle: String?
    let type: MarkerType

    enum MarkerType {
        case destination
        case searchResult
        case waypoint
        case userLocation
    }

    var tintColor: String {
        switch type {
        case .destination: return "red"
        case .searchResult: return "blue"
        case .waypoint: return "orange"
        case .userLocation: return "green"
        }
    }

    var iconName: String {
        switch type {
        case .destination: return "mappin.circle.fill"
        case .searchResult: return "mappin"
        case .waypoint: return "circle.fill"
        case .userLocation: return "location.fill"
        }
    }
}
