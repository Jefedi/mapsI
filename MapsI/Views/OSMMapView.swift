import SwiftUI
import WebKit

// Alternative OSM Map View using WKWebView with Leaflet
// This provides a true OpenStreetMap experience with proper OSM tiles
struct OSMMapView: UIViewRepresentable {
    @Binding var centerCoordinate: CLLocationCoordinate2D
    @Binding var zoomLevel: Double
    var annotations: [MapAnnotation]
    var routeCoordinates: [CLLocationCoordinate2D]
    var onMapTap: ((CLLocationCoordinate2D) -> Void)?

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = false

        // Load the map HTML
        let html = generateMapHTML()
        webView.loadHTMLString(html, baseURL: nil)

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Update map center
        let js = "map.setView([\(centerCoordinate.latitude), \(centerCoordinate.longitude)], \(zoomLevel));"
        webView.evaluateJavaScript(js, completionHandler: nil)

        // Update markers
        updateMarkers(webView)

        // Update route
        if !routeCoordinates.isEmpty {
            updateRoute(webView)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    private func generateMapHTML() -> String {
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
            <style>
                body { margin: 0; padding: 0; }
                #map { width: 100%; height: 100vh; }
                .leaflet-control-attribution {
                    font-size: 10px;
                }
            </style>
        </head>
        <body>
            <div id="map"></div>
            <script>
                var map = L.map('map', {
                    zoomControl: false
                }).setView([\(centerCoordinate.latitude), \(centerCoordinate.longitude)], \(zoomLevel));

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19
                }).addTo(map);

                var markers = L.layerGroup().addTo(map);
                var routeLayer = null;

                function clearMarkers() {
                    markers.clearLayers();
                }

                function addMarker(lat, lng, title, color) {
                    var icon = L.divIcon({
                        className: 'custom-marker',
                        html: '<div style="background-color: ' + color + '; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });
                    var marker = L.marker([lat, lng], {icon: icon});
                    if (title) {
                        marker.bindPopup(title);
                    }
                    markers.addLayer(marker);
                }

                function setRoute(coordinates) {
                    if (routeLayer) {
                        map.removeLayer(routeLayer);
                    }
                    routeLayer = L.polyline(coordinates, {
                        color: '#007AFF',
                        weight: 5,
                        opacity: 0.8
                    }).addTo(map);
                }

                function clearRoute() {
                    if (routeLayer) {
                        map.removeLayer(routeLayer);
                        routeLayer = null;
                    }
                }

                map.on('click', function(e) {
                    window.webkit.messageHandlers.mapTap.postMessage({
                        lat: e.latlng.lat,
                        lng: e.latlng.lng
                    });
                });
            </script>
        </body>
        </html>
        """
    }

    private func updateMarkers(_ webView: WKWebView) {
        var js = "clearMarkers();"

        for annotation in annotations {
            let color: String
            switch annotation.type {
            case .destination: color = "#FF3B30"
            case .searchResult: color = "#007AFF"
            case .waypoint: color = "#FF9500"
            case .userLocation: color = "#34C759"
            }

            js += """
            addMarker(\(annotation.coordinate.latitude), \(annotation.coordinate.longitude), '\(annotation.title.replacingOccurrences(of: "'", with: "\\'"))', '\(color)');
            """
        }

        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private func updateRoute(_ webView: WKWebView) {
        let coordsArray = routeCoordinates.map { "[\($0.latitude), \($0.longitude)]" }.joined(separator: ",")
        let js = "setRoute([\(coordsArray)]);"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: OSMMapView

        init(_ parent: OSMMapView) {
            self.parent = parent
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "mapTap", let body = message.body as? [String: Double],
               let lat = body["lat"], let lng = body["lng"] {
                let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lng)
                parent.onMapTap?(coordinate)
            }
        }
    }
}

import CoreLocation
