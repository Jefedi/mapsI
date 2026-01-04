import Foundation
import CoreLocation

actor NominatimService {
    static let shared = NominatimService()

    private let baseURL = "https://nominatim.openstreetmap.org"
    private let session: URLSession
    private var lastRequestTime: Date?
    private let minRequestInterval: TimeInterval = 1.0 // Respect Nominatim usage policy

    init() {
        let config = URLSessionConfiguration.default
        config.httpAdditionalHeaders = [
            "User-Agent": "MapsI iOS App/1.0 (contact@mapsi.app)",
            "Accept-Language": "fr,en"
        ]
        session = URLSession(configuration: config)
    }

    // MARK: - Search
    func search(query: String, limit: Int = 10, viewbox: String? = nil) async throws -> [Location] {
        await respectRateLimit()

        var components = URLComponents(string: "\(baseURL)/search")!
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "addressdetails", value: "1"),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "dedupe", value: "1")
        ]

        if let viewbox = viewbox {
            queryItems.append(URLQueryItem(name: "viewbox", value: viewbox))
            queryItems.append(URLQueryItem(name: "bounded", value: "0"))
        }

        components.queryItems = queryItems

        guard let url = components.url else {
            throw NominatimError.invalidURL
        }

        let (data, response) = try await session.data(from: url)
        lastRequestTime = Date()

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NominatimError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw NominatimError.serverError(statusCode: httpResponse.statusCode)
        }

        let results = try JSONDecoder().decode([NominatimSearchResult].self, from: data)
        return results.compactMap { $0.toLocation() }
    }

    // MARK: - Reverse Geocoding
    func reverseGeocode(coordinate: CLLocationCoordinate2D) async throws -> Location? {
        await respectRateLimit()

        var components = URLComponents(string: "\(baseURL)/reverse")!
        components.queryItems = [
            URLQueryItem(name: "lat", value: String(coordinate.latitude)),
            URLQueryItem(name: "lon", value: String(coordinate.longitude)),
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "addressdetails", value: "1"),
            URLQueryItem(name: "zoom", value: "18")
        ]

        guard let url = components.url else {
            throw NominatimError.invalidURL
        }

        let (data, response) = try await session.data(from: url)
        lastRequestTime = Date()

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NominatimError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw NominatimError.serverError(statusCode: httpResponse.statusCode)
        }

        let result = try JSONDecoder().decode(NominatimSearchResult.self, from: data)
        return result.toLocation()
    }

    // MARK: - Lookup by OSM ID
    func lookup(osmType: String, osmId: Int) async throws -> Location? {
        await respectRateLimit()

        let typePrefix: String
        switch osmType.lowercased() {
        case "node": typePrefix = "N"
        case "way": typePrefix = "W"
        case "relation": typePrefix = "R"
        default: throw NominatimError.invalidOSMType
        }

        var components = URLComponents(string: "\(baseURL)/lookup")!
        components.queryItems = [
            URLQueryItem(name: "osm_ids", value: "\(typePrefix)\(osmId)"),
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "addressdetails", value: "1")
        ]

        guard let url = components.url else {
            throw NominatimError.invalidURL
        }

        let (data, response) = try await session.data(from: url)
        lastRequestTime = Date()

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NominatimError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw NominatimError.serverError(statusCode: httpResponse.statusCode)
        }

        let results = try JSONDecoder().decode([NominatimSearchResult].self, from: data)
        return results.first?.toLocation()
    }

    // MARK: - Rate Limiting
    private func respectRateLimit() async {
        if let lastRequest = lastRequestTime {
            let elapsed = Date().timeIntervalSince(lastRequest)
            if elapsed < minRequestInterval {
                let delay = minRequestInterval - elapsed
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }
    }
}

// MARK: - Errors
enum NominatimError: LocalizedError {
    case invalidURL
    case invalidResponse
    case serverError(statusCode: Int)
    case noResults
    case invalidOSMType

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "URL invalide"
        case .invalidResponse:
            return "Reponse invalide du serveur"
        case .serverError(let statusCode):
            return "Erreur serveur (code: \(statusCode))"
        case .noResults:
            return "Aucun resultat trouve"
        case .invalidOSMType:
            return "Type OSM invalide"
        }
    }
}
