import Foundation
import CoreLocation

struct Route: Identifiable, Equatable {
    let id = UUID()
    let coordinates: [CLLocationCoordinate2D]
    let distance: Double // meters
    let duration: Double // seconds
    let steps: [RouteStep]
    let transportMode: TransportMode

    var formattedDistance: String {
        if distance >= 1000 {
            return String(format: "%.1f km", distance / 1000)
        } else {
            return String(format: "%.0f m", distance)
        }
    }

    var formattedDuration: String {
        let hours = Int(duration) / 3600
        let minutes = (Int(duration) % 3600) / 60

        if hours > 0 {
            return "\(hours)h \(minutes)min"
        } else if minutes > 0 {
            return "\(minutes) min"
        } else {
            return "< 1 min"
        }
    }

    var estimatedArrival: Date {
        Date().addingTimeInterval(duration)
    }

    var formattedArrivalTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: estimatedArrival)
    }

    static func == (lhs: Route, rhs: Route) -> Bool {
        lhs.id == rhs.id
    }
}

struct RouteStep: Identifiable, Equatable {
    let id = UUID()
    let instruction: String
    let distance: Double
    let duration: Double
    let maneuverType: ManeuverType
    let maneuverModifier: String?
    let name: String?
    let coordinate: CLLocationCoordinate2D

    var formattedDistance: String {
        if distance >= 1000 {
            return String(format: "%.1f km", distance / 1000)
        } else {
            return String(format: "%.0f m", distance)
        }
    }

    var maneuverIcon: String {
        switch maneuverType {
        case .turn:
            switch maneuverModifier {
            case "left": return "arrow.turn.up.left"
            case "right": return "arrow.turn.up.right"
            case "sharp left": return "arrow.turn.up.left"
            case "sharp right": return "arrow.turn.up.right"
            case "slight left": return "arrow.up.left"
            case "slight right": return "arrow.up.right"
            case "uturn": return "arrow.uturn.down"
            default: return "arrow.up"
            }
        case .newName, .continue_:
            return "arrow.up"
        case .merge:
            return "arrow.merge"
        case .onRamp, .offRamp:
            return "arrow.up.right"
        case .fork:
            return "arrow.branch"
        case .endOfRoad:
            switch maneuverModifier {
            case "left": return "arrow.turn.up.left"
            case "right": return "arrow.turn.up.right"
            default: return "arrow.up"
            }
        case .depart:
            return "figure.walk.departure"
        case .arrive:
            return "flag.checkered"
        case .roundabout, .rotary:
            return "arrow.triangle.2.circlepath"
        case .notification:
            return "info.circle"
        case .exitRoundabout:
            return "arrow.up.right"
        }
    }

    static func == (lhs: RouteStep, rhs: RouteStep) -> Bool {
        lhs.id == rhs.id
    }
}

enum ManeuverType: String, Codable {
    case turn
    case newName = "new name"
    case depart
    case arrive
    case merge
    case onRamp = "on ramp"
    case offRamp = "off ramp"
    case fork
    case endOfRoad = "end of road"
    case continue_ = "continue"
    case roundabout
    case rotary
    case exitRoundabout = "exit roundabout"
    case notification

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let rawValue = try container.decode(String.self)
        self = ManeuverType(rawValue: rawValue) ?? .continue_
    }
}

// MARK: - OSRM Response Models
struct OSRMRouteResponse: Codable {
    let code: String
    let routes: [OSRMRoute]?
    let waypoints: [OSRMWaypoint]?
    let message: String?
}

struct OSRMRoute: Codable {
    let distance: Double
    let duration: Double
    let geometry: String // Polyline encoded
    let legs: [OSRMLeg]
}

struct OSRMLeg: Codable {
    let distance: Double
    let duration: Double
    let steps: [OSRMStep]
    let summary: String?
}

struct OSRMStep: Codable {
    let distance: Double
    let duration: Double
    let geometry: String
    let name: String
    let mode: String?
    let maneuver: OSRMManeuver
    let intersections: [OSRMIntersection]?
}

struct OSRMManeuver: Codable {
    let location: [Double]
    let bearingBefore: Int?
    let bearingAfter: Int?
    let type: String
    let modifier: String?
    let instruction: String?

    enum CodingKeys: String, CodingKey {
        case location
        case bearingBefore = "bearing_before"
        case bearingAfter = "bearing_after"
        case type, modifier, instruction
    }
}

struct OSRMIntersection: Codable {
    let location: [Double]
    let bearings: [Int]?
    let entry: [Bool]?
    let `in`: Int?
    let out: Int?
}

struct OSRMWaypoint: Codable {
    let name: String
    let location: [Double]
    let distance: Double?
    let hint: String?
}
