import CarPlay
import MapKit

class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {

    var interfaceController: CPInterfaceController?
    var mapTemplate: CPMapTemplate?

    // Navigation session
    var navigationSession: CPNavigationSession?
    var currentTrip: CPTrip?

    // MARK: - Scene Lifecycle

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController
        NavigationBridge.shared.carPlayManager = self

        let mapTemplate = CPMapTemplate()
        mapTemplate.mapDelegate = self

        // Search button
        let searchButton = CPBarButton(title: "Rechercher") { [weak self] _ in
            self?.showSearch()
        }
        mapTemplate.leadingNavigationBarButtons = [searchButton]

        // Favorites button
        let favButton = CPBarButton(title: "Favoris") { [weak self] _ in
            self?.showFavorites()
        }
        mapTemplate.trailingNavigationBarButtons = [favButton]

        self.mapTemplate = mapTemplate
        interfaceController.setRootTemplate(mapTemplate, animated: true, completion: nil)
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        NavigationBridge.shared.carPlayManager = nil
        self.interfaceController = nil
        self.mapTemplate = nil
        self.navigationSession = nil
    }

    // MARK: - Search

    private func showSearch() {
        let searchTemplate = CPSearchTemplate()
        searchTemplate.delegate = self
        interfaceController?.pushTemplate(searchTemplate, animated: true, completion: nil)
    }

    // MARK: - Favorites

    private func showFavorites() {
        // Request favorites from JS
        NavigationBridge.shared.sendToJS("window.mapsiCarPlayGetFavorites()")

        // Show a list template with a loading state
        let section = CPListSection(items: [
            CPListItem(text: "Chargement...", detailText: nil)
        ])
        let listTemplate = CPListTemplate(title: "Favoris", sections: [section])
        interfaceController?.pushTemplate(listTemplate, animated: true, completion: nil)
    }

    func updateFavorites(_ favorites: [[String: Any]]) {
        let items: [CPListItem] = favorites.compactMap { fav in
            guard let name = fav["name"] as? String,
                  let lat = fav["lat"] as? Double,
                  let lon = fav["lon"] as? Double else { return nil }
            let item = CPListItem(text: name, detailText: nil)
            item.handler = { [weak self] _, completion in
                NavigationBridge.shared.selectDestination(lat: lat, lon: lon, name: name)
                self?.interfaceController?.popToRootTemplate(animated: true, completion: nil)
                completion()
            }
            return item
        }

        let section = CPListSection(items: items.isEmpty ? [CPListItem(text: "Aucun favori", detailText: nil)] : items)
        let listTemplate = CPListTemplate(title: "Favoris", sections: [section])

        // Replace current template
        if let topTemplate = interfaceController?.topTemplate, topTemplate is CPListTemplate {
            interfaceController?.popTemplate(animated: false, completion: nil)
        }
        interfaceController?.pushTemplate(listTemplate, animated: false, completion: nil)
    }

    // MARK: - Navigation Callbacks from Bridge

    func onNavigationStarted() {
        guard let mapTemplate = mapTemplate else { return }

        let trip = CPTrip(
            origin: MKMapItem.forCurrentLocation(),
            destination: MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: 0, longitude: 0))),
            routeChoices: [CPRouteChoice(summariesVariants: ["Itineraire"], additionalInformationVariants: [], selectionSummaryVariants: [""])]
        )
        currentTrip = trip

        let session = mapTemplate.startNavigationSession(for: trip)
        session.pauseTrip(for: .loading, description: "Chargement...")
        navigationSession = session
    }

    func onNavigationStopped() {
        navigationSession?.finishTrip()
        navigationSession = nil
        currentTrip = nil
    }

    func onNavigationUpdate() {
        guard let session = navigationSession else { return }
        let bridge = NavigationBridge.shared

        // Build maneuver
        let maneuver = CPManeuver()
        maneuver.instructionVariants = [bridge.currentInstruction]

        // Set maneuver symbol based on type
        maneuver.symbolImage = maneuverImage(for: bridge.maneuverType)

        // Estimate distance to next maneuver
        if let distValue = parseDistance(bridge.currentDistance) {
            maneuver.initialTravelEstimates = CPTravelEstimates(
                distanceRemaining: distValue,
                timeRemaining: 0
            )
        }

        session.upcomingManeuvers = [maneuver]

        // Update trip estimates
        if let totalDist = parseDistance(bridge.remainingDistance) {
            let timeRemaining = parseTimeInterval(bridge.remainingTime)
            let estimates = CPTravelEstimates(
                distanceRemaining: totalDist,
                timeRemaining: timeRemaining
            )
            if let trip = currentTrip {
                session.updateEstimates(estimates, for: trip)
            }
        }

        session.resumeTrip(with: .routing, description: bridge.currentStreet)
    }

    func onSearchResults(_ results: [[String: Any]]) {
        // Results handled in CPSearchTemplateDelegate
    }

    func onRouteCalculated(distance: String, duration: String, eta: String) {
        guard let mapTemplate = mapTemplate else { return }

        // Show route preview with a navigation button
        let navigateButton = CPMapButton { [weak self] _ in
            NavigationBridge.shared.startNavigation()
            self?.mapTemplate?.dismissPanningInterface(animated: true)
        }
        navigateButton.image = UIImage(systemName: "arrow.triangle.turn.up.right.circle.fill")

        let closeButton = CPMapButton { [weak self] _ in
            NavigationBridge.shared.stopNavigation()
            self?.mapTemplate?.dismissPanningInterface(animated: true)
        }
        closeButton.image = UIImage(systemName: "xmark.circle.fill")

        mapTemplate.mapButtons = [navigateButton, closeButton]
    }

    // MARK: - Location

    func updateLocation(_ location: CLLocation) {
        // CarPlay map centering is handled by the web layer via the bridge
    }

    // MARK: - Helpers

    private func maneuverImage(for type: String) -> UIImage {
        let name: String
        switch type {
        case "turn-left", "turn-sharp left":
            name = "arrow.turn.up.left"
        case "turn-right", "turn-sharp right":
            name = "arrow.turn.up.right"
        case "turn-slight left", "fork-left":
            name = "arrow.up.left"
        case "turn-slight right", "fork-right":
            name = "arrow.up.right"
        case "roundabout":
            name = "arrow.triangle.capsulepath"
        case "arrive":
            name = "flag.checkered"
        case "depart", "continue", "turn-straight":
            name = "arrow.up"
        case "turn-uturn":
            name = "arrow.uturn.down"
        case "merge":
            name = "arrow.merge"
        default:
            name = "arrow.up"
        }
        return UIImage(systemName: name) ?? UIImage(systemName: "arrow.up")!
    }

    private func parseDistance(_ str: String) -> Measurement<UnitLength>? {
        let trimmed = str.trimmingCharacters(in: .whitespaces)
        if trimmed.hasSuffix("km") {
            let numStr = trimmed.replacingOccurrences(of: "km", with: "").trimmingCharacters(in: .whitespaces)
            guard let value = Double(numStr) else { return nil }
            return Measurement(value: value, unit: UnitLength.kilometers)
        } else if trimmed.hasSuffix("m") {
            let numStr = trimmed.replacingOccurrences(of: "m", with: "").trimmingCharacters(in: .whitespaces)
            guard let value = Double(numStr) else { return nil }
            return Measurement(value: value, unit: UnitLength.meters)
        }
        return nil
    }

    private func parseTimeInterval(_ str: String) -> TimeInterval {
        var total: TimeInterval = 0
        let trimmed = str.trimmingCharacters(in: .whitespaces)
        // Format: "1 h 30 min" or "45 min"
        let parts = trimmed.components(separatedBy: " ")
        for (i, part) in parts.enumerated() {
            if part == "h", i > 0, let hours = Double(parts[i - 1]) {
                total += hours * 3600
            }
            if part == "min", i > 0, let mins = Double(parts[i - 1]) {
                total += mins * 60
            }
        }
        return total
    }
}

