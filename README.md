# MapsI - Navigation GPS Open Source pour iOS

MapsI est une application de navigation GPS pour iOS, alternative open source a Apple Plans, Google Maps et Waze. Elle utilise les donnees OpenStreetMap.

## Fonctionnalites

- **Carte OpenStreetMap** : Affichage des cartes OSM avec differents styles
- **Recherche d'adresses** : Recherche via Nominatim (geocodage OSM)
- **Navigation GPS** : Calcul d'itineraires avec OSRM
- **Modes de transport** : Voiture, pieton, velo, transports en commun
- **Guidage vocal** : Instructions vocales en francais
- **Turn-by-turn** : Navigation pas a pas avec instructions detaillees
- **Hors ligne** : Historique de recherche local

## Sources de donnees

- **Cartes** : [OpenStreetMap](https://www.openstreetmap.org) - Licence ODbL
- **Geocodage** : [Nominatim](https://nominatim.org) - Service de recherche OSM
- **Itineraires** : [OSRM](https://project-osrm.org) - Open Source Routing Machine

## Attribution OSM

Cette application utilise les donnees OpenStreetMap.
(C) OpenStreetMap contributors - [License](https://www.openstreetmap.org/copyright)

## Installation via AltStore

### Prerequis

1. Un Mac ou PC Windows
2. [AltServer](https://altstore.io) installe sur votre ordinateur
3. [AltStore](https://altstore.io) installe sur votre iPhone/iPad
4. Xcode 15+ installe sur Mac (pour la compilation)

### Compilation et Export IPA

1. **Ouvrir le projet dans Xcode** :
   ```bash
   open MapsI.xcodeproj
   ```

2. **Configurer le signing** :
   - Ouvrir les parametres du projet
   - Aller dans "Signing & Capabilities"
   - Selectionner "Automatically manage signing"
   - Choisir votre Team (compte Apple Developer ou personnel)

3. **Archiver l'application** :
   - Menu Product > Archive
   - Attendre la fin de la compilation

4. **Exporter l'IPA** :
   - Dans l'Organizer, selectionner l'archive
   - Cliquer sur "Distribute App"
   - Choisir "Development" pour AltStore
   - Exporter et sauvegarder le fichier .ipa

5. **Installer via AltStore** :
   - Ouvrir AltStore sur votre iPhone
   - Aller dans "My Apps"
   - Appuyer sur "+" et selectionner le fichier IPA
   - L'application s'installera automatiquement

### Script de Build Automatise

Utilisez le script fourni pour automatiser la compilation :

```bash
./scripts/build-ipa.sh
```

## Structure du Projet

```
MapsI/
├── MapsIApp.swift              # Point d'entree de l'application
├── ContentView.swift           # Vue principale
├── Views/
│   ├── MapView.swift           # Vue de la carte MapKit
│   ├── OSMMapView.swift        # Vue carte OSM avec WebView/Leaflet
│   ├── SearchView.swift        # Interface de recherche
│   ├── AddressDetailView.swift # Details d'une adresse
│   ├── NavigationView.swift    # Vue de navigation active
│   ├── TurnByTurnView.swift    # Instructions pas a pas
│   ├── TransportModeView.swift # Selection du mode de transport
│   ├── RouteOverlayView.swift  # Affichage de l'itineraire
│   └── SettingsView.swift      # Parametres
├── ViewModels/
│   ├── MapViewModel.swift      # Logique de la carte
│   ├── SearchViewModel.swift   # Logique de recherche
│   └── NavigationViewModel.swift # Logique de navigation
├── Models/
│   ├── Location.swift          # Modele de lieu
│   ├── Route.swift             # Modele d'itineraire
│   └── TransportMode.swift     # Modes de transport
├── Services/
│   ├── LocationService.swift   # Service de localisation
│   ├── NominatimService.swift  # API Nominatim (recherche)
│   └── OSRMService.swift       # API OSRM (itineraires)
├── Utils/
│   ├── Constants.swift         # Constantes de l'app
│   └── Extensions.swift        # Extensions Swift
└── Resources/
    └── Assets.xcassets/        # Images et couleurs
```

## Configuration Requise

- iOS 16.0 ou superieur
- iPhone ou iPad avec GPS
- Connexion internet (pour les cartes et itineraires)

## Permissions

L'application requiert les permissions suivantes :

- **Localisation** : Pour afficher votre position et calculer les itineraires
- **Localisation en arriere-plan** : Pour la navigation continue

## Developpement

### Technologies utilisees

- SwiftUI pour l'interface utilisateur
- MapKit pour l'affichage des cartes
- CoreLocation pour la geolocalisation
- AVFoundation pour le guidage vocal
- URLSession pour les requetes API

### APIs externes

- **Nominatim** : https://nominatim.openstreetmap.org
- **OSRM** : https://router.project-osrm.org

**Note** : Pour une utilisation en production, il est recommande d'heberger vos propres instances de Nominatim et OSRM.

## Licence

Ce projet est open source. Les donnees cartographiques sont sous licence ODbL (OpenStreetMap).

## Contribution

Les contributions sont les bienvenues ! N'hesitez pas a ouvrir des issues ou des pull requests.

## Contact

Pour toute question ou suggestion, ouvrez une issue sur ce repository.
