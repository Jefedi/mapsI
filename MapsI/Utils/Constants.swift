import Foundation
import SwiftUI

enum Constants {
    // MARK: - API Endpoints
    enum API {
        static let nominatimBaseURL = "https://nominatim.openstreetmap.org"
        static let osrmBaseURL = "https://router.project-osrm.org"

        // OSM Tile servers
        static let osmTileURL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        static let osmCycleURL = "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"
    }

    // MARK: - Map Settings
    enum Map {
        static let defaultLatitude = 48.8566 // Paris
        static let defaultLongitude = 2.3522
        static let defaultZoom: Double = 14
        static let minZoom: Double = 3
        static let maxZoom: Double = 19

        static let navigationZoom: Double = 17
        static let searchResultsZoom: Double = 15
    }

    // MARK: - Location
    enum Location {
        static let defaultAccuracy: Double = 100 // meters
        static let navigationAccuracy: Double = 10 // meters
        static let distanceFilter: Double = 5 // meters
        static let headingFilter: Double = 5 // degrees
    }

    // MARK: - Navigation
    enum Navigation {
        static let rerooteThreshold: Double = 50 // meters off route
        static let arrivalThreshold: Double = 30 // meters from destination
        static let upcomingTurnDistance: Double = 100 // meters before turn announcement
        static let prepareTurnDistance: Double = 500 // meters before "prepare" announcement
    }

    // MARK: - Search
    enum Search {
        static let debounceDelay: Double = 0.5 // seconds
        static let minQueryLength = 3
        static let maxResults = 10
        static let maxRecentSearches = 10
    }

    // MARK: - UI
    enum UI {
        static let animationDuration: Double = 0.3
        static let cornerRadius: CGFloat = 12
        static let shadowRadius: CGFloat = 5
        static let buttonSize: CGFloat = 50
    }

    // MARK: - Storage Keys
    enum StorageKeys {
        static let recentSearches = "recentSearches"
        static let favoriteLocations = "favoriteLocations"
        static let voiceEnabled = "voiceEnabled"
        static let defaultTransportMode = "defaultTransportMode"
        static let mapType = "mapType"
        static let units = "units"
        static let avoidTolls = "avoidTolls"
        static let avoidHighways = "avoidHighways"
    }

    // MARK: - App Info
    enum App {
        static let name = "MapsI"
        static let version = "1.0.0"
        static let bundleId = "com.mapsi.navigation"
        static let userAgent = "MapsI iOS App/1.0 (contact@mapsi.app)"
    }

    // MARK: - OSM Attribution
    enum OSM {
        static let attribution = "(C) OpenStreetMap contributors"
        static let copyrightURL = "https://www.openstreetmap.org/copyright"
        static let nominatimUsagePolicy = "https://operations.osmfoundation.org/policies/nominatim/"
    }
}

// MARK: - Colors
extension Color {
    static let mapRouteColor = Color.blue
    static let mapAlternativeRouteColor = Color.gray.opacity(0.5)
    static let mapUserLocationColor = Color.blue
    static let mapDestinationColor = Color.red
    static let mapWaypointColor = Color.orange
}

// MARK: - User Defaults Extension
extension UserDefaults {
    var voiceEnabled: Bool {
        get { bool(forKey: Constants.StorageKeys.voiceEnabled) }
        set { set(newValue, forKey: Constants.StorageKeys.voiceEnabled) }
    }

    var defaultTransportMode: String {
        get { string(forKey: Constants.StorageKeys.defaultTransportMode) ?? TransportMode.car.rawValue }
        set { set(newValue, forKey: Constants.StorageKeys.defaultTransportMode) }
    }

    var units: String {
        get { string(forKey: Constants.StorageKeys.units) ?? "metric" }
        set { set(newValue, forKey: Constants.StorageKeys.units) }
    }

    var avoidTolls: Bool {
        get { bool(forKey: Constants.StorageKeys.avoidTolls) }
        set { set(newValue, forKey: Constants.StorageKeys.avoidTolls) }
    }

    var avoidHighways: Bool {
        get { bool(forKey: Constants.StorageKeys.avoidHighways) }
        set { set(newValue, forKey: Constants.StorageKeys.avoidHighways) }
    }
}