// MARK: - CPMapTemplateDelegate

extension CarPlaySceneDelegate: CPMapTemplateDelegate {

    func mapTemplate(_ mapTemplate: CPMapTemplate, panBeganWith direction: CPMapTemplate.PanDirection) {}
    func mapTemplate(_ mapTemplate: CPMapTemplate, panEndedWith direction: CPMapTemplate.PanDirection) {}

    func mapTemplate(_ mapTemplate: CPMapTemplate, didEndPanGestureWithVelocity velocity: CGPoint) {}
}

// MARK: - CPSearchTemplateDelegate

extension CarPlaySceneDelegate: CPSearchTemplateDelegate {

    func searchTemplate(_ searchTemplate: CPSearchTemplate, updatedSearchText searchText: String, completionHandler: @escaping ([CPListItem]) -> Void) {
        guard searchText.count >= 2 else {
            completionHandler([])
            return
        }

        // Debounce in a simple way: just search after text update
        NavigationBridge.shared.searchAddress(searchText)

        // Results come back async via the bridge
        // We store the completion handler and call it when results arrive
        pendingSearchCompletion = completionHandler
    }

    func searchTemplate(_ searchTemplate: CPSearchTemplate, selectedResult item: CPListItem, completionHandler: @escaping () -> Void) {
        // Extract coordinates from userInfo
        if let info = item.userInfo as? [String: Any],
           let lat = info["lat"] as? Double,
           let lon = info["lon"] as? Double,
           let name = info["name"] as? String {
            NavigationBridge.shared.selectDestination(lat: lat, lon: lon, name: name)
        }
        interfaceController?.popToRootTemplate(animated: true, completion: nil)
        completionHandler()
    }

    // Store pending search completion
    private static var _pendingSearchCompletion: (([CPListItem]) -> Void)?

    var pendingSearchCompletion: (([CPListItem]) -> Void)? {
        get { CarPlaySceneDelegate._pendingSearchCompletion }
        set { CarPlaySceneDelegate._pendingSearchCompletion = newValue }
    }

    func deliverSearchResults(_ results: [[String: Any]]) {
        let items: [CPListItem] = results.prefix(5).compactMap { result in
            guard let name = result["name"] as? String else { return nil }
            let address = result["address"] as? String ?? ""
            let item = CPListItem(text: name, detailText: address)
            item.userInfo = result
            return item
        }
        pendingSearchCompletion?(items)
        pendingSearchCompletion = nil
    }
}
