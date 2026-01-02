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

## Telecharger l'IPA (sans Mac)

L'application est compilee automatiquement par GitHub Actions. **Aucun Mac requis !**

### Methode 1 : Telechargement automatique (recommande)

1. Allez dans l'onglet **Actions** du repository GitHub
2. Cliquez sur le dernier workflow **"Build iOS App"** reussi (coche verte)
3. En bas de la page, telechargez l'artifact **"MapsI-iOS-App"**
4. Dezippez pour obtenir le fichier `MapsI-unsigned.ipa`

### Methode 2 : Lancer le build manuellement

1. Allez dans **Actions** > **Build iOS App**
2. Cliquez sur **"Run workflow"** (bouton a droite)
3. Attendez que le build se termine (~5 minutes)
4. Telechargez l'IPA depuis les artifacts

## Installation via AltStore

### Prerequis

1. Un PC Windows ou Mac (pour AltServer)
2. [AltServer](https://altstore.io) installe sur votre ordinateur
3. [AltStore](https://altstore.io) installe sur votre iPhone/iPad

### Installer l'IPA sur iPhone

1. **Telecharger l'IPA** depuis GitHub Actions (voir ci-dessus)

2. **Installer AltStore** sur votre iPhone :
   - Lancez AltServer sur votre PC/Mac
   - Connectez votre iPhone en USB
   - Installez AltStore via le menu AltServer

3. **Installer MapsI** :
   - Ouvrez AltStore sur votre iPhone
   - Allez dans "My Apps" > "+"
   - Selectionnez le fichier `MapsI-unsigned.ipa`
   - AltStore signera et installera l'app

**Note** : Avec un compte Apple gratuit, l'app doit etre re-signee tous les 7 jours via AltStore.

---

<details>
<summary>Compilation manuelle (si vous avez un Mac)</summary>

### Script de Build Automatise

```bash
./scripts/build-ipa.sh
```

### Compilation avec Xcode

1. Ouvrir `MapsI.xcodeproj` dans Xcode
2. Configurer le signing dans Project Settings
3. Product > Archive
4. Distribute App > Development > Export IPA

</details>

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
