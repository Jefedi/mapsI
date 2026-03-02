import Foundation
import WebKit
import CoreLocation

/// Bridge between the WKWebView (JS) and native iOS / CarPlay.
/// JS sends messages via `window.webkit.messageHandlers.mapsiNative.postMessage({...})`
/// Swift sends data back via `webView.evaluateJavaScript(...)`.
final class NavigationBridge: NSObject, WKScriptMessageHandler {

    static let shared = NavigationBridge()

    weak var webView: WKWebView?
    weak var carPlayManager: CarPlaySceneDelegate?

    // Current navigation state, kept in sync from JS
    private(set) var isNavigating = false
    private(set) var currentInstruction: String = ""
    private(set) var currentDistance: String = ""
    private(set) var currentStreet: String = ""
    private(set) var maneuverType: String = ""
    private(set) var remainingDistance: String = ""
    private(set) var remainingTime: String = ""
    private(set) var eta: String = ""
    private(set) var currentSpeed: Int = 0

    // Route search results for CarPlay
    private(set) var lastSearchResults: [[String: Any]] = []

    private override init() {
        super.init()
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "navigationStarted":
            isNavigating = true
            carPlayManager?.onNavigationStarted()

        case "navigationStopped":
            isNavigating = false
            carPlayManager?.onNavigationStopped()

        case "navigationUpdate":
            currentInstruction = body["instruction"] as? String ?? ""
            currentDistance = body["distance"] as? String ?? ""
            currentStreet = body["street"] as? String ?? ""
            maneuverType = body["maneuverType"] as? String ?? ""
            remainingDistance = body["remainingDistance"] as? String ?? ""
            remainingTime = body["remainingTime"] as? String ?? ""
            eta = body["eta"] as? String ?? ""
            currentSpeed = body["speed"] as? Int ?? 0
            carPlayManager?.onNavigationUpdate()

        case "searchResults":
            if let results = body["results"] as? [[String: Any]] {
                lastSearchResults = results
                carPlayManager?.deliverSearchResults(results)
            }

        case "routeCalculated":
            let distance = body["distance"] as? String ?? ""
            let duration = body["duration"] as? String ?? ""
            let etaStr = body["eta"] as? String ?? ""
            carPlayManager?.onRouteCalculated(distance: distance, duration: duration, eta: etaStr)

        case "favorites":
            if let favorites = body["favorites"] as? [[String: Any]] {
                carPlayManager?.updateFavorites(favorites)
            }

        case "requestAlwaysLocation":
            if let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
               let vc = scene.windows.first?.rootViewController as? MapWebViewController {
                vc.requestAlwaysAuthorization()
            }

        case "stopBackgroundLocation":
            if let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
               let vc = scene.windows.first?.rootViewController as? MapWebViewController {
                vc.stopBackgroundLocation()
            }

        default:
            break
        }
    }

    // MARK: - Send to JS

    func sendToJS(_ js: String) {
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    func searchAddress(_ query: String) {
        let escaped = query.replacingOccurrences(of: "'", with: "\\'")
        sendToJS("window.mapsiCarPlaySearch('\(escaped)')")
    }

    func selectDestination(lat: Double, lon: Double, name: String) {
        let escaped = name.replacingOccurrences(of: "'", with: "\\'")
        sendToJS("window.mapsiCarPlaySelectDestination(\(lat), \(lon), '\(escaped)')")
    }

    func startNavigation() {
        sendToJS("window.mapsiCarPlayStartNavigation()")
    }

    func stopNavigation() {
        sendToJS("window.mapsiCarPlayStopNavigation()")
    }

    // MARK: - Location forwarding

    func updateLocation(_ location: CLLocation) {
        // Forward to CarPlay if active
        carPlayManager?.updateLocation(location)
    }
}
