# MapsI iOS - Navigation GPS avec CarPlay

## Architecture

L'app iOS utilise une approche hybride :
- **iPhone** : WKWebView charge l'interface web existante (Leaflet.js + HTML/CSS/JS)
- **CarPlay** : Templates natifs Swift (CPMapTemplate, CPSearchTemplate) communicant via un bridge JS ↔ Swift

## Structure

```
MapsI/
├── MapsI.xcodeproj/          # Projet Xcode
└── MapsI/
    ├── AppDelegate.swift      # Point d'entree, configuration des scenes
    ├── PhoneSceneDelegate.swift # Scene iPhone (WKWebView)
    ├── MapWebViewController.swift # WebView + CLLocationManager
    ├── Bridge/
    │   └── NavigationBridge.swift  # Pont JS ↔ Swift (WKScriptMessageHandler)
    ├── CarPlay/
    │   └── CarPlaySceneDelegate.swift # Scene CarPlay (CPTemplateApplicationSceneDelegate)
    ├── Resources/
    │   └── web/               # Copie de docs/ avec APIs publiques
    ├── Assets.xcassets/       # Icones
    ├── Info.plist             # Configuration iOS + CarPlay
    ├── MapsI.entitlements     # Entitlement CarPlay navigation
    └── LaunchScreen.storyboard
```

## APIs gratuites utilisees

| Service | API | Limites |
|---------|-----|---------|
| Geocoding | Nominatim (openstreetmap.org) | 1 req/s, User-Agent requis |
| Routing | OSRM (project-osrm.org) | Demo server, usage raisonnable |
| Tuiles | OpenStreetMap / CARTO | Gratuit, attribution requise |
| POI | Overpass API (overpass-api.de) | Requetes raisonnables |
| Meteo | Open-Meteo | Gratuit, 10k req/jour |
| Elevation | OpenTopoData | Gratuit, rate limited |
| Carburant | data.economie.gouv.fr | API gouvernementale gratuite |

## Communication CarPlay ↔ WebView

### JS → Swift
```javascript
window.webkit.messageHandlers.mapsiNative.postMessage({
    action: 'navigationStarted' | 'navigationStopped' | 'navigationUpdate' | 'searchResults' | 'routeCalculated',
    ...data
});
```

### Swift → JS
```swift
NavigationBridge.shared.sendToJS("window.mapsiCarPlaySearch('query')")
NavigationBridge.shared.sendToJS("window.mapsiCarPlaySelectDestination(lat, lon, 'name')")
NavigationBridge.shared.sendToJS("window.mapsiCarPlayStartNavigation()")
```

## Pre-requis

- Xcode 15+
- iOS 16.0+
- Entitlement `com.apple.developer.carplay-navigation` (requiert approbation Apple)

## Build

1. Ouvrir `MapsI.xcodeproj` dans Xcode
2. Selectionner le scheme MapsI
3. Build & Run sur simulateur ou appareil

## Notes

- Le CarPlay entitlement necessite une demande via le portail developpeur Apple
- Pour tester CarPlay, utiliser le simulateur CarPlay dans Xcode (I/O > External Displays > CarPlay)
- Les APIs publiques ont des rate limits - pour la production, auto-heberger Nominatim, OSRM et les tuiles
