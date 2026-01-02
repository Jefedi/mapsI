import SwiftUI
import CoreLocation

struct AddressDetailView: View {
    let location: Location

    @EnvironmentObject var mapViewModel: MapViewModel
    @EnvironmentObject var navigationViewModel: NavigationViewModel
    @EnvironmentObject var locationService: LocationService
    @Environment(\.dismiss) private var dismiss

    @State private var selectedMode: TransportMode = .car

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Location header
                    LocationHeaderView(location: location)

                    Divider()

                    // Address details
                    AddressInfoSection(location: location)

                    Divider()

                    // Transport mode selection
                    TransportModeSelectionView(selectedMode: $selectedMode)
                        .onChange(of: selectedMode) { newMode in
                            navigationViewModel.selectedTransportMode = newMode
                            calculateRoute()
                        }

                    // Route info
                    if let route = navigationViewModel.currentRoute {
                        RouteInfoCard(route: route)
                    }

                    // Alternative routes
                    if !navigationViewModel.alternativeRoutes.isEmpty {
                        AlternativeRoutesSection(
                            routes: navigationViewModel.alternativeRoutes,
                            onSelect: { route in
                                navigationViewModel.selectAlternativeRoute(route)
                                mapViewModel.displayRoute(route)
                            }
                        )
                    }

                    // Loading indicator
                    if navigationViewModel.isLoadingRoute {
                        ProgressView("Calcul de l'itineraire...")
                            .padding()
                    }

                    // Error message
                    if let error = navigationViewModel.error {
                        ErrorView(message: error.localizedDescription)
                    }

                    Spacer(minLength: 100)
                }
                .padding()
            }
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Fermer") {
                        dismiss()
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                StartNavigationButton(
                    isEnabled: navigationViewModel.currentRoute != nil,
                    action: startNavigation
                )
            }
            .onAppear {
                calculateRoute()
            }
        }
    }

    private func calculateRoute() {
        guard let userLocation = locationService.currentLocation else {
            // Use default location if user location not available
            return
        }

        Task {
            await navigationViewModel.calculateRoute(
                from: userLocation.coordinate,
                to: location
            )

            if let route = navigationViewModel.currentRoute {
                mapViewModel.displayRoute(route)
            }
        }
    }

    private func startNavigation() {
        guard let userLocation = locationService.currentLocation else { return }

        navigationViewModel.startNavigation(from: userLocation)
        locationService.startNavigationMode()
        dismiss()
    }
}

// MARK: - Location Header View
struct LocationHeaderView: View {
    let location: Location

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: location.categoryIcon)
                .font(.system(size: 36))
                .foregroundColor(.accentColor)
                .frame(width: 60, height: 60)
                .background(Color.accentColor.opacity(0.1))
                .cornerRadius(12)

            VStack(alignment: .leading, spacing: 4) {
                Text(location.shortName)
                    .font(.title2)
                    .fontWeight(.bold)

                if let type = location.type {
                    Text(type.capitalized)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()
        }
    }
}

// MARK: - Address Info Section
struct AddressInfoSection: View {
    let location: Location

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Adresse")
                .font(.headline)

            // Full address
            InfoRow(icon: "mappin.circle.fill", text: location.formattedAddress)

            // City
            if let city = location.city {
                InfoRow(icon: "building.2.fill", text: city)
            }

            // Country
            if let country = location.country {
                InfoRow(icon: "globe", text: country)
            }

            // Coordinates
            HStack {
                Image(systemName: "location.circle")
                    .foregroundColor(.gray)
                    .frame(width: 24)

                Text(String(format: "%.6f, %.6f", location.latitude, location.longitude))
                    .font(.caption)
                    .foregroundColor(.secondary)

                Spacer()

                Button(action: {
                    UIPasteboard.general.string = "\(location.latitude), \(location.longitude)"
                }) {
                    Image(systemName: "doc.on.doc")
                        .font(.caption)
                }
            }
        }
    }
}

struct InfoRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(.accentColor)
                .frame(width: 24)

            Text(text)
                .font(.body)

            Spacer()
        }
    }
}

// MARK: - Transport Mode Selection
struct TransportModeSelectionView: View {
    @Binding var selectedMode: TransportMode

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Mode de transport")
                .font(.headline)

            HStack(spacing: 12) {
                ForEach(TransportMode.allCases) { mode in
                    TransportModeButton(
                        mode: mode,
                        isSelected: selectedMode == mode
                    ) {
                        selectedMode = mode
                    }
                }
            }
        }
    }
}

// MARK: - Route Info Card
struct RouteInfoCard: View {
    let route: Route

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading) {
                    Text("Distance")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(route.formattedDistance)
                        .font(.title2)
                        .fontWeight(.bold)
                }

                Spacer()

                VStack(alignment: .center) {
                    Text("Duree")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(route.formattedDuration)
                        .font(.title2)
                        .fontWeight(.bold)
                }

                Spacer()

                VStack(alignment: .trailing) {
                    Text("Arrivee")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(route.formattedArrivalTime)
                        .font(.title2)
                        .fontWeight(.bold)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

// MARK: - Alternative Routes Section
struct AlternativeRoutesSection: View {
    let routes: [Route]
    let onSelect: (Route) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Itineraires alternatifs")
                .font(.headline)

            ForEach(routes) { route in
                AlternativeRouteRow(route: route)
                    .onTapGesture {
                        onSelect(route)
                    }
            }
        }
    }
}

struct AlternativeRouteRow: View {
    let route: Route

    var body: some View {
        HStack {
            Image(systemName: "arrow.triangle.branch")
                .foregroundColor(.secondary)

            VStack(alignment: .leading) {
                Text(route.formattedDuration)
                    .fontWeight(.medium)
                Text(route.formattedDistance)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Text("via alternative")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}

// MARK: - Start Navigation Button
struct StartNavigationButton: View {
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                Text("Demarrer la navigation")
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(isEnabled ? Color.accentColor : Color.gray)
            .foregroundColor(.white)
            .cornerRadius(12)
        }
        .disabled(!isEnabled)
        .padding()
        .background(Color(.systemBackground))
    }
}

// MARK: - Error View
struct ErrorView: View {
    let message: String

    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
            Text(message)
                .font(.subheadline)
        }
        .padding()
        .background(Color.orange.opacity(0.1))
        .cornerRadius(8)
    }
}

#Preview {
    AddressDetailView(location: Location(
        id: "1",
        latitude: 48.8566,
        longitude: 2.3522,
        displayName: "Paris, France",
        name: "Paris",
        street: nil,
        houseNumber: nil,
        city: "Paris",
        state: "Ile-de-France",
        country: "France",
        postcode: "75000",
        type: "city",
        category: "place",
        osmId: nil,
        osmType: nil,
        placeRank: nil,
        importance: nil
    ))
    .environmentObject(MapViewModel())
    .environmentObject(NavigationViewModel())
    .environmentObject(LocationService())
}
