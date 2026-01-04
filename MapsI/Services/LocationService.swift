import Foundation
import CoreLocation
import Combine

@MainActor
class LocationService: NSObject, ObservableObject {
    private let locationManager = CLLocationManager()

    @Published var currentLocation: CLLocation?
    @Published var heading: CLHeading?
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var isLocationEnabled = false
    @Published var error: Error?

    private var locationUpdateHandler: ((CLLocation) -> Void)?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = 5
        locationManager.headingFilter = 5
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.showsBackgroundLocationIndicator = true

        authorizationStatus = locationManager.authorizationStatus
        updateLocationEnabledStatus()
    }

    func requestAuthorization() {
        switch authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            locationManager.requestAlwaysAuthorization()
            startUpdatingLocation()
        case .authorizedAlways:
            startUpdatingLocation()
        case .denied, .restricted:
            error = LocationError.authorizationDenied
        @unknown default:
            break
        }
    }

    func startUpdatingLocation() {
        guard isLocationEnabled else {
            error = LocationError.locationServicesDisabled
            return
        }

        locationManager.startUpdatingLocation()
        locationManager.startUpdatingHeading()
    }

    func stopUpdatingLocation() {
        locationManager.stopUpdatingLocation()
        locationManager.stopUpdatingHeading()
    }

    func startNavigationMode() {
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = 2
        locationManager.activityType = .automotiveNavigation
        startUpdatingLocation()
    }

    func stopNavigationMode() {
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = 10
        locationManager.activityType = .other
    }

    private func updateLocationEnabledStatus() {
        isLocationEnabled = CLLocationManager.locationServicesEnabled() &&
            (authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways)
    }
}

// MARK: - CLLocationManagerDelegate
extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        guard location.horizontalAccuracy >= 0 && location.horizontalAccuracy < 100 else { return }

        Task { @MainActor in
            self.currentLocation = location
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard newHeading.headingAccuracy >= 0 else { return }
        Task { @MainActor in
            self.heading = newHeading
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.error = error
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        Task { @MainActor in
            self.authorizationStatus = status
            self.updateLocationEnabledStatus()

            if status == .authorizedWhenInUse || status == .authorizedAlways {
                self.startUpdatingLocation()
            }
        }
    }
}

// MARK: - Location Errors
enum LocationError: LocalizedError {
    case locationServicesDisabled
    case authorizationDenied
    case locationUnavailable

    var errorDescription: String? {
        switch self {
        case .locationServicesDisabled:
            return "Les services de localisation sont desactives"
        case .authorizationDenied:
            return "L'acces a la localisation a ete refuse"
        case .locationUnavailable:
            return "Position non disponible"
        }
    }
}

// MARK: - CLLocationCoordinate2D Extension
extension CLLocationCoordinate2D {
    func isEqual(to other: CLLocationCoordinate2D) -> Bool {
        latitude == other.latitude && longitude == other.longitude
    }
}
