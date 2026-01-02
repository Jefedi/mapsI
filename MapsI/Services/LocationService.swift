import Foundation
import CoreLocation
import Combine

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
        locationManager.distanceFilter = 5 // Update every 5 meters
        locationManager.headingFilter = 5 // Update every 5 degrees
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
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        // Filter out inaccurate locations
        guard location.horizontalAccuracy >= 0 && location.horizontalAccuracy < 100 else { return }

        currentLocation = location
        locationUpdateHandler?(location)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard newHeading.headingAccuracy >= 0 else { return }
        heading = newHeading
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        self.error = error
    }

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        authorizationStatus = status
        updateLocationEnabledStatus()

        if status == .authorizedWhenInUse || status == .authorizedAlways {
            startUpdatingLocation()
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

// MARK: - Extensions
extension CLLocationCoordinate2D: Equatable {
    public static func == (lhs: CLLocationCoordinate2D, rhs: CLLocationCoordinate2D) -> Bool {
        lhs.latitude == rhs.latitude && lhs.longitude == rhs.longitude
    }
}
