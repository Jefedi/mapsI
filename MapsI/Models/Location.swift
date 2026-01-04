import Foundation
import CoreLocation

struct Location: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let latitude: Double
    let longitude: Double
    let displayName: String
    let name: String?
    let street: String?
    let houseNumber: String?
    let city: String?
    let state: String?
    let country: String?
    let postcode: String?
    let type: String?
    let category: String?

    // Additional OSM info
    let osmId: Int?
    let osmType: String?
    let placeRank: Int?
    let importance: Double?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var formattedAddress: String {
        var parts: [String] = []

        if let street = street {
            if let number = houseNumber {
                parts.append("\(number) \(street)")
            } else {
                parts.append(street)
            }
        }

        if let city = city {
            if let postcode = postcode {
                parts.append("\(postcode) \(city)")
            } else {
                parts.append(city)
            }
        }

        if let country = country {
            parts.append(country)
        }

        return parts.isEmpty ? displayName : parts.joined(separator: ", ")
    }

    var shortName: String {
        name ?? street ?? city ?? displayName
    }

    var categoryIcon: String {
        switch category?.lowercased() {
        case "amenity":
            switch type?.lowercased() {
            case "restaurant": return "fork.knife"
            case "cafe": return "cup.and.saucer.fill"
            case "bar", "pub": return "wineglass.fill"
            case "hospital": return "cross.fill"
            case "pharmacy": return "pills.fill"
            case "bank": return "banknote.fill"
            case "fuel", "gas_station": return "fuelpump.fill"
            case "parking": return "p.circle.fill"
            case "school", "university": return "graduationcap.fill"
            case "cinema": return "film.fill"
            case "theatre": return "theatermasks.fill"
            default: return "mappin.circle.fill"
            }
        case "shop":
            return "bag.fill"
        case "tourism":
            switch type?.lowercased() {
            case "hotel", "hostel": return "bed.double.fill"
            case "museum": return "building.columns.fill"
            case "attraction": return "star.fill"
            default: return "camera.fill"
            }
        case "highway":
            return "road.lanes"
        case "building":
            return "building.2.fill"
        case "place":
            switch type?.lowercased() {
            case "city", "town": return "building.2.crop.circle.fill"
            case "village": return "house.fill"
            default: return "mappin.circle.fill"
            }
        default:
            return "mappin.circle.fill"
        }
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Nominatim Response
struct NominatimSearchResult: Codable {
    let placeId: Int
    let licence: String?
    let osmType: String?
    let osmId: Int?
    let lat: String
    let lon: String
    let displayName: String
    let placeRank: Int?
    let importance: Double?
    let type: String?
    let category: String?
    let address: NominatimAddress?
    let boundingbox: [String]?

    enum CodingKeys: String, CodingKey {
        case placeId = "place_id"
        case licence
        case osmType = "osm_type"
        case osmId = "osm_id"
        case lat, lon
        case displayName = "display_name"
        case placeRank = "place_rank"
        case importance, type
        case category = "class"
        case address, boundingbox
    }

    func toLocation() -> Location? {
        guard let latitude = Double(lat),
              let longitude = Double(lon) else {
            return nil
        }

        return Location(
            id: "\(placeId)",
            latitude: latitude,
            longitude: longitude,
            displayName: displayName,
            name: address?.name,
            street: address?.road,
            houseNumber: address?.houseNumber,
            city: address?.city ?? address?.town ?? address?.village,
            state: address?.state,
            country: address?.country,
            postcode: address?.postcode,
            type: type,
            category: category,
            osmId: osmId,
            osmType: osmType,
            placeRank: placeRank,
            importance: importance
        )
    }
}

struct NominatimAddress: Codable {
    let name: String?
    let houseNumber: String?
    let road: String?
    let suburb: String?
    let city: String?
    let town: String?
    let village: String?
    let county: String?
    let state: String?
    let postcode: String?
    let country: String?
    let countryCode: String?

    enum CodingKeys: String, CodingKey {
        case name
        case houseNumber = "house_number"
        case road, suburb, city, town, village, county, state, postcode, country
        case countryCode = "country_code"
    }
}
