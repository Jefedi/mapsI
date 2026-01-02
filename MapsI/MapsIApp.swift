import SwiftUI

@main
struct MapsIApp: App {
    @StateObject private var locationService = LocationService()
    @StateObject private var mapViewModel = MapViewModel()
    @StateObject private var searchViewModel = SearchViewModel()
    @StateObject private var navigationViewModel = NavigationViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(locationService)
                .environmentObject(mapViewModel)
                .environmentObject(searchViewModel)
                .environmentObject(navigationViewModel)
        }
    }
}
