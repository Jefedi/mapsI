import Foundation
import CoreLocation
import SwiftUI

// MARK: - CLLocationCoordinate2D Extensions
extension CLLocationCoordinate2D {
    /// Calculate distance to another coordinate in meters
    func distance(to coordinate: CLLocationCoordinate2D) -> Double {
        let from = CLLocation(latitude: self.latitude, longitude: self.longitude)
        let to = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        return from.distance(from: to)
    }

    /// Calculate bearing to another coordinate in degrees
    func bearing(to coordinate: CLLocationCoordinate2D) -> Double {
        let lat1 = self.latitude.toRadians()
        let lat2 = coordinate.latitude.toRadians()
        let deltaLon = (coordinate.longitude - self.longitude).toRadians()

        let y = sin(deltaLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(deltaLon)

        let bearing = atan2(y, x).toDegrees()
        return (bearing + 360).truncatingRemainder(dividingBy: 360)
    }

    /// Create a coordinate at a given distance and bearing from this coordinate
    func coordinate(at distance: Double, bearing: Double) -> CLLocationCoordinate2D {
        let earthRadius = 6371000.0 // meters

        let lat1 = self.latitude.toRadians()
        let lon1 = self.longitude.toRadians()
        let bearingRad = bearing.toRadians()
        let angularDistance = distance / earthRadius

        let lat2 = asin(sin(lat1) * cos(angularDistance) + cos(lat1) * sin(angularDistance) * cos(bearingRad))
        let lon2 = lon1 + atan2(sin(bearingRad) * sin(angularDistance) * cos(lat1), cos(angularDistance) - sin(lat1) * sin(lat2))

        return CLLocationCoordinate2D(
            latitude: lat2.toDegrees(),
            longitude: lon2.toDegrees()
        )
    }

    /// Check if coordinate is valid
    var isValid: Bool {
        latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    }
}

// MARK: - Double Extensions
extension Double {
    func toRadians() -> Double {
        self * .pi / 180
    }

    func toDegrees() -> Double {
        self * 180 / .pi
    }

    /// Format as distance string (meters or kilometers)
    var formattedDistance: String {
        if self >= 1000 {
            return String(format: "%.1f km", self / 1000)
        } else {
            return String(format: "%.0f m", self)
        }
    }

    /// Format as duration string (minutes or hours)
    var formattedDuration: String {
        let hours = Int(self) / 3600
        let minutes = (Int(self) % 3600) / 60

        if hours > 0 {
            return "\(hours)h \(minutes)min"
        } else if minutes > 0 {
            return "\(minutes) min"
        } else {
            return "< 1 min"
        }
    }
}

// MARK: - String Extensions
extension String {
    /// Remove diacritics for search comparison
    var normalized: String {
        self.folding(options: .diacriticInsensitive, locale: .current).lowercased()
    }

    /// Truncate string to specified length
    func truncated(to length: Int, trailing: String = "...") -> String {
        if self.count <= length {
            return self
        }
        return String(self.prefix(length)) + trailing
    }
}

// MARK: - Date Extensions
extension Date {
    /// Format as time string
    var formattedTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: self)
    }

    /// Format as relative time
    var relativeTime: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: self, relativeTo: Date())
    }
}

// MARK: - Array Extensions
extension Array where Element == CLLocationCoordinate2D {
    /// Calculate total distance of a path
    var totalDistance: Double {
        guard count > 1 else { return 0 }

        var total = 0.0
        for i in 0..<(count - 1) {
            total += self[i].distance(to: self[i + 1])
        }
        return total
    }

    /// Find the closest point on the path to a given coordinate
    func closestPoint(to coordinate: CLLocationCoordinate2D) -> (index: Int, distance: Double)? {
        guard !isEmpty else { return nil }

        var closestIndex = 0
        var closestDistance = Double.infinity

        for (index, point) in enumerated() {
            let distance = coordinate.distance(to: point)
            if distance < closestDistance {
                closestDistance = distance
                closestIndex = index
            }
        }

        return (closestIndex, closestDistance)
    }
}

// MARK: - View Extensions
extension View {
    /// Apply corner radius to specific corners
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }

    /// Add shadow with common styling
    func standardShadow() -> some View {
        shadow(color: .black.opacity(0.1), radius: 5, x: 0, y: 2)
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}

// MARK: - Color Extensions
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Bundle Extensions
extension Bundle {
    var appVersion: String {
        infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    var buildNumber: String {
        infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }
}
