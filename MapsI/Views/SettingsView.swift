import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var mapViewModel: MapViewModel
    @EnvironmentObject var navigationViewModel: NavigationViewModel
    @Environment(\.dismiss) private var dismiss

    @AppStorage("voiceEnabled") private var voiceEnabled = true
    @AppStorage("units") private var units = "metric"
    @AppStorage("defaultTransportMode") private var defaultTransportMode = "car"
    @AppStorage("avoidTolls") private var avoidTolls = false
    @AppStorage("avoidHighways") private var avoidHighways = false

    var body: some View {
        NavigationView {
            List {
                // Map Section
                Section(header: Text("Carte")) {
                    Picker("Type de carte", selection: $mapViewModel.mapType) {
                        ForEach(MapType.allCases, id: \.self) { type in
                            HStack {
                                Image(systemName: type.icon)
                                Text(type.rawValue)
                            }
                            .tag(type)
                        }
                    }
                }

                // Navigation Section
                Section(header: Text("Navigation")) {
                    Toggle(isOn: $voiceEnabled) {
                        Label("Guidage vocal", systemImage: "speaker.wave.2.fill")
                    }
                    .onChange(of: voiceEnabled) { newValue in
                        navigationViewModel.isVoiceEnabled = newValue
                    }

                    Picker("Mode par defaut", selection: $defaultTransportMode) {
                        ForEach(TransportMode.allCases) { mode in
                            HStack {
                                Image(systemName: mode.icon)
                                Text(mode.displayName)
                            }
                            .tag(mode.rawValue)
                        }
                    }
                }

                // Route Options Section
                Section(header: Text("Options d'itineraire")) {
                    Toggle(isOn: $avoidTolls) {
                        Label("Eviter les peages", systemImage: "eurosign.circle")
                    }

                    Toggle(isOn: $avoidHighways) {
                        Label("Eviter les autoroutes", systemImage: "road.lanes")
                    }
                }

                // Units Section
                Section(header: Text("Unites")) {
                    Picker("Systeme d'unites", selection: $units) {
                        Text("Metrique (km)").tag("metric")
                        Text("Imperial (mi)").tag("imperial")
                    }
                }

                // About Section
                Section(header: Text("A propos")) {
                    // App version
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }

                    // Data sources
                    NavigationLink(destination: DataSourcesView()) {
                        Label("Sources de donnees", systemImage: "doc.text")
                    }

                    // Privacy
                    NavigationLink(destination: PrivacyView()) {
                        Label("Confidentialite", systemImage: "hand.raised.fill")
                    }

                    // OSM Attribution
                    Link(destination: URL(string: "https://www.openstreetmap.org/copyright")!) {
                        HStack {
                            Label("OpenStreetMap", systemImage: "map")
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundColor(.secondary)
                        }
                    }
                }

                // Cache Section
                Section(header: Text("Stockage")) {
                    Button(action: clearCache) {
                        Label("Vider le cache", systemImage: "trash")
                            .foregroundColor(.red)
                    }

                    Button(action: clearHistory) {
                        Label("Effacer l'historique", systemImage: "clock.arrow.circlepath")
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Parametres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func clearCache() {
        // Clear URL cache
        URLCache.shared.removeAllCachedResponses()
    }

    private func clearHistory() {
        // Clear recent searches
        UserDefaults.standard.removeObject(forKey: "recentSearches")
    }
}

// MARK: - Data Sources View
struct DataSourcesView: View {
    var body: some View {
        List {
            Section(header: Text("Cartes")) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("OpenStreetMap")
                        .font(.headline)
                    Text("Les donnees cartographiques sont fournies par OpenStreetMap et ses contributeurs.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Link("openstreetmap.org", destination: URL(string: "https://www.openstreetmap.org")!)
                        .font(.caption)
                }
                .padding(.vertical, 4)
            }

            Section(header: Text("Recherche")) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Nominatim")
                        .font(.headline)
                    Text("Service de geocodage utilisant les donnees OpenStreetMap.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Link("nominatim.org", destination: URL(string: "https://nominatim.org")!)
                        .font(.caption)
                }
                .padding(.vertical, 4)
            }

            Section(header: Text("Itineraires")) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("OSRM")
                        .font(.headline)
                    Text("Open Source Routing Machine - Calcul d'itineraires base sur OpenStreetMap.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Link("project-osrm.org", destination: URL(string: "https://project-osrm.org")!)
                        .font(.caption)
                }
                .padding(.vertical, 4)
            }

            Section(header: Text("Licence")) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Open Database License (ODbL)")
                        .font(.headline)
                    Text("Les donnees OpenStreetMap sont disponibles sous licence ODbL. Vous etes libre de copier, distribuer et adapter les donnees, a condition de crediter OpenStreetMap et ses contributeurs.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Sources de donnees")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Privacy View
struct PrivacyView: View {
    var body: some View {
        List {
            Section(header: Text("Localisation")) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Utilisation de la position")
                        .font(.headline)
                    Text("Votre position est utilisee uniquement pour afficher votre emplacement sur la carte et calculer des itineraires. Elle n'est jamais envoyee a des serveurs tiers sans votre consentement explicite.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section(header: Text("Recherches")) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Historique de recherche")
                        .font(.headline)
                    Text("Vos recherches sont stockees localement sur votre appareil pour faciliter l'acces aux lieux frequemment recherches. Elles peuvent etre effacees a tout moment depuis les parametres.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section(header: Text("Donnees envoyees")) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Services externes")
                        .font(.headline)
                    Text("Lors de la recherche d'adresses ou du calcul d'itineraires, les requetes sont envoyees aux services Nominatim et OSRM. Ces services ont leur propre politique de confidentialite.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section(header: Text("Collecte de donnees")) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Pas de collecte")
                        .font(.headline)
                    Text("Cette application ne collecte aucune donnee personnelle. Aucune information n'est envoyee a nos serveurs.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Confidentialite")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    SettingsView()
        .environmentObject(MapViewModel())
        .environmentObject(NavigationViewModel())
}
