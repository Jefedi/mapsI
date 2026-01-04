import Foundation
import CoreLocation
import Combine

@MainActor
class SearchViewModel: ObservableObject {
    @Published var searchText = ""
    @Published var searchResults: [Location] = []
    @Published var selectedLocation: Location?
    @Published var isSearching = false
    @Published var error: Error?
    @Published var recentSearches: [Location] = []

    private let nominatimService = NominatimService.shared
    private var searchTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    private let maxRecentSearches = 10

    init() {
        loadRecentSearches()

        // Debounce search input
        $searchText
            .debounce(for: .milliseconds(500), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] text in
                self?.performSearch(query: text)
            }
            .store(in: &cancellables)
    }

    // MARK: - Search
    func performSearch(query: String) {
        // Cancel previous search
        searchTask?.cancel()

        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            searchResults = []
            isSearching = false
            return
        }

        guard query.count >= 3 else {
            return
        }

        isSearching = true
        error = nil

        searchTask = Task {
            do {
                let results = try await nominatimService.search(query: query)

                await MainActor.run {
                    self.searchResults = results
                    self.isSearching = false
                }
            } catch {
                await MainActor.run {
                    if !Task.isCancelled {
                        self.error = error
                        self.isSearching = false
                    }
                }
            }
        }
    }

    // MARK: - Selection
    func selectLocation(_ location: Location) {
        selectedLocation = location
        addToRecentSearches(location)
    }

    func clearSelection() {
        selectedLocation = nil
    }

    func clearSearch() {
        searchText = ""
        searchResults = []
        error = nil
    }

    // MARK: - Recent Searches
    private func addToRecentSearches(_ location: Location) {
        // Remove if already exists
        recentSearches.removeAll { $0.id == location.id }

        // Add to beginning
        recentSearches.insert(location, at: 0)

        // Limit size
        if recentSearches.count > maxRecentSearches {
            recentSearches = Array(recentSearches.prefix(maxRecentSearches))
        }

        saveRecentSearches()
    }

    func removeFromRecentSearches(_ location: Location) {
        recentSearches.removeAll { $0.id == location.id }
        saveRecentSearches()
    }

    func clearRecentSearches() {
        recentSearches = []
        saveRecentSearches()
    }

    private func saveRecentSearches() {
        if let data = try? JSONEncoder().encode(recentSearches) {
            UserDefaults.standard.set(data, forKey: "recentSearches")
        }
    }

    private func loadRecentSearches() {
        if let data = UserDefaults.standard.data(forKey: "recentSearches"),
           let searches = try? JSONDecoder().decode([Location].self, from: data) {
            recentSearches = searches
        }
    }

    // MARK: - Reverse Geocoding
    func reverseGeocode(coordinate: CLLocationCoordinate2D) async -> Location? {
        do {
            return try await nominatimService.reverseGeocode(coordinate: coordinate)
        } catch {
            await MainActor.run {
                self.error = error
            }
            return nil
        }
    }
}
