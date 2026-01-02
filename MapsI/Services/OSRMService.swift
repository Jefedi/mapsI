import Foundation
import CoreLocation

class OSRMService {
    static let shared = OSRMService()

    // Public OSRM demo server (for development - consider self-hosting for production)
    private let baseURL = "https://router.project-osrm.org"

    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.httpAdditionalHeaders = [
            "User-Agent": "MapsI iOS App/1.0"
        ]
        session = URLSession(configuration: config)
    }

    // MARK: - Get Route
    func getRoute(
        from origin: CLLocationCoordinate2D,
        to destination: CLLocationCoordinate2D,
        mode: TransportMode,
        alternatives: Bool = true
    ) async throws -> [Route] {
        let profile = mode.osrmProfile

        // OSRM uses lon,lat format
        let coordinates = "\(origin.longitude),\(origin.latitude);\(destination.longitude),\(destination.latitude)"

        var components = URLComponents(string: "\(baseURL)/route/v1/\(profile)/\(coordinates)")!
        components.queryItems = [
            URLQueryItem(name: "overview", value: "full"),
            URLQueryItem(name: "geometries", value: "polyline"),
            URLQueryItem(name: "steps", value: "true"),
            URLQueryItem(name: "alternatives", value: alternatives ? "true" : "false"),
            URLQueryItem(name: "annotations", value: "true")
        ]

        guard let url = components.url else {
            throw OSRMError.invalidURL
        }

        let (data, response) = try await session.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw OSRMError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw OSRMError.serverError(statusCode: httpResponse.statusCode)
        }

        let osrmResponse = try JSONDecoder().decode(OSRMRouteResponse.self, from: data)

        guard osrmResponse.code == "Ok", let osrmRoutes = osrmResponse.routes else {
            throw OSRMError.routeNotFound(message: osrmResponse.message ?? "Route non trouvee")
        }

        return osrmRoutes.map { osrmRoute in
            let coordinates = decodePolyline(osrmRoute.geometry)
            let steps = parseSteps(from: osrmRoute.legs)

            return Route(
                coordinates: coordinates,
                distance: osrmRoute.distance,
                duration: osrmRoute.duration,
                steps: steps,
                transportMode: mode
            )
        }
    }

    // MARK: - Get Route with Waypoints
    func getRoute(
        waypoints: [CLLocationCoordinate2D],
        mode: TransportMode
    ) async throws -> Route? {
        guard waypoints.count >= 2 else {
            throw OSRMError.insufficientWaypoints
        }

        let profile = mode.osrmProfile
        let coordinatesString = waypoints
            .map { "\($0.longitude),\($0.latitude)" }
            .joined(separator: ";")

        var components = URLComponents(string: "\(baseURL)/route/v1/\(profile)/\(coordinatesString)")!
        components.queryItems = [
            URLQueryItem(name: "overview", value: "full"),
            URLQueryItem(name: "geometries", value: "polyline"),
            URLQueryItem(name: "steps", value: "true")
        ]

        guard let url = components.url else {
            throw OSRMError.invalidURL
        }

        let (data, response) = try await session.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw OSRMError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw OSRMError.serverError(statusCode: httpResponse.statusCode)
        }

        let osrmResponse = try JSONDecoder().decode(OSRMRouteResponse.self, from: data)

        guard osrmResponse.code == "Ok", let osrmRoute = osrmResponse.routes?.first else {
            throw OSRMError.routeNotFound(message: osrmResponse.message ?? "Route non trouvee")
        }

        let coordinates = decodePolyline(osrmRoute.geometry)
        let steps = parseSteps(from: osrmRoute.legs)

        return Route(
            coordinates: coordinates,
            distance: osrmRoute.distance,
            duration: osrmRoute.duration,
            steps: steps,
            transportMode: mode
        )
    }

    // MARK: - Nearest Road
    func nearestRoad(to coordinate: CLLocationCoordinate2D) async throws -> CLLocationCoordinate2D {
        var components = URLComponents(string: "\(baseURL)/nearest/v1/driving/\(coordinate.longitude),\(coordinate.latitude)")!
        components.queryItems = [
            URLQueryItem(name: "number", value: "1")
        ]

        guard let url = components.url else {
            throw OSRMError.invalidURL
        }

        let (data, response) = try await session.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw OSRMError.invalidResponse
        }

        struct NearestResponse: Codable {
            let code: String
            let waypoints: [OSRMWaypoint]?
        }

        let nearestResponse = try JSONDecoder().decode(NearestResponse.self, from: data)

        guard let waypoint = nearestResponse.waypoints?.first else {
            throw OSRMError.noNearestRoad
        }

        return CLLocationCoordinate2D(
            latitude: waypoint.location[1],
            longitude: waypoint.location[0]
        )
    }

    // MARK: - Parse Steps
    private func parseSteps(from legs: [OSRMLeg]) -> [RouteStep] {
        var steps: [RouteStep] = []

        for leg in legs {
            for step in leg.steps {
                let maneuverType = ManeuverType(rawValue: step.maneuver.type) ?? .continue_

                let instruction = generateInstruction(
                    type: step.maneuver.type,
                    modifier: step.maneuver.modifier,
                    name: step.name,
                    distance: step.distance
                )

                let routeStep = RouteStep(
                    instruction: instruction,
                    distance: step.distance,
                    duration: step.duration,
                    maneuverType: maneuverType,
                    maneuverModifier: step.maneuver.modifier,
                    name: step.name.isEmpty ? nil : step.name,
                    coordinate: CLLocationCoordinate2D(
                        latitude: step.maneuver.location[1],
                        longitude: step.maneuver.location[0]
                    )
                )

                steps.append(routeStep)
            }
        }

        return steps
    }

    // MARK: - Generate Instruction
    private func generateInstruction(type: String, modifier: String?, name: String, distance: Double) -> String {
        let roadName = name.isEmpty ? "la route" : name

        switch type {
        case "depart":
            return "Depart sur \(roadName)"
        case "arrive":
            return "Vous etes arrive a destination"
        case "turn":
            switch modifier {
            case "left": return "Tournez a gauche sur \(roadName)"
            case "right": return "Tournez a droite sur \(roadName)"
            case "sharp left": return "Tournez fortement a gauche sur \(roadName)"
            case "sharp right": return "Tournez fortement a droite sur \(roadName)"
            case "slight left": return "Tournez legerement a gauche sur \(roadName)"
            case "slight right": return "Tournez legerement a droite sur \(roadName)"
            case "uturn": return "Faites demi-tour"
            default: return "Continuez sur \(roadName)"
            }
        case "continue", "new name":
            return "Continuez sur \(roadName)"
        case "merge":
            return "Rejoignez \(roadName)"
        case "on ramp":
            return "Prenez la bretelle vers \(roadName)"
        case "off ramp":
            return "Sortez vers \(roadName)"
        case "fork":
            switch modifier {
            case "left": return "Tenez la gauche sur \(roadName)"
            case "right": return "Tenez la droite sur \(roadName)"
            default: return "Continuez sur \(roadName)"
            }
        case "end of road":
            switch modifier {
            case "left": return "Au bout de la route, tournez a gauche"
            case "right": return "Au bout de la route, tournez a droite"
            default: return "Fin de route"
            }
        case "roundabout", "rotary":
            return "Entrez dans le rond-point"
        case "exit roundabout":
            return "Sortez du rond-point"
        default:
            return "Continuez sur \(roadName)"
        }
    }

    // MARK: - Polyline Decoder
    func decodePolyline(_ encoded: String) -> [CLLocationCoordinate2D] {
        var coordinates: [CLLocationCoordinate2D] = []
        var index = encoded.startIndex
        var lat = 0
        var lng = 0

        while index < encoded.endIndex {
            // Decode latitude
            var shift = 0
            var result = 0
            var byte: Int

            repeat {
                byte = Int(encoded[index].asciiValue! - 63)
                index = encoded.index(after: index)
                result |= (byte & 0x1F) << shift
                shift += 5
            } while byte >= 0x20

            let deltaLat = (result & 1) != 0 ? ~(result >> 1) : (result >> 1)
            lat += deltaLat

            // Decode longitude
            shift = 0
            result = 0

            repeat {
                byte = Int(encoded[index].asciiValue! - 63)
                index = encoded.index(after: index)
                result |= (byte & 0x1F) << shift
                shift += 5
            } while byte >= 0x20

            let deltaLng = (result & 1) != 0 ? ~(result >> 1) : (result >> 1)
            lng += deltaLng

            coordinates.append(CLLocationCoordinate2D(
                latitude: Double(lat) / 1e5,
                longitude: Double(lng) / 1e5
            ))
        }

        return coordinates
    }
}

// MARK: - Errors
enum OSRMError: LocalizedError {
    case invalidURL
    case invalidResponse
    case serverError(statusCode: Int)
    case routeNotFound(message: String)
    case insufficientWaypoints
    case noNearestRoad

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "URL invalide"
        case .invalidResponse:
            return "Reponse invalide du serveur"
        case .serverError(let statusCode):
            return "Erreur serveur (code: \(statusCode))"
        case .routeNotFound(let message):
            return "Itineraire non trouve: \(message)"
        case .insufficientWaypoints:
            return "Au moins 2 points sont necessaires"
        case .noNearestRoad:
            return "Aucune route a proximite"
        }
    }
}
