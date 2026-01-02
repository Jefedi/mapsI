import SwiftUI

struct SearchView: View {
    @EnvironmentObject var searchViewModel: SearchViewModel
    @EnvironmentObject var mapViewModel: MapViewModel
    @Environment(\.dismiss) private var dismiss
    @Binding var showAddressDetail: Bool

    @State private var searchText = ""
    @FocusState private var isSearchFocused: Bool

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Search field
                SearchField(text: $searchText, isSearching: searchViewModel.isSearching)
                    .focused($isSearchFocused)
                    .padding()
                    .onChange(of: searchText) { newValue in
                        searchViewModel.searchText = newValue
                    }

                Divider()

                // Content
                ScrollView {
                    LazyVStack(spacing: 0) {
                        // Error message
                        if let error = searchViewModel.error {
                            ErrorBanner(message: error.localizedDescription)
                        }

                        // Search results
                        if !searchViewModel.searchResults.isEmpty {
                            ResultsSection(
                                title: "Resultats",
                                locations: searchViewModel.searchResults,
                                onSelect: selectLocation
                            )
                        }

                        // Recent searches (show when no search query)
                        if searchText.isEmpty && !searchViewModel.recentSearches.isEmpty {
                            RecentSearchesSection(
                                locations: searchViewModel.recentSearches,
                                onSelect: selectLocation,
                                onDelete: { location in
                                    searchViewModel.removeFromRecentSearches(location)
                                },
                                onClear: {
                                    searchViewModel.clearRecentSearches()
                                }
                            )
                        }

                        // Empty state
                        if searchText.isEmpty && searchViewModel.recentSearches.isEmpty {
                            EmptySearchState()
                        }

                        // No results
                        if !searchText.isEmpty && searchViewModel.searchResults.isEmpty && !searchViewModel.isSearching {
                            NoResultsView(query: searchText)
                        }
                    }
                }
            }
            .navigationTitle("Rechercher")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                isSearchFocused = true
            }
        }
    }

    private func selectLocation(_ location: Location) {
        searchViewModel.selectLocation(location)
        mapViewModel.centerOn(location: location)
        dismiss()
        showAddressDetail = true
    }
}

// MARK: - Search Field
struct SearchField: View {
    @Binding var text: String
    let isSearching: Bool

    var body: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.gray)

            TextField("Adresse, lieu, commerce...", text: $text)
                .autocapitalization(.none)
                .disableAutocorrection(true)

            if isSearching {
                ProgressView()
                    .scaleEffect(0.8)
            } else if !text.isEmpty {
                Button(action: { text = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.gray)
                }
            }
        }
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }
}

// MARK: - Results Section
struct ResultsSection: View {
    let title: String
    let locations: [Location]
    let onSelect: (Location) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.headline)
                .foregroundColor(.secondary)
                .padding(.horizontal)
                .padding(.vertical, 8)

            ForEach(locations) { location in
                LocationRow(location: location)
                    .onTapGesture {
                        onSelect(location)
                    }

                if location.id != locations.last?.id {
                    Divider()
                        .padding(.leading, 60)
                }
            }
        }
    }
}

// MARK: - Recent Searches Section
struct RecentSearchesSection: View {
    let locations: [Location]
    let onSelect: (Location) -> Void
    let onDelete: (Location) -> Void
    let onClear: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Recherches recentes")
                    .font(.headline)
                    .foregroundColor(.secondary)

                Spacer()

                Button("Effacer") {
                    onClear()
                }
                .font(.subheadline)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)

            ForEach(locations) { location in
                HStack {
                    Image(systemName: "clock")
                        .foregroundColor(.gray)
                        .frame(width: 44)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(location.shortName)
                            .font(.body)

                        Text(location.formattedAddress)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    Spacer()

                    Button(action: { onDelete(location) }) {
                        Image(systemName: "xmark")
                            .foregroundColor(.gray)
                            .font(.caption)
                    }
                    .padding(.trailing)
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    onSelect(location)
                }
                .padding(.vertical, 10)
                .padding(.leading, 8)

                if location.id != locations.last?.id {
                    Divider()
                        .padding(.leading, 60)
                }
            }
        }
    }
}

// MARK: - Location Row
struct LocationRow: View {
    let location: Location

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: location.categoryIcon)
                .font(.title2)
                .foregroundColor(.accentColor)
                .frame(width: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(location.shortName)
                    .font(.body)
                    .fontWeight(.medium)

                Text(location.formattedAddress)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundColor(.gray)
                .font(.caption)
        }
        .padding(.vertical, 10)
        .padding(.horizontal)
        .contentShape(Rectangle())
    }
}

// MARK: - Empty States
struct EmptySearchState: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 48))
                .foregroundColor(.gray)

            Text("Recherchez une adresse")
                .font(.headline)

            Text("Entrez une adresse, un lieu ou un commerce pour commencer")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }
}

struct NoResultsView: View {
    let query: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "mappin.slash")
                .font(.system(size: 48))
                .foregroundColor(.gray)

            Text("Aucun resultat")
                .font(.headline)

            Text("Aucun lieu trouve pour \"\(query)\"")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }
}

struct ErrorBanner: View {
    let message: String

    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)

            Text(message)
                .font(.subheadline)

            Spacer()
        }
        .padding()
        .background(Color.orange.opacity(0.1))
    }
}

#Preview {
    SearchView(showAddressDetail: .constant(false))
        .environmentObject(SearchViewModel())
        .environmentObject(MapViewModel())
}
