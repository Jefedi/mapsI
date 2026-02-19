# CLAUDE.md - AI Assistant Guide for MapsI

## Project Overview

MapsI is a free, open-source GPS navigation Progressive Web App (PWA) built with vanilla HTML5, CSS3, and JavaScript. It uses Leaflet.js for mapping, OpenStreetMap for tiles, and several open APIs for routing, geocoding, POI search, and elevation data. The app is optimized for mobile (especially iOS) with offline-first architecture.

**Version:** v3.1
**Language:** French (UI, maneuvers, labels)
**Primary target:** Mobile browsers (iPhone, Android)

## Repository Structure

```
mapsI/
├── CLAUDE.md              # This file
├── .gitignore
├── Dockerfile             # Nginx Alpine container
├── docker-compose.yml     # Single-service orchestration
├── nginx.conf             # Gzip, SPA fallback routing
└── docs/                  # All source files (served directly by Nginx)
    ├── index.html         # Main HTML (~365 lines) - DOM structure, views, modals
    ├── app.js             # All application logic (~1290 lines) - single IIFE
    ├── style.css          # All styling (~1837 lines) - dark-first, responsive
    ├── sw.js              # Service Worker - offline caching (cache v14)
    ├── manifest.json      # PWA manifest
    ├── favicon.ico
    ├── apple-touch-icon.png
    └── icons/             # App icons (SVG, 152/180/192/512 PNG)
```

## Tech Stack

- **No build tools, no package manager, no transpilation.** Files in `docs/` are served as-is.
- **Leaflet.js** (v1.9.4) - loaded via CDN in index.html
- **OpenStreetMap** - map tiles
- **Nominatim API** - geocoding/address search
- **OSRM** (Open Source Routing Machine) - route calculation
- **Overpass API** - POI queries (fuel, restaurants, parking, pharmacies)
- **OpenTopoData API** - elevation data
- **French Government API** - real-time fuel prices

## Architecture

### Single-file application pattern

All JavaScript lives in `docs/app.js` as one IIFE:

```javascript
(function() {
    'use strict';
    // ~70+ functions, all state, all logic
    // init() called at end
})();
```

### State management

No framework state management. All state is held in top-level variables within the IIFE scope:

- `map` - Leaflet map instance
- `userPosition` - current GPS coordinates
- `destination` - target location
- `waypoints` - intermediate stops array
- `routeData` - active route details
- `isNavigating` - navigation mode flag
- `searchHistory`, `favorites`, `allRoutes`, etc.

### Persistence

Three localStorage keys:
- `mapsi_history` - last 20 searches
- `mapsi_favorites` - saved locations with icons
- `mapsi_settings` - user preferences (theme, fuel type, voice, etc.)

### Views

The app uses CSS visibility toggling for three main views:
- `#map-view` - interactive map (default)
- `#search-view` - search, history, favorites
- `#settings-view` - preferences

Additional panels overlay the map view:
- `#nav-panel` - route planning (bottom sheet)
- `#active-nav` - turn-by-turn navigation
- `#poi-panel` - points of interest search

### Service Worker (`sw.js`)

Cache name: `mapsi-v14`. Strategies:
- **Network-only** for live APIs (Nominatim, OSRM, Overpass, fuel prices, elevation)
- **Cache-first** for map tiles (OSM, CARTO, Esri, OpenTopoMap)
- **Cache, fallback to network** for static assets (HTML, CSS, JS, icons)

**Important:** Bump the cache version in `sw.js` when making changes to static assets.

## Key Configuration Constants (in app.js)

```
NOMINATIM_URL = 'https://nominatim.openstreetmap.org'
OSRM_URL = 'https://router.project-osrm.org'
FUEL_API = 'https://data.economie.gouv.fr/...'
DEFAULT_CENTER = [46.603354, 1.888334]   // Center of France
DEFAULT_ZOOM = 6
NAV_ZOOM = 17
MAX_HISTORY = 20
POI_RADIUS = 5000                        // 5km
REROUTE_THRESHOLD = 50                   // meters before auto-reroute
```

## Function Organization in app.js

The ~70+ functions are grouped into these categories:

| Category | Functions | Description |
|----------|-----------|-------------|
| Initialization & Settings | ~11 | `init()`, `loadSettings()`, `applySettings()`, theme management |
| Search & History | ~7 | `debounceSearch()` (400ms), Nominatim queries, localStorage history |
| Favorites | ~5 | CRUD operations, long-press to delete, icon types (home/work/star/heart) |
| Waypoints | ~6 | Add/remove/reorder stops, touch-based drag & drop |
| Map & Geolocation | ~8 | Leaflet init, GPS tracking, speed display, custom markers |
| Route Calculation | ~8 | OSRM API, alternatives (up to 3), avoid motorway/toll options |
| Turn-by-Turn Navigation | ~10 | Voice guidance (Web Speech API), off-route detection, maneuver icons |
| POI Search | ~5 | Overpass API queries, fuel prices, parking with capacity |
| Elevation Profile | 1 | Canvas-based visualization, OpenTopoData API |
| Sharing | ~2 | Web Share API with clipboard fallback |
| Touch & UI | ~6 | Long-press (800ms), transport mode selection, touch handlers |
| Utilities | ~9 | `formatDistance()`, `formatDuration()`, `haversine()`, `escapeHtml()` |

## Settings Object Shape

```javascript
{
  theme: 'system' | 'dark' | 'light',
  mapStyle: 'standard' | 'clair' | 'sombre' | 'satellite' | 'topo',
  fuelType: 'Gazole' | 'SP95' | 'SP98' | 'E85' | 'E10' | 'GPLc',
  voiceEnabled: boolean,
  autoReroute: boolean,
  showSpeed: boolean,
  avoidMotorway: boolean,
  avoidToll: boolean
}
```

## CSS Architecture (style.css)

- **Dark-first design** with `.light-mode` class override on `<body>`
- CSS custom properties for theming (e.g., `--primary: #0a84ff`, `--bg-dark: #1a1a2e`)
- Glassmorphism via `backdrop-filter: blur(20px)`
- Safe-area insets throughout for notched devices (`env(safe-area-inset-top)`, etc.)
- Touch targets >= 48px
- Responsive: `@media (orientation: landscape)` for compact layout
- Leaflet control overrides for consistent dark styling

## Development Workflow

### No build step required

Edit files directly in `docs/`. Refresh the browser to see changes.

### Running locally with Docker

```bash
docker-compose up --build
# App available at http://localhost:80
```

### Running without Docker

Serve the `docs/` directory with any static file server:

```bash
# Python
python3 -m http.server 8000 -d docs

# Node.js (npx)
npx serve docs
```

### Deployment

Build and run the Docker container. Nginx serves static files with gzip compression and SPA fallback routing.

## Conventions and Guidelines

### Code style
- All JS in strict mode within a single IIFE
- `const` for constants, `let` for mutable state (no `var`)
- Template literals for HTML generation
- Consistent 4-space indentation
- French for user-facing strings, English for code identifiers and comments

### HTML generation
- User-facing text is in French
- Dynamic HTML uses template literals with `innerHTML`
- XSS prevention via `escapeHtml()` for user-supplied content

### API calls
- All external API calls use the Fetch API
- Search is debounced at 400ms
- Error handling with try/catch and user-friendly alerts
- No authentication required for any API

### Adding new features
1. Add DOM elements to `index.html` if UI is needed
2. Add logic to `app.js` within the IIFE, grouped with related functions
3. Add styles to `style.css`, following the existing section structure
4. Bump `CACHE_NAME` version in `sw.js` if static assets changed
5. Test on mobile (especially iOS Safari) for safe-area and touch behavior

### Map tile providers
Five styles configured with specific tile URLs:
- `standard` - OpenStreetMap default
- `clair` - CARTO Light (Positron)
- `sombre` - CARTO Dark (Dark Matter)
- `satellite` - Esri World Imagery
- `topo` - OpenTopoMap

### Transport modes
Three modes supported via OSRM profiles: `driving`, `walking`, `cycling`

## Common Pitfalls

- **Service Worker caching**: After changing static files, you must increment the cache version in `sw.js` (`mapsi-v14` currently) or users will see stale content.
- **CORS**: All APIs used are public and CORS-enabled. Adding a new API may require a proxy.
- **Mobile testing**: Always test with actual mobile devices. Desktop simulation doesn't catch safe-area, touch gesture, or GPS issues.
- **Single file complexity**: `app.js` is ~1290 lines. When adding features, keep functions small and place them in the correct section.
- **No automated tests**: All validation is manual. Be careful with refactoring.

## External API Rate Limits

- **Nominatim**: Max 1 request/second, include valid User-Agent
- **OSRM demo server**: For development only, not production traffic
- **Overpass API**: Avoid heavy queries; use reasonable bounding boxes
- **OpenTopoData**: Public instance has rate limits; consider self-hosting for production
