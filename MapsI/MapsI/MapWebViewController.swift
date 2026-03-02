import UIKit
import WebKit
import CoreLocation

class MapWebViewController: UIViewController {

    private(set) var webView: WKWebView!
    private let locationManager = CLLocationManager()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1) // --bg-dark

        setupWebView()
        loadApp()
        setupLocation()
    }

    override var prefersStatusBarHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    // MARK: - WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // JS -> Swift bridge
        let contentController = config.userContentController
        contentController.add(NavigationBridge.shared, name: "mapsiNative")

        // Inject native bridge availability flag
        let bridgeScript = WKUserScript(
            source: "window.mapsiNative = true; window.mapsiPlatform = 'ios';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        contentController.addUserScript(bridgeScript)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.uiDelegate = self

        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])

        NavigationBridge.shared.webView = webView
    }

    // MARK: - Load App

    private func loadApp() {
        guard let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") else {
            fatalError("web/index.html not found in bundle")
        }
        let webDir = htmlURL.deletingLastPathComponent()
        webView.loadFileURL(htmlURL, allowingReadAccessTo: webDir)
    }

    // MARK: - Location

    private func setupLocation() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.requestWhenInUseAuthorization()
    }

    /// Called by the bridge to upgrade to always-on location for active navigation
    func requestAlwaysAuthorization() {
        locationManager.requestAlwaysAuthorization()
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
    }

    func stopBackgroundLocation() {
        locationManager.allowsBackgroundLocationUpdates = false
        locationManager.pausesLocationUpdatesAutomatically = true
    }
}

// MARK: - WKUIDelegate (Geolocation permission)

extension MapWebViewController: WKUIDelegate {

    func webView(
        _ webView: WKWebView,
        requestGeolocationPermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        // Grant geolocation to the web content automatically when the native app
        // already has location authorization, avoiding the second ugly popup that
        // shows the raw file:// path.
        switch locationManager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            decisionHandler(.grant)
        default:
            decisionHandler(.prompt)
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension MapWebViewController: CLLocationManagerDelegate {

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        // Forward to CarPlay bridge
        NavigationBridge.shared.updateLocation(location)
    }
}
