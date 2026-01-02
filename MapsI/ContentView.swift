import SwiftUI

struct ContentView: View {
    @EnvironmentObject var mapViewModel: MapViewModel
    @EnvironmentObject var searchViewModel: SearchViewModel
    @EnvironmentObject var navigationViewModel: NavigationViewModel
    @EnvironmentObject var locationService: LocationService

    @State private var showSearch = false
    @State private var showSettings = false
    @State private var showAddressDetail = false

    var body: some View {
        ZStack {
            // Map View
            MapView()
                .ignoresSafeArea()

            VStack {
                // Search bar at top
                SearchBarView(showSearch: $showSearch)
                    .padding(.horizontal)
                    .padding(.top, 8)

                Spacer()

                // Navigation panel when active
                if navigationViewModel.isNavigating {
                    TurnByTurnView()
                        .transition(.move(edge: .bottom))
                }

                // Bottom controls
                BottomControlsView(
                    showSettings: $showSettings,
                    showAddressDetail: $showAddressDetail
                )
                .padding(.bottom, 20)
            }

            // OSM Attribution (required)
            VStack {
                Spacer()
                HStack {
                    OSMAttributionView()
                    Spacer()
                }
                .padding(.leading, 8)
                .padding(.bottom, navigationViewModel.isNavigating ? 180 : 100)
            }
        }
        .sheet(isPresented: $showSearch) {
            SearchView(showAddressDetail: $showAddressDetail)
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .sheet(isPresented: $showAddressDetail) {
            if let selectedLocation = searchViewModel.selectedLocation {
                AddressDetailView(location: selectedLocation)
            }
        }
        .onAppear {
            locationService.requestAuthorization()
        }
    }
}

// MARK: - Search Bar View
struct SearchBarView: View {
    @Binding var showSearch: Bool
    @EnvironmentObject var searchViewModel: SearchViewModel

    var body: some View {
        Button(action: { showSearch = true }) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.gray)

                Text(searchViewModel.selectedLocation?.displayName ?? "Rechercher une adresse...")
                    .foregroundColor(searchViewModel.selectedLocation != nil ? .primary : .gray)
                    .lineLimit(1)

                Spacer()

                if searchViewModel.selectedLocation != nil {
                    Button(action: {
                        searchViewModel.clearSelection()
                    }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.1), radius: 5, x: 0, y: 2)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Bottom Controls View
struct BottomControlsView: View {
    @Binding var showSettings: Bool
    @Binding var showAddressDetail: Bool
    @EnvironmentObject var mapViewModel: MapViewModel
    @EnvironmentObject var locationService: LocationService
    @EnvironmentObject var searchViewModel: SearchViewModel

    var body: some View {
        HStack(spacing: 16) {
            // Settings button
            CircleButton(systemName: "gearshape.fill") {
                showSettings = true
            }

            Spacer()

            // Navigate to selected location
            if searchViewModel.selectedLocation != nil {
                Button(action: {
                    showAddressDetail = true
                }) {
                    HStack {
                        Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                        Text("Itineraire")
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(25)
                    .shadow(radius: 3)
                }
            }

            Spacer()

            // Center on user location
            CircleButton(systemName: "location.fill") {
                mapViewModel.centerOnUserLocation()
            }
        }
        .padding(.horizontal, 20)
    }
}

// MARK: - Circle Button
struct CircleButton: View {
    let systemName: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 20))
                .foregroundColor(.accentColor)
                .frame(width: 50, height: 50)
                .background(Color(.systemBackground))
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.1), radius: 5, x: 0, y: 2)
        }
    }
}

// MARK: - OSM Attribution View
struct OSMAttributionView: View {
    var body: some View {
        Link(destination: URL(string: "https://www.openstreetmap.org/copyright")!) {
            Text("(C) OpenStreetMap")
                .font(.caption2)
                .foregroundColor(.secondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color(.systemBackground).opacity(0.8))
                .cornerRadius(4)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(LocationService())
        .environmentObject(MapViewModel())
        .environmentObject(SearchViewModel())
        .environmentObject(NavigationViewModel())
}
