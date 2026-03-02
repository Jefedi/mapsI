// ==========================================
// MapsI iOS v3.2 - Navigation GPS avec OpenStreetMap
// Free public APIs - iOS/CarPlay native bridge
// ==========================================

(function() {
    'use strict';

    // ===== CONFIG (free public APIs) =====
    const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
    const OSRM_URL = 'https://router.project-osrm.org';
    const FUEL_API = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
    const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
    const WEATHER_URL = 'https://api.open-meteo.com';
    const DEFAULT_CENTER = [46.603354, 1.888334];
    const DEFAULT_ZOOM = 6;
    const SEARCH_DEBOUNCE = 400;
    const LONG_PRESS_DURATION = 800;
    const LONG_PRESS_MOVE_THRESHOLD = 10;
    const NAV_ZOOM = 17;
    const MAX_HISTORY = 20;
    const HISTORY_KEY = 'mapsi_history';
    const FAVORITES_KEY = 'mapsi_favorites';
    const SETTINGS_KEY = 'mapsi_settings';
    const REROUTE_THRESHOLD = 50;
    const POI_RADIUS = 5000;
    const TRIPS_DB = 'mapsi_trips';
    const TRIPS_STORE = 'trips';
    const RADAR_QUERY_INTERVAL = 30000;
    const RADAR_ALERT_DISTANCE = 500;
    const WEATHER_UPDATE_INTERVAL = 900000; // 15 min

    // Native bridge detection
    const isNativeApp = !!(window.mapsiNative || window.webkit?.messageHandlers?.mapsiNative);

    const MAP_TILES = {
        standard: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>', maxZoom: 19 },
        clair: { url: 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}@2x.png', attr: '&copy; OSM &copy; CARTO', maxZoom: 20 },
        sombre: { url: 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}@2x.png', attr: '&copy; OSM &copy; CARTO', maxZoom: 20 }
    };

    // ===== SETTINGS =====
    let settings = {
        theme: 'system',
        mapStyle: 'standard',
        fuelType: 'SP95',
        voiceEnabled: true,
        autoReroute: true,
        showSpeed: true,
        avoidMotorway: false,
        avoidToll: false,
        avoidFerry: false,
        autoNightMap: false,
        radarAlerts: true,
        syncEnabled: false, // unused in native app
        dashboardItems: ['altitude', 'heading'],
        vehicleProfile: { height: null, weight: null, width: null, length: null }
    };

    // ===== STATE =====
    let map, tileLayer;
    let userMarker, destMarker;
    let routeLayer, routeShadowLayer;
    let altRouteLayers = [];
    let poiMarkers = [];
    let waypointMarkers = [];
    let userPosition = null;
    let destination = null;
    let waypoints = [];
    let routeData = null;
    let allRoutes = [];
    let selectedRouteIndex = 0;
    let routeSteps = [];
    let currentStepIndex = 0;
    let transportMode = 'driving';
    let isTracking = false;
    let isNavigating = false;
    let watchId = null;
    let searchTimeout = null;
    let locationErrorShown = false;
    let currentView = 'map';
    let searchHistory = [];
    let favorites = [];
    let lastSpokenStep = -1;
    let rerouteTimeout = null;
    let currentSpeedLimit = null;
    let speedLimitTimeout = null;
    let addingWaypoint = false;
    let lastMatchedSegmentIndex = 0;
    let snappedPosition = null;

    let longPressTimer = null;
    let longPressStartX = 0;
    let longPressStartY = 0;
    let routeAbortController = null;

    // New feature state
    let isochroneLayer = null;
    let gpxImportLayer = null;
    let isSimulating = false;
    let simulationFrame = null;
    let simulationIndex = 0;
    let radarMarkers = [];
    let knownRadars = new Set();
    let radarQueryTimeout = null;
    let tripRecording = null;
    let tripsDb = null;
    let weatherTimeout = null;
    let previousMapStyle = null;
    let poiClusterGroup = null;

    // ===== TOAST NOTIFICATIONS =====
    function showToast(message, type = 'info', duration = 3000) {
        const existing = document.querySelector('.mapsi-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = `mapsi-toast mapsi-toast-${type}`;
        toast.textContent = message;
        toast.setAttribute('role', 'alert');
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('mapsi-toast-show'));
        setTimeout(() => {
            toast.classList.remove('mapsi-toast-show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ===== DOM =====
    const $ = id => document.getElementById(id);
    const $mapView = $('map-view');
    const $searchView = $('search-view');
    const $settingsView = $('settings-view');
    const $searchInput = $('search-input');
    const $searchClear = $('search-clear');
    const $searchResults = $('search-results');
    const $searchContainer = $('search-container');
    const $locateBtn = $('locate-btn');
    const $poiBtn = $('poi-btn');
    const $poiPanel = $('poi-panel');
    const $poiResults = $('poi-results');
    const $poiClose = $('poi-close');
    const $transportModes = $('transport-modes');
    const $navPanel = $('nav-panel');
    const $navDistance = $('nav-distance');
    const $navDuration = $('nav-duration');
    const $navEta = $('nav-eta');
    const $navStepText = $('nav-step-text');
    const $navClose = $('nav-close');
    const $navStartBtn = $('nav-start-btn');
    const $navShareBtn = $('nav-share-btn');
    const $routeAlternatives = $('route-alternatives');
    const $activeNav = $('active-nav');
    const $activeNavDistance = $('active-nav-distance');
    const $activeNavStreet = $('active-nav-street');
    const $activeNavIcon = $('active-nav-icon');
    const $activeNavStop = $('active-nav-stop');
    const $activeNavBottom = $('active-nav-bottom');
    const $remainingDistance = $('remaining-distance');
    const $remainingTime = $('remaining-time');
    const $etaTime = $('eta-time');
    const $speedDisplay = $('speed-display');
    const $speedValue = $('speed-value');
    const $speedLimit = $('speed-limit');
    const $speedLimitValue = $('speed-limit-value');
    const $loading = $('loading');
    const $toolbar = $('toolbar');
    const $historyList = $('history-list');
    const $historyEmpty = $('history-empty');
    const $historyClearBtn = $('history-clear-btn');
    const $favoritesList = $('favorites-list');
    const $addFavoriteBtn = $('add-favorite-btn');
    const $favoriteModal = $('favorite-modal');
    const $favoriteModalClose = $('favorite-modal-close');
    const $favoriteName = $('favorite-name');
    const $saveFavoriteBtn = $('save-favorite-btn');
    const $shareModal = $('share-modal');
    const $shareModalClose = $('share-modal-close');
    const $sharePositionBtn = $('share-position-btn');
    const $shareRouteBtn = $('share-route-btn');
    const $themeSelect = $('theme-select');
    const $mapStyleSelect = $('map-style-select');
    const $fuelTypeSelect = $('fuel-type-select');
    const $voiceToggle = $('voice-toggle');
    const $autoRerouteToggle = $('auto-reroute-toggle');
    const $showSpeedToggle = $('show-speed-toggle');
    const $waypointsList = $('waypoints-list');
    const $addWaypointBtn = $('add-waypoint-btn');
    const $avoidMotorwayToggle = $('avoid-motorway-toggle');
    const $avoidTollToggle = $('avoid-toll-toggle');
    const $avoidFerryToggle = $('avoid-ferry-toggle');
    const $elevationProfile = $('elevation-profile');
    const $elevationCanvas = $('elevation-canvas');
    const $elevationInfo = $('elevation-info');
    const $navParkingBtn = $('nav-parking-btn');
    const $quickPoiBar = $('quick-poi-bar');
    const $quickPoiPopup = $('quick-poi-popup');
    const $quickPoiPopupTitle = $('quick-poi-popup-title');
    const $quickPoiPopupResults = $('quick-poi-popup-results');
    const $quickPoiPopupClose = $('quick-poi-popup-close');

    // New feature DOM refs
    const $isochroneBtn = $('isochrone-btn');
    const $isochroneModal = $('isochrone-modal');
    const $isochroneModalClose = $('isochrone-modal-close');
    const $isochroneCalcBtn = $('isochrone-calc-btn');
    const $gpxImportInput = $('gpx-import-input');
    const $navGpxBtn = $('nav-gpx-btn');
    const $navSimulateBtn = $('nav-simulate-btn');
    const $gpxModal = $('gpx-modal');
    const $gpxModalClose = $('gpx-modal-close');
    const $gpxExportBtn = $('gpx-export-btn');
    const $gpxImportBtn = $('gpx-import-btn');
    const $optimizeWaypointsBtn = $('optimize-waypoints-btn');
    const $weatherWidget = $('weather-widget');
    const $weatherIcon = $('weather-icon');
    const $weatherTemp = $('weather-temp');
    const $weatherWind = $('weather-wind');
    const $tripsList = $('trips-list');
    const $tripsEmpty = $('trips-empty');
    const $tripsClearBtn = $('trips-clear-btn');
    const $navDashboard = $('nav-dashboard');
    const $dashAltitude = $('dash-altitude');
    const $dashHeading = $('dash-heading');
    const $shortcutsModal = $('shortcuts-modal');
    const $shortcutsModalClose = $('shortcuts-modal-close');
    const $autoNightToggle = $('auto-night-toggle');
    const $radarAlertsToggle = $('radar-alerts-toggle');
    const $vehicleHeight = $('vehicle-height');
    const $vehicleWeight = $('vehicle-weight');
    const $vehicleWidth = $('vehicle-width');
    const $vehicleLength = $('vehicle-length');
    const $dashAltitudeToggle = $('dash-altitude-toggle');
    const $dashHeadingToggle = $('dash-heading-toggle');

    // ===== INIT =====
    function init() {
        loadSettings();
        loadHistory();
        loadFavorites();
        applySettings();
        initMap();
        setupToolbar();
        setupHistoryEvents();
        setupSettingsEvents();
        setupFavoriteEvents();
        setupShareEvents();
        setupPOIEvents();
        setupQuickPOIEvents();
        setupWaypointEvents();
        setupParkingEvents();
        setupIsochroneEvents();
        setupGPXEvents();
        setupSimulationEvents();
        setupKeyboardShortcuts();
        setupWeather();
        setupTripsDB();
        setupOfflineDownload();
        setupNewSettingsEvents();
        setupSyncEvents();
        renderHistory();
        renderFavorites();
        renderTrips();
        initPoiClusterGroup();
    }

    // ===== SETTINGS =====
    function loadSettings() {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if ('darkMode' in parsed && !('theme' in parsed)) {
                    parsed.theme = parsed.darkMode ? 'dark' : 'light';
                    delete parsed.darkMode;
                }
                settings = { ...settings, ...parsed };
            }
        } catch (e) {}
    }

    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
    }

    function isDarkMode() {
        if (settings.theme === 'dark') return true;
        if (settings.theme === 'light') return false;
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    }

    function applySettings() {
        const dark = isDarkMode();
        document.body.classList.toggle('light-mode', !dark);
        $themeSelect.value = settings.theme;
        $mapStyleSelect.value = settings.mapStyle;
        $fuelTypeSelect.value = settings.fuelType;
        $voiceToggle.checked = settings.voiceEnabled;
        $autoRerouteToggle.checked = settings.autoReroute;
        $showSpeedToggle.checked = settings.showSpeed;
        $avoidMotorwayToggle.checked = settings.avoidMotorway;
        $avoidTollToggle.checked = settings.avoidToll;
        $avoidFerryToggle.checked = settings.avoidFerry;

        const tilePane = document.querySelector('.leaflet-tile-pane');
        if (tilePane) {
            tilePane.classList.toggle('dark-tiles', dark && settings.mapStyle === 'standard');
        }

        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.content = dark ? '#1a1a2e' : '#f2f2f7';

        // New settings
        if ($autoNightToggle) $autoNightToggle.checked = settings.autoNightMap;
        if ($radarAlertsToggle) $radarAlertsToggle.checked = settings.radarAlerts;
        if ($vehicleHeight) $vehicleHeight.value = settings.vehicleProfile?.height || '';
        if ($vehicleWeight) $vehicleWeight.value = settings.vehicleProfile?.weight || '';
        if ($vehicleWidth) $vehicleWidth.value = settings.vehicleProfile?.width || '';
        if ($vehicleLength) $vehicleLength.value = settings.vehicleProfile?.length || '';
        if ($dashAltitudeToggle) $dashAltitudeToggle.checked = settings.dashboardItems?.includes('altitude');
        if ($dashHeadingToggle) $dashHeadingToggle.checked = settings.dashboardItems?.includes('heading');
    }

    function setupSettingsEvents() {
        $themeSelect.addEventListener('change', () => {
            settings.theme = $themeSelect.value;
            applySettings();
            saveSettings();
        });

        $mapStyleSelect.addEventListener('change', () => {
            settings.mapStyle = $mapStyleSelect.value;
            changeMapStyle(settings.mapStyle);
            applySettings();
            saveSettings();
        });

        $fuelTypeSelect.addEventListener('change', () => {
            settings.fuelType = $fuelTypeSelect.value;
            saveSettings();
        });

        $voiceToggle.addEventListener('change', () => {
            settings.voiceEnabled = $voiceToggle.checked;
            saveSettings();
        });

        $autoRerouteToggle.addEventListener('change', () => {
            settings.autoReroute = $autoRerouteToggle.checked;
            saveSettings();
        });

        $showSpeedToggle.addEventListener('change', () => {
            settings.showSpeed = $showSpeedToggle.checked;
            if (!settings.showSpeed) $speedDisplay.classList.add('hidden');
            saveSettings();
        });

        $avoidMotorwayToggle.addEventListener('change', () => {
            settings.avoidMotorway = $avoidMotorwayToggle.checked;
            saveSettings();
            if (destination && userPosition) calculateRoute();
        });

        $avoidTollToggle.addEventListener('change', () => {
            settings.avoidToll = $avoidTollToggle.checked;
            saveSettings();
            if (destination && userPosition) calculateRoute();
        });

        $avoidFerryToggle.addEventListener('change', () => {
            settings.avoidFerry = $avoidFerryToggle.checked;
            saveSettings();
            if (destination && userPosition) calculateRoute();
        });

        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (settings.theme === 'system') applySettings();
            });
        }
    }

    // ===== 10. MAP STYLES =====
    function changeMapStyle(style) {
        const tile = MAP_TILES[style] || MAP_TILES.standard;
        if (tileLayer) map.removeLayer(tileLayer);
        tileLayer = L.tileLayer(tile.url, {
            maxZoom: tile.maxZoom,
            attribution: tile.attr
        }).addTo(map);
    }

    // ===== VIEW SWITCHING =====
    function switchView(view) {
        currentView = view;
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        $mapView.classList.toggle('hidden', view !== 'map');
        $searchView.classList.toggle('hidden', view !== 'search');
        $settingsView.classList.toggle('hidden', view !== 'settings');
        $searchContainer.classList.toggle('hidden', view === 'settings');
        hideQuickPoiBar();
        if (view === 'map') setTimeout(() => map.invalidateSize(), 100);
        else if (view === 'search') { renderHistory(); renderFavorites(); }
    }

    function setupToolbar() {
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', () => switchView(btn.dataset.view));
        });
    }

    // ===== HISTORY =====
    function loadHistory() {
        try {
            const saved = localStorage.getItem(HISTORY_KEY);
            searchHistory = saved ? JSON.parse(saved) : [];
        } catch (e) { searchHistory = []; }
    }

    function saveHistory() {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory)); } catch (e) {}
    }

    function addToHistory(item) {
        searchHistory = searchHistory.filter(h => !(h.lat === item.lat && h.lon === item.lon));
        searchHistory.unshift({ name: item.name, address: item.address || '', lat: item.lat, lon: item.lon, timestamp: Date.now() });
        if (searchHistory.length > MAX_HISTORY) searchHistory = searchHistory.slice(0, MAX_HISTORY);
        saveHistory();
    }

    function renderHistory() {
        if (searchHistory.length === 0) { $historyList.innerHTML = ''; $historyEmpty.classList.remove('hidden'); return; }
        $historyEmpty.classList.add('hidden');
        $historyList.innerHTML = searchHistory.map((item, i) => `
            <div class="history-item" data-index="${i}">
                <div class="history-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
                <div class="history-text"><div class="history-name">${escapeHtml(item.name)}</div>${item.address ? `<div class="history-address">${escapeHtml(item.address)}</div>` : ''}</div>
            </div>
        `).join('');
        $historyList.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => {
                const item = searchHistory[parseInt(el.dataset.index)];
                if (item) { switchView('map'); $searchInput.value = item.name; $searchClear.classList.remove('hidden'); setDestination(item.lat, item.lon, item.name); addToHistory(item); }
            });
        });
    }

    function setupHistoryEvents() {
        $historyClearBtn.addEventListener('click', () => {
            if (confirm('Effacer tout l\'historique ?')) { searchHistory = []; saveHistory(); renderHistory(); }
        });
    }

    // ===== 6. FAVORITES (with delete) =====
    function loadFavorites() {
        try { const saved = localStorage.getItem(FAVORITES_KEY); favorites = saved ? JSON.parse(saved) : []; } catch (e) { favorites = []; }
    }

    function saveFavorites() {
        try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) {}
        syncToServer();
    }

    const FAV_ICONS = {
        home: '<path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
        work: '<rect x="2" y="7" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
        star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
        heart: '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="none" stroke="currentColor" stroke-width="1.5"/>'
    };

    function renderFavorites() {
        if (favorites.length === 0) {
            $favoritesList.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:14px;text-align:center;grid-column:1/-1">Aucun favori</div>';
            return;
        }
        $favoritesList.innerHTML = favorites.map((fav, i) => `
            <div class="favorite-item" data-index="${i}">
                <div class="favorite-icon"><svg viewBox="0 0 24 24">${FAV_ICONS[fav.icon] || FAV_ICONS.star}</svg></div>
                <div class="favorite-name">${escapeHtml(fav.name)}</div>
            </div>
        `).join('');
        $favoritesList.querySelectorAll('.favorite-item').forEach(el => {
            // Click -> navigate
            el.addEventListener('click', () => {
                const fav = favorites[parseInt(el.dataset.index)];
                if (fav) { switchView('map'); $searchInput.value = fav.name; $searchClear.classList.remove('hidden'); setDestination(fav.lat, fav.lon, fav.name); }
            });
            // 1. Long press -> delete
            let lpTimer = null;
            el.addEventListener('touchstart', (e) => {
                lpTimer = setTimeout(() => {
                    lpTimer = null;
                    const idx = parseInt(el.dataset.index);
                    const fav = favorites[idx];
                    if (fav && confirm(`Supprimer "${fav.name}" des favoris ?`)) {
                        favorites.splice(idx, 1);
                        saveFavorites();
                        renderFavorites();
                    }
                }, 600);
            }, { passive: true });
            el.addEventListener('touchend', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
            el.addEventListener('touchmove', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
        });
    }

    let selectedFavIcon = 'home';

    function setupFavoriteEvents() {
        $addFavoriteBtn.addEventListener('click', () => {
            if (!userPosition) { showToast('Position non disponible', 'error'); return; }
            $favoriteName.value = '';
            selectedFavIcon = 'home';
            document.querySelectorAll('.fav-icon-btn').forEach(b => b.classList.toggle('active', b.dataset.icon === 'home'));
            $favoriteModal.classList.remove('hidden');
        });
        $favoriteModalClose.addEventListener('click', () => $favoriteModal.classList.add('hidden'));
        $favoriteModal.addEventListener('click', (e) => { if (e.target === $favoriteModal) $favoriteModal.classList.add('hidden'); });
        document.querySelectorAll('.fav-icon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedFavIcon = btn.dataset.icon;
                document.querySelectorAll('.fav-icon-btn').forEach(b => b.classList.toggle('active', b === btn));
            });
        });
        $saveFavoriteBtn.addEventListener('click', () => {
            const name = $favoriteName.value.trim();
            if (!name) { showToast('Entrez un nom', 'error'); return; }
            if (!userPosition) return;
            favorites.push({ name, icon: selectedFavIcon, lat: userPosition.lat, lon: userPosition.lng });
            saveFavorites(); renderFavorites(); $favoriteModal.classList.add('hidden');
        });
    }

    // ===== 5. MULTI-STOPS / WAYPOINTS =====
    function setupWaypointEvents() {
        $addWaypointBtn.addEventListener('click', () => {
            addingWaypoint = true;
            $navPanel.classList.add('hidden');
            $searchInput.value = '';
            $searchInput.placeholder = 'Rechercher une etape...';
            $searchInput.focus();
        });
    }

    function addWaypoint(lat, lon, name) {
        waypoints.push({ lat, lon, name });
        const icon = L.divIcon({
            className: 'destination-marker',
            html: '<svg viewBox="0 0 24 36"><circle cx="12" cy="12" r="10" fill="#ff9f0a" stroke="white" stroke-width="3"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">' + waypoints.length + '</text></svg>',
            iconSize: [32, 40], iconAnchor: [16, 40]
        });
        const marker = L.marker([lat, lon], { icon }).addTo(map);
        waypointMarkers.push(marker);
        renderWaypoints();
        calculateRoute();
    }

    function removeWaypoint(index) {
        waypoints.splice(index, 1);
        if (waypointMarkers[index]) { map.removeLayer(waypointMarkers[index]); waypointMarkers.splice(index, 1); }
        renderWaypoints();
        if (destination) calculateRoute();
    }

    function renderWaypoints() {
        $waypointsList.innerHTML = waypoints.map((wp, i) => `
            <div class="waypoint-item" data-index="${i}" draggable="false">
                <div class="waypoint-drag" data-index="${i}">
                    <svg viewBox="0 0 16 16"><path d="M4 4h8M4 8h8M4 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </div>
                <div class="waypoint-dot"></div>
                <div class="waypoint-name">${escapeHtml(wp.name)}</div>
                <button class="waypoint-remove" data-index="${i}">&times;</button>
            </div>
        `).join('');
        $waypointsList.querySelectorAll('.waypoint-remove').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); removeWaypoint(parseInt(btn.dataset.index)); });
        });
        // 2. Setup drag to reorder
        setupWaypointDrag();
        renderWaypointsOptimizeBtn();
    }

    // ===== 2. DRAG TO REORDER WAYPOINTS =====
    let dragSrcIndex = null;

    function setupWaypointDrag() {
        const items = $waypointsList.querySelectorAll('.waypoint-item');
        items.forEach(item => {
            const handle = item.querySelector('.waypoint-drag');
            if (!handle) return;

            let startY = 0;
            let dragging = false;

            handle.addEventListener('touchstart', (e) => {
                e.preventDefault();
                dragSrcIndex = parseInt(item.dataset.index);
                startY = e.touches[0].clientY;
                dragging = true;
                item.classList.add('dragging');
            }, { passive: false });

            handle.addEventListener('touchmove', (e) => {
                if (!dragging) return;
                e.preventDefault();
                const touchY = e.touches[0].clientY;
                const allItems = $waypointsList.querySelectorAll('.waypoint-item');
                allItems.forEach(el => el.classList.remove('drag-over'));
                // Find which item we're over
                for (const el of allItems) {
                    const rect = el.getBoundingClientRect();
                    if (touchY >= rect.top && touchY <= rect.bottom) {
                        const targetIdx = parseInt(el.dataset.index);
                        if (targetIdx !== dragSrcIndex) el.classList.add('drag-over');
                        break;
                    }
                }
            }, { passive: false });

            handle.addEventListener('touchend', (e) => {
                if (!dragging) return;
                dragging = false;
                item.classList.remove('dragging');
                const allItems = $waypointsList.querySelectorAll('.waypoint-item');
                allItems.forEach(el => el.classList.remove('drag-over'));

                const touchY = e.changedTouches[0].clientY;
                let targetIndex = dragSrcIndex;
                for (const el of allItems) {
                    const rect = el.getBoundingClientRect();
                    if (touchY >= rect.top && touchY <= rect.bottom) {
                        targetIndex = parseInt(el.dataset.index);
                        break;
                    }
                }

                if (targetIndex !== dragSrcIndex && targetIndex >= 0 && targetIndex < waypoints.length) {
                    // Reorder waypoints
                    const [moved] = waypoints.splice(dragSrcIndex, 1);
                    waypoints.splice(targetIndex, 0, moved);
                    // Reorder markers
                    const [movedMarker] = waypointMarkers.splice(dragSrcIndex, 1);
                    waypointMarkers.splice(targetIndex, 0, movedMarker);
                    renderWaypoints();
                    if (destination) calculateRoute();
                }
                dragSrcIndex = null;
            });
        });
    }

    function clearWaypoints() {
        waypointMarkers.forEach(m => map.removeLayer(m));
        waypointMarkers = [];
        waypoints = [];
        renderWaypoints();
    }

    // ===== SHARE =====
    function setupShareEvents() {
        $navShareBtn.addEventListener('click', () => $shareModal.classList.remove('hidden'));
        $shareModalClose.addEventListener('click', () => $shareModal.classList.add('hidden'));
        $shareModal.addEventListener('click', (e) => { if (e.target === $shareModal) $shareModal.classList.add('hidden'); });
        $sharePositionBtn.addEventListener('click', () => {
            if (!userPosition) { showToast('Position non disponible', 'error'); return; }
            const url = `https://www.openstreetmap.org/?mlat=${userPosition.lat}&mlon=${userPosition.lng}#map=16/${userPosition.lat}/${userPosition.lng}`;
            shareContent('Ma position', url);
            $shareModal.classList.add('hidden');
        });
        $shareRouteBtn.addEventListener('click', () => {
            if (!userPosition || !destination) { showToast('Aucun itineraire actif', 'error'); return; }
            const url = `https://www.openstreetmap.org/directions?from=${userPosition.lat},${userPosition.lng}&to=${destination.lat},${destination.lon}`;
            shareContent('Mon itineraire MapsI', url);
            $shareModal.classList.add('hidden');
        });
    }

    function shareContent(title, url) {
        if (navigator.share) navigator.share({ title, url }).catch(() => {});
        else navigator.clipboard?.writeText(url).then(() => showToast('Lien copie !', 'success')).catch(() => showToast(url, 'info', 5000));
    }

    // ===== 12. POI + FUEL PRICES =====
    function setupPOIEvents() {
        $poiBtn.addEventListener('click', () => $poiPanel.classList.toggle('hidden'));
        $poiClose.addEventListener('click', () => { $poiPanel.classList.add('hidden'); clearPOIMarkers(); });
        document.querySelectorAll('.poi-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.poi-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (btn.dataset.cat === 'fuel') searchFuelWithPrices();
                else searchPOI(btn.dataset.cat);
            });
        });
    }

    const POI_QUERIES = { fuel: '[amenity=fuel]', restaurant: '[amenity=restaurant]', parking: '[amenity=parking]', pharmacy: '[amenity=pharmacy]', charging: '[amenity=charging_station]' };

    async function searchPOI(category) {
        if (!userPosition) { showToast('Position non disponible', 'error'); return; }
        $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Recherche...</div>';
        const query = POI_QUERIES[category];
        const overpassData = `[out:json][timeout:10];node${query}(around:${POI_RADIUS},${userPosition.lat},${userPosition.lng});out body 10;`;
        try {
            const resp = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(overpassData)}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            displayPOIResults(data.elements, category);
        } catch (err) {
            $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--danger)">Erreur de recherche</div>';
        }
    }

    async function searchFuelWithPrices() {
        if (!userPosition) { showToast('Position non disponible', 'error'); return; }
        $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Recherche des stations et prix...</div>';
        try {
            const fuelType = settings.fuelType;
            const lat = userPosition.lat;
            const lng = userPosition.lng;
            const url = `${FUEL_API}?limit=15&where=within_distance(geom,geom'POINT(${lng} ${lat})',${POI_RADIUS}m)&select=adresse,ville,prix,geom`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            displayFuelResults(data.results || [], fuelType);
        } catch (err) {
            searchPOI('fuel');
        }
    }

    function displayFuelResults(stations, fuelType) {
        clearPOIMarkers();
        if (!stations || stations.length === 0) {
            $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Aucune station a proximite</div>';
            return;
        }

        const results = stations.map(s => {
            const coords = s.geom;
            if (!coords) return null;
            const lat = coords.lat;
            const lon = coords.lon;
            const dist = haversine(userPosition.lat, userPosition.lng, lat, lon);
            let price = null;
            if (s.prix) {
                try {
                    const prixArr = typeof s.prix === 'string' ? JSON.parse(s.prix) : s.prix;
                    if (Array.isArray(prixArr)) {
                        const found = prixArr.find(p => p.nom === fuelType || p['@nom'] === fuelType);
                        if (found) price = parseFloat(found.valeur || found['@valeur']);
                    }
                } catch (e) {}
            }
            return { name: s.adresse || 'Station', ville: s.ville || '', lat, lon, dist, price };
        }).filter(Boolean).sort((a, b) => a.dist - b.dist);

        $poiResults.innerHTML = results.map((r, i) => `
            <div class="poi-item" data-index="${i}" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escapeHtml(r.name + ', ' + r.ville)}">
                <div class="poi-item-icon"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 22V6a2 2 0 012-2h8a2 2 0 012 2v16M3 22h12M15 10h2a2 2 0 012 2v5a2 2 0 002 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                <div class="poi-item-text">
                    <div class="poi-item-name">${escapeHtml(r.name)}</div>
                    <div class="poi-item-dist">${r.ville} - ${formatDistance(r.dist)}</div>
                </div>
                ${r.price ? `<span class="poi-item-price">${r.price.toFixed(3)} &euro;</span>` : ''}
            </div>
        `).join('');

        results.forEach(r => {
            const label = r.price ? `${r.price.toFixed(3)}€` : 'Station';
            const marker = L.circleMarker([r.lat, r.lon], { radius: 8, fillColor: '#ff9f0a', color: '#fff', weight: 2, fillOpacity: 0.9 }).bindPopup(label).addTo(map);
            poiMarkers.push(marker);
        });

        $poiResults.querySelectorAll('.poi-item').forEach(el => {
            el.addEventListener('click', () => {
                const lat = parseFloat(el.dataset.lat);
                const lon = parseFloat(el.dataset.lon);
                const name = el.dataset.name;
                $poiPanel.classList.add('hidden');
                setDestination(lat, lon, name);
                $searchInput.value = name;
                $searchClear.classList.remove('hidden');
                addToHistory({ name, address: '', lat, lon });
            });
        });
    }

    function displayPOIResults(elements, category) {
        clearPOIMarkers();
        if (!elements || elements.length === 0) {
            $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Aucun resultat</div>';
            return;
        }
        elements.forEach(el => { el._dist = haversine(userPosition.lat, userPosition.lng, el.lat, el.lon); });
        elements.sort((a, b) => a._dist - b._dist);
        $poiResults.innerHTML = elements.map((el, i) => {
            const name = el.tags?.name || category.charAt(0).toUpperCase() + category.slice(1);
            return `<div class="poi-item" data-lat="${el.lat}" data-lon="${el.lon}" data-name="${escapeHtml(name)}">
                <div class="poi-item-icon"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg></div>
                <div class="poi-item-text"><div class="poi-item-name">${escapeHtml(name)}</div><div class="poi-item-dist">${formatDistance(el._dist)}</div></div>
            </div>`;
        }).join('');
        elements.forEach(el => {
            const marker = L.circleMarker([el.lat, el.lon], { radius: 8, fillColor: '#ff9f0a', color: '#fff', weight: 2, fillOpacity: 0.9 }).bindPopup(el.tags?.name || category).addTo(map);
            poiMarkers.push(marker);
        });
        $poiResults.querySelectorAll('.poi-item').forEach(el => {
            el.addEventListener('click', () => {
                $poiPanel.classList.add('hidden');
                setDestination(parseFloat(el.dataset.lat), parseFloat(el.dataset.lon), el.dataset.name);
                $searchInput.value = el.dataset.name;
                $searchClear.classList.remove('hidden');
                addToHistory({ name: el.dataset.name, address: '', lat: parseFloat(el.dataset.lat), lon: parseFloat(el.dataset.lon) });
            });
        });
    }

    function clearPOIMarkers() {
        if (poiClusterGroup) { poiClusterGroup.clearLayers(); }
        poiMarkers.forEach(m => map.removeLayer(m));
        poiMarkers = [];
    }

    // ===== 12b. QUICK POI BAR =====
    function showQuickPoiBar() {
        if (addingWaypoint) return;
        $quickPoiBar.classList.remove('hidden');
    }

    function hideQuickPoiBar() {
        $quickPoiBar.classList.add('hidden');
    }

    function setupQuickPOIEvents() {
        document.querySelectorAll('.quick-poi-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                searchQuickPOI(btn.dataset.qpoi);
            });
        });
        $quickPoiPopupClose.addEventListener('click', closeQuickPoiPopup);
        $quickPoiPopup.addEventListener('click', (e) => {
            if (e.target === $quickPoiPopup) closeQuickPoiPopup();
        });
    }

    async function searchQuickPOI(category) {
        if (!userPosition) { showToast('Position non disponible', 'error'); return; }
        $searchInput.blur();
        hideQuickPoiBar();

        const titles = { fuel: 'Stations-service', parking: 'Parking', rest_area: 'Aires de repos', toilets: 'Toilettes publiques', charging: 'Bornes de recharge' };
        $quickPoiPopupTitle.textContent = titles[category] || category;
        $quickPoiPopupResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Recherche...</div>';
        $quickPoiPopup.classList.remove('hidden');

        if (category === 'fuel') await searchQuickFuel();
        else await searchQuickOverpass(category);
    }

    async function searchQuickFuel() {
        try {
            const fuelType = settings.fuelType;
            const lat = userPosition.lat;
            const lng = userPosition.lng;
            const url = `${FUEL_API}?limit=15&where=within_distance(geom,geom'POINT(${lng} ${lat})',${POI_RADIUS}m)&select=adresse,ville,prix,geom`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const stations = data.results || [];

            if (!stations || stations.length === 0) {
                $quickPoiPopupResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Aucune station a proximite</div>';
                return;
            }

            const results = stations.map(s => {
                const coords = s.geom;
                if (!coords) return null;
                const sLat = coords.lat, sLon = coords.lon;
                const dist = haversine(userPosition.lat, userPosition.lng, sLat, sLon);
                let price = null;
                if (s.prix) {
                    try {
                        const prixArr = typeof s.prix === 'string' ? JSON.parse(s.prix) : s.prix;
                        if (Array.isArray(prixArr)) {
                            const found = prixArr.find(p => p.nom === fuelType || p['@nom'] === fuelType);
                            if (found) price = parseFloat(found.valeur || found['@valeur']);
                        }
                    } catch (e) {}
                }
                return { name: s.adresse || 'Station', ville: s.ville || '', lat: sLat, lon: sLon, dist, price };
            }).filter(Boolean).sort((a, b) => a.dist - b.dist);

            renderQuickPoiResults(results, 'fuel');
        } catch (err) {
            await searchQuickOverpass('fuel_fallback');
        }
    }

    async function searchQuickOverpass(category) {
        const lat = userPosition.lat;
        const lng = userPosition.lng;
        const radius = category === 'rest_area' ? 15000 : POI_RADIUS;
        const queries = {
            parking: `[out:json][timeout:10];(node[amenity=parking](around:${radius},${lat},${lng});way[amenity=parking](around:${radius},${lat},${lng}););out body center 15;`,
            rest_area: `[out:json][timeout:10];(node[highway=rest_area](around:${radius},${lat},${lng});way[highway=rest_area](around:${radius},${lat},${lng});node[highway=services](around:${radius},${lat},${lng});way[highway=services](around:${radius},${lat},${lng}););out body center 15;`,
            toilets: `[out:json][timeout:10];(node[amenity=toilets](around:${radius},${lat},${lng});way[amenity=toilets](around:${radius},${lat},${lng}););out body center 15;`,
            fuel_fallback: `[out:json][timeout:10];node[amenity=fuel](around:${POI_RADIUS},${lat},${lng});out body 15;`,
            charging: `[out:json][timeout:10];(node[amenity=charging_station](around:${radius},${lat},${lng});way[amenity=charging_station](around:${radius},${lat},${lng}););out body center 15;`
        };
        const overpassData = queries[category];
        if (!overpassData) return;

        try {
            const resp = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(overpassData)}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const elements = data.elements || [];

            if (elements.length === 0) {
                $quickPoiPopupResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Aucun resultat a proximite</div>';
                return;
            }

            const results = elements.map(el => {
                const elLat = el.lat || el.center?.lat;
                const elLon = el.lon || el.center?.lon;
                if (!elLat || !elLon) return null;
                const dist = haversine(userPosition.lat, userPosition.lng, elLat, elLon);
                const name = el.tags?.name || getQuickPoiDefaultName(category);
                const extra = buildQuickPoiExtraInfo(el, category);
                return { name, lat: elLat, lon: elLon, dist, extra };
            }).filter(Boolean).sort((a, b) => a.dist - b.dist);

            renderQuickPoiResults(results, category);
        } catch (err) {
            $quickPoiPopupResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--danger)">Erreur de recherche</div>';
        }
    }

    function getQuickPoiDefaultName(category) {
        const defaults = { parking: 'Parking', rest_area: 'Aire de repos', toilets: 'Toilettes', fuel_fallback: 'Station-service', charging: 'Borne de recharge' };
        return defaults[category] || 'POI';
    }

    function buildQuickPoiExtraInfo(el, category) {
        const parts = [];
        if (category === 'parking') {
            if (el.tags?.fee === 'yes') parts.push('Payant');
            else if (el.tags?.fee === 'no') parts.push('Gratuit');
            if (el.tags?.capacity) parts.push(el.tags.capacity + ' places');
        } else if (category === 'rest_area') {
            if (el.tags?.toilets === 'yes') parts.push('WC');
            if (el.tags?.fuel === 'yes') parts.push('Carburant');
        } else if (category === 'toilets') {
            if (el.tags?.fee === 'yes') parts.push('Payant');
            else if (el.tags?.fee === 'no') parts.push('Gratuit');
            if (el.tags?.wheelchair === 'yes') parts.push('PMR');
        } else if (category === 'charging') {
            if (el.tags?.operator) parts.push(el.tags.operator);
            if (el.tags?.capacity) parts.push(el.tags.capacity + ' bornes');
            if (el.tags?.['socket:type2'] === 'yes') parts.push('Type 2');
            if (el.tags?.['socket:chademo'] === 'yes') parts.push('CHAdeMO');
            if (el.tags?.['socket:ccs'] === 'yes') parts.push('CCS');
        }
        return parts.join(' · ');
    }

    function renderQuickPoiResults(results, category) {
        const iconSvgs = {
            fuel: '<path d="M3 22V6a2 2 0 012-2h8a2 2 0 012 2v16M3 22h12M15 10h2a2 2 0 012 2v5a2 2 0 002 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
            fuel_fallback: '<path d="M3 22V6a2 2 0 012-2h8a2 2 0 012 2v16M3 22h12M15 10h2a2 2 0 012 2v5a2 2 0 002 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
            parking: '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 17V7h4a3 3 0 010 6H9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
            rest_area: '<path d="M4 20h3l2-4h6l2 4h3M6 16l2-6h8l2 6M9 6a3 3 0 106 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
            toilets: '<path d="M8 2v4M16 2v4M5 6h6v3a3 3 0 01-3 3H8a3 3 0 01-3-3V6zM13 6h6l-1 6h-4l-1-6zM8 12v10M16 12v10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
            charging: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
        };
        const icon = iconSvgs[category] || iconSvgs.parking;

        $quickPoiPopupResults.innerHTML = results.map(r => `
            <div class="poi-item" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escapeHtml(r.name)}">
                <div class="poi-item-icon"><svg viewBox="0 0 24 24" width="20" height="20">${icon}</svg></div>
                <div class="poi-item-text">
                    <div class="poi-item-name">${escapeHtml(r.name)}</div>
                    <div class="poi-item-dist">${r.extra ? escapeHtml(r.extra) + ' · ' : ''}${formatDistance(r.dist)}</div>
                </div>
                ${r.price ? `<span class="poi-item-price">${r.price.toFixed(3)} &euro;</span>` : ''}
            </div>
        `).join('');

        $quickPoiPopupResults.querySelectorAll('.poi-item').forEach(el => {
            el.addEventListener('click', () => {
                const lat = parseFloat(el.dataset.lat);
                const lon = parseFloat(el.dataset.lon);
                const name = el.dataset.name;
                closeQuickPoiPopup();
                setDestination(lat, lon, name);
                $searchInput.value = name;
                $searchClear.classList.remove('hidden');
                addToHistory({ name, address: '', lat, lon });
            });
        });
    }

    function closeQuickPoiPopup() {
        $quickPoiPopup.classList.add('hidden');
        $quickPoiPopupResults.innerHTML = '';
    }

    // ===== MAP INIT =====
    function initMap() {
        map = L.map('map', { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, zoomControl: false, attributionControl: true });
        const tile = MAP_TILES[settings.mapStyle] || MAP_TILES.standard;
        tileLayer = L.tileLayer(tile.url, { maxZoom: tile.maxZoom, attribution: tile.attr }).addTo(map);
        setTimeout(() => { applySettings(); map.invalidateSize(); }, 100);
        window.addEventListener('load', () => map.invalidateSize());
        setupMapEvents();
        autoLocateOnLoad();
    }

    function autoLocateOnLoad() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            pos => { updateUserPosition(pos); map.setView([pos.coords.latitude, pos.coords.longitude], 15); startWatchingPosition(); },
            () => {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
    }

    // ===== USER LOCATION =====
    function locateUser() {
        if (!navigator.geolocation) return;
        showLoading();
        navigator.geolocation.getCurrentPosition(
            pos => { hideLoading(); updateUserPosition(pos); map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.8 }); },
            err => { hideLoading(); if (err.code === 1 && !locationErrorShown) { locationErrorShown = true; showToast('Permission de localisation refusee', 'error'); } },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    }

    function startWatchingPosition() {
        if (watchId !== null || !navigator.geolocation) return;
        watchId = navigator.geolocation.watchPosition(pos => { updateUserPosition(pos); if (isNavigating) updateNavigation(pos); }, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 });
        isTracking = true; $locateBtn.classList.add('tracking');
    }

    function stopWatchingPosition() {
        if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        isTracking = false; $locateBtn.classList.remove('tracking');
    }

    function updateUserPosition(pos) {
        const lat = pos.coords.latitude, lng = pos.coords.longitude, speed = pos.coords.speed;
        const wasNavigating = userPosition ? userPosition._navIcon : false;
        userPosition = { lat, lng, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed };
        let displayLat = lat, displayLng = lng;
        if (isNavigating && routeData) {
            const snap = snapToRoute(lat, lng);
            if (snap) { displayLat = snap.lat; displayLng = snap.lng; }
        }
        if (!userMarker) {
            const icon = isNavigating ? createNavIcon() : createDotIcon();
            userMarker = L.marker([displayLat, displayLng], { icon, zIndexOffset: 1000 }).addTo(map);
            userPosition._navIcon = isNavigating;
        } else {
            userMarker.setLatLng([displayLat, displayLng]);
            if (isNavigating !== wasNavigating) {
                userMarker.setIcon(isNavigating ? createNavIcon() : createDotIcon());
                userPosition._navIcon = isNavigating;
            }
        }
        updateSpeedDisplay(speed);
        checkAutoNightMode();
    }

    function updateSpeedDisplay(speed) {
        if (!isNavigating || !settings.showSpeed) { $speedDisplay.classList.add('hidden'); return; }
        $speedDisplay.classList.remove('hidden');
        const kmh = (speed && speed > 0) ? Math.round(speed * 3.6) : 0;
        $speedValue.textContent = kmh;
        // 7. Speed limit warning
        if (currentSpeedLimit && kmh > currentSpeedLimit) {
            $speedValue.classList.add('speed-warning');
        } else {
            $speedValue.classList.remove('speed-warning');
        }
    }

    // ===== 7. SPEED LIMIT =====
    async function fetchSpeedLimit(lat, lng) {
        if (speedLimitTimeout) return;
        speedLimitTimeout = setTimeout(() => { speedLimitTimeout = null; }, 10000); // Query every 10s max
        try {
            const query = `[out:json][timeout:5];way(around:30,${lat},${lng})[maxspeed];out tags 1;`;
            const resp = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (data.elements && data.elements.length > 0) {
                const maxspeed = data.elements[0].tags?.maxspeed;
                if (maxspeed) {
                    const limit = parseInt(maxspeed);
                    if (!isNaN(limit)) {
                        currentSpeedLimit = limit;
                        $speedLimitValue.textContent = limit;
                        $speedLimit.classList.remove('hidden');
                        return;
                    }
                }
            }
            currentSpeedLimit = null;
            $speedLimit.classList.add('hidden');
        } catch (e) {
            currentSpeedLimit = null;
            $speedLimit.classList.add('hidden');
        }
    }

    function createDotIcon() {
        return L.divIcon({ className: '', html: '<div class="user-location-pulse"></div><div class="user-location-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
    }

    function createNavIcon() {
        return L.divIcon({ className: 'user-nav-marker', html: '<svg viewBox="0 0 48 48"><defs><filter id="ns" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/></filter></defs><path d="M24 6L38 34L24 25L10 34Z" fill="#0a84ff" filter="url(#ns)"/></svg>', iconSize: [48, 48], iconAnchor: [24, 24] });
    }

    function updateMapBearing(heading) {
        if (!isNavigating || heading == null || isNaN(heading)) return;
        const mapEl = map.getContainer();
        mapEl.style.transform = `rotate(${-heading}deg)`;
        mapEl.style.transformOrigin = 'center center';
        // Counter-rotate controls and markers so they stay upright
        const controls = mapEl.querySelector('.leaflet-control-container');
        if (controls) controls.style.transform = `rotate(${heading}deg)`;
        // Counter-rotate all markers so text/icons stay readable
        mapEl.querySelectorAll('.leaflet-marker-icon').forEach(m => {
            m.style.transform = (m.style.transform || '').replace(/rotate\([^)]*\)\s*/g, '') + ` rotate(${heading}deg)`;
        });
    }

    function resetMapBearing() {
        const mapEl = map.getContainer();
        mapEl.style.transform = '';
        mapEl.style.transformOrigin = '';
        const controls = mapEl.querySelector('.leaflet-control-container');
        if (controls) controls.style.transform = '';
        mapEl.querySelectorAll('.leaflet-marker-icon').forEach(m => {
            m.style.transform = (m.style.transform || '').replace(/rotate\([^)]*\)\s*/g, '');
        });
    }

    // ===== MAP EVENTS =====
    function setupMapEvents() {
        const mapEl = document.getElementById('map');
        mapEl.addEventListener('touchstart', handleTouchStart, { passive: false });
        mapEl.addEventListener('touchmove', handleTouchMove, { passive: true });
        mapEl.addEventListener('touchend', handleTouchEnd, { passive: true });
        mapEl.addEventListener('touchcancel', handleTouchEnd, { passive: true });
        map.on('click', () => { $searchResults.classList.add('hidden'); hideQuickPoiBar(); $searchInput.blur(); });
    }

    function handleTouchStart(e) {
        if (isNavigating || e.touches.length !== 1) return;
        const touch = e.touches[0]; longPressStartX = touch.clientX; longPressStartY = touch.clientY;
        longPressTimer = setTimeout(() => handleLongPress(touch.clientX, touch.clientY), LONG_PRESS_DURATION);
    }

    function handleTouchMove(e) {
        if (!longPressTimer) return;
        const touch = e.touches[0];
        if (Math.abs(touch.clientX - longPressStartX) > LONG_PRESS_MOVE_THRESHOLD || Math.abs(touch.clientY - longPressStartY) > LONG_PRESS_MOVE_THRESHOLD) {
            clearTimeout(longPressTimer); longPressTimer = null;
        }
    }

    function handleTouchEnd() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }

    function handleLongPress(clientX, clientY) {
        if (navigator.vibrate) navigator.vibrate(50);
        const latlng = map.layerPointToLatLng(map.containerPointToLayerPoint(L.point(clientX, clientY)));
        if (latlng) reverseGeocode(latlng.lat, latlng.lng);
    }

    // ===== SEARCH =====
    function debounceSearch(query) {
        clearTimeout(searchTimeout);
        if (!query || query.length < 2) { $searchResults.classList.add('hidden'); return; }
        searchTimeout = setTimeout(() => searchAddress(query), SEARCH_DEBOUNCE);
    }

    async function searchAddress(query) {
        try {
            const params = new URLSearchParams({ q: query, format: 'json', addressdetails: '1', limit: '8', 'accept-language': 'fr' });
            if (userPosition) { params.set('viewbox', `${userPosition.lng-1},${userPosition.lat+1},${userPosition.lng+1},${userPosition.lat-1}`); params.set('bounded', '0'); }
            const resp = await fetch(`${NOMINATIM_URL}/search?${params}`, { headers: { 'User-Agent': 'MapsI-PWA/3.0' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            displayResults(await resp.json());
        } catch (err) { console.error('Search error:', err); }
    }

    function displayResults(results) {
        if (!results || results.length === 0) {
            $searchResults.innerHTML = '<div style="padding:16px;color:var(--text-secondary);text-align:center">Aucun resultat</div>';
            $searchResults.classList.remove('hidden'); return;
        }
        $searchResults.innerHTML = results.map((r, i) => {
            const name = r.display_name.split(',')[0], address = r.display_name.split(',').slice(1, 3).join(',').trim();
            return `<div class="search-result-item" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escapeHtml(name)}" data-address="${escapeHtml(address)}">
                <svg class="result-pin" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="currentColor"/></svg>
                <div class="result-text"><div class="result-name">${escapeHtml(name)}</div><div class="result-address">${escapeHtml(address)}</div></div>
            </div>`;
        }).join('');
        $searchResults.classList.remove('hidden');
        $searchResults.querySelectorAll('.search-result-item').forEach(item => item.addEventListener('click', () => selectResult(item)));
    }

    function selectResult(item) {
        const lat = parseFloat(item.dataset.lat), lon = parseFloat(item.dataset.lon), name = item.dataset.name, address = item.dataset.address;
        $searchInput.value = name; $searchResults.classList.add('hidden'); $searchClear.classList.remove('hidden');
        addToHistory({ name, address, lat, lon });

        if (addingWaypoint) {
            addingWaypoint = false;
            $searchInput.placeholder = 'Rechercher une adresse...';
            switchView('map');
            addWaypoint(lat, lon, name);
        } else {
            switchView('map');
            setDestination(lat, lon, name);
        }
    }

    async function reverseGeocode(lat, lon) {
        showLoading();
        try {
            const resp = await fetch(`${NOMINATIM_URL}/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr`, { headers: { 'User-Agent': 'MapsI-PWA/3.0' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json(); hideLoading();
            const name = data.display_name?.split(',')[0] || 'Destination';
            const address = data.display_name?.split(',').slice(1, 3).join(',').trim() || '';
            addToHistory({ name, address, lat, lon });
            setDestination(lat, lon, name); $searchInput.value = name; $searchClear.classList.remove('hidden');
        } catch (err) { hideLoading(); setDestination(lat, lon, 'Destination'); }
    }

    // ===== DESTINATION =====
    function setDestination(lat, lon, name) {
        destination = { lat, lon, name };
        if (destMarker) map.removeLayer(destMarker);
        destMarker = L.marker([lat, lon], { icon: L.divIcon({ className: 'destination-marker', html: '<svg viewBox="0 0 28 40"><rect x="2" y="0" width="2.5" height="40" rx="1.25" fill="#888"/><rect x="4.5" y="2" width="5" height="4" fill="#333"/><rect x="9.5" y="2" width="5" height="4" fill="#fff"/><rect x="14.5" y="2" width="5" height="4" fill="#333"/><rect x="19.5" y="2" width="5" height="4" fill="#fff" rx="0 2 0 0"/><rect x="4.5" y="6" width="5" height="4" fill="#fff"/><rect x="9.5" y="6" width="5" height="4" fill="#333"/><rect x="14.5" y="6" width="5" height="4" fill="#fff"/><rect x="19.5" y="6" width="5" height="4" fill="#333"/><rect x="4.5" y="10" width="5" height="4" fill="#333"/><rect x="9.5" y="10" width="5" height="4" fill="#fff"/><rect x="14.5" y="10" width="5" height="4" fill="#333"/><rect x="19.5" y="10" width="5" height="4" fill="#fff"/><rect x="4.5" y="14" width="5" height="4" fill="#fff"/><rect x="9.5" y="14" width="5" height="4" fill="#333"/><rect x="14.5" y="14" width="5" height="4" fill="#fff"/><rect x="19.5" y="14" width="5" height="4" fill="#333" rx="0 0 2 0"/></svg>', iconSize: [28, 40], iconAnchor: [3, 40] }) }).addTo(map);
        map.flyTo([lat, lon], 15, { duration: 0.8 });
        if (userPosition) calculateRoute();
        else navigator.geolocation?.getCurrentPosition(pos => { updateUserPosition(pos); calculateRoute(); }, () => showToast('Activez la localisation', 'error'), { enableHighAccuracy: true, timeout: 5000 });
    }

    // ===== ROUTING (OSRM free public API) =====
    async function calculateRoute() {
        if (!userPosition || !destination) return;
        showLoading();
        const profile = transportMode === 'walking' ? 'foot' : transportMode === 'cycling' ? 'bike' : 'car';
        const coords = [];
        coords.push(`${userPosition.lng},${userPosition.lat}`);
        waypoints.forEach(wp => coords.push(`${wp.lon},${wp.lat}`));
        coords.push(`${destination.lon},${destination.lat}`);
        const coordStr = coords.join(';');
        const alternatives = waypoints.length === 0 ? 'true' : 'false';
        const exclude = [];
        if (settings.avoidMotorway) exclude.push('motorway');
        if (settings.avoidToll) exclude.push('toll');
        if (settings.avoidFerry) exclude.push('ferry');
        const excludeParam = exclude.length > 0 ? `&exclude=${exclude.join(',')}` : '';
        if (routeAbortController) routeAbortController.abort();
        routeAbortController = new AbortController();
        try {
            const url = `${OSRM_URL}/route/v1/${profile}/${coordStr}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}${excludeParam}`;
            const resp = await fetch(url, { signal: routeAbortController.signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json(); hideLoading();
            if (data.code !== 'Ok' || !data.routes?.length) { showToast('Impossible de calculer le trajet', 'error'); return; }
            allRoutes = data.routes.map(normalizeOSRMRoute); selectedRouteIndex = 0; selectRoute(0);
            if (!isNavigating) {
                const coords2 = allRoutes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                displayRouteAlternatives();
                showNavPanel();
                const navPanelHeight = $navPanel.offsetHeight || 200;
                const paddingBottom = navPanelHeight + 60 + 20;
                map.fitBounds(L.latLngBounds(coords2), {
                    paddingTopLeft: [40, 80],
                    paddingBottomRight: [40, paddingBottom]
                });
            }
            fetchElevationProfile(allRoutes[0].geometry.coordinates);
            // Notify native bridge
            notifyNative('routeCalculated', {
                distance: formatDistance(allRoutes[0].distance),
                duration: formatDuration(allRoutes[0].duration),
                eta: calculateETA(allRoutes[0].duration)
            });
        } catch (err) {
            if (err.name === 'AbortError') return;
            hideLoading(); showToast('Erreur de calcul du trajet', 'error'); console.warn('Route error:', err);
        }
    }

    function normalizeOSRMRoute(route) {
        const legs = route.legs.map(leg => ({
            steps: leg.steps.map(step => ({
                maneuver: {
                    type: step.maneuver.type,
                    modifier: step.maneuver.modifier || '',
                    location: step.maneuver.location
                },
                name: step.name || '',
                ref: step.ref || '',
                distance: step.distance,
                duration: step.duration
            })),
            distance: leg.distance,
            duration: leg.duration
        }));
        return {
            geometry: route.geometry,
            legs,
            distance: route.distance,
            duration: route.duration
        };
    }

    function selectRoute(index) {
        selectedRouteIndex = index;
        routeData = allRoutes[index]; lastMatchedSegmentIndex = 0; snappedPosition = null;
        // Flatten all legs' steps
        routeSteps = [];
        routeData.legs.forEach(leg => { routeSteps.push(...leg.steps); });
        currentStepIndex = 0;
        clearAltRouteLayers();
        if (routeLayer) map.removeLayer(routeLayer);
        if (routeShadowLayer) map.removeLayer(routeShadowLayer);
        allRoutes.forEach((route, i) => {
            if (i !== index) {
                const altLayer = L.geoJSON(route.geometry, { style: { color: '#888', weight: 4, opacity: 0.4, dashArray: '8,8' } }).addTo(map);
                altLayer.on('click', () => { selectRoute(i); displayRouteAlternatives(); showNavPanel(); });
                altRouteLayers.push(altLayer);
            }
        });
        drawRoute(routeData.geometry);
    }

    function clearAltRouteLayers() { altRouteLayers.forEach(l => map.removeLayer(l)); altRouteLayers = []; }

    function getRouteInfo(route) {
        const refs = new Set();
        let hasToll = false;
        route.legs.forEach(leg => {
            leg.steps.forEach(step => {
                if (step.ref) {
                    step.ref.split(';').forEach(r => {
                        const ref = r.trim();
                        if (ref) refs.add(ref);
                        if (/^A\d/.test(ref)) hasToll = true;
                    });
                }
            });
        });
        const sorted = [...refs].sort((a, b) => {
            const o = r => /^A/.test(r) ? 0 : /^N/.test(r) ? 1 : /^D/.test(r) ? 2 : 3;
            return o(a) - o(b);
        });
        return { via: sorted.length > 0 ? 'Via ' + sorted.slice(0, 3).join(', ') : '', hasToll };
    }

    function displayRouteAlternatives() {
        if (allRoutes.length <= 1) { $routeAlternatives.classList.add('hidden'); return; }
        $routeAlternatives.classList.remove('hidden');
        $routeAlternatives.innerHTML = allRoutes.map((route, i) => {
            const info = getRouteInfo(route);
            return `<div class="route-option ${i === selectedRouteIndex ? 'active' : ''}" data-route="${i}">
                <span class="route-time">${formatDuration(route.duration)}</span>
                <span class="route-dist">${formatDistance(route.distance)}</span>
                ${info.via ? `<span class="route-via">${escapeHtml(info.via)}</span>` : ''}
                ${info.hasToll ? '<span class="route-toll">Peage</span>' : ''}
            </div>`;
        }).join('');
        $routeAlternatives.querySelectorAll('.route-option').forEach(el => {
            el.addEventListener('click', () => { selectRoute(parseInt(el.dataset.route)); displayRouteAlternatives(); showNavPanel(); });
        });
    }

    function drawRoute(geometry) {
        if (routeLayer) map.removeLayer(routeLayer);
        if (routeShadowLayer) map.removeLayer(routeShadowLayer);
        routeShadowLayer = L.geoJSON(geometry, { style: { color: '#000', weight: 8, opacity: 0.15 } }).addTo(map);
        const color = transportMode === 'walking' ? '#30d158' : transportMode === 'cycling' ? '#ff9f0a' : '#0a84ff';
        routeLayer = L.geoJSON(geometry, { style: { color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' } }).addTo(map);
    }

    function showNavPanel() {
        if (isNavigating) return;
        $navDistance.textContent = formatDistance(routeData.distance);
        $navDuration.textContent = formatDuration(routeData.duration);
        $navEta.textContent = 'Arr. ' + calculateETA(routeData.duration);
        if (routeSteps.length > 0) $navStepText.textContent = translateManeuver(routeSteps[0].maneuver.type, routeSteps[0].maneuver.modifier, routeSteps[0].name);
        renderWaypoints();
        $transportModes.classList.remove('hidden');
        $navPanel.classList.remove('hidden');
    }

    function calculateETA(sec) {
        const d = new Date(Date.now() + sec * 1000);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    // ===== ACTIVE NAVIGATION =====
    function startNavigation() {
        isNavigating = true; currentStepIndex = 0; lastSpokenStep = -1; lastMatchedSegmentIndex = 0; snappedPosition = null;
        notifyNative('navigationStarted', {});
        notifyNative('requestAlwaysLocation', {});
        $navPanel.classList.add('hidden'); $transportModes.classList.add('hidden'); $routeAlternatives.classList.add('hidden');
        $activeNav.classList.remove('hidden'); $activeNavBottom.classList.remove('hidden'); $locateBtn.classList.add('nav-hidden');
        document.body.classList.add('navigating');
        clearAltRouteLayers();
        startWatchingPosition(); updateNavigationDisplay();
        if (userPosition) { map.setView([userPosition.lat, userPosition.lng], NAV_ZOOM); if (userMarker) userMarker.setIcon(createNavIcon()); userPosition._navIcon = true; updateMapBearing(userPosition.heading); }
        if (settings.showSpeed) $speedDisplay.classList.remove('hidden');
        if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {});
        speakStep(0);
        startTripRecording();
        if (settings.dashboardItems?.length) $navDashboard.classList.remove('hidden');
    }

    function stopNavigation() {
        isNavigating = false; lastMatchedSegmentIndex = 0; snappedPosition = null;
        notifyNative('navigationStopped', {});
        notifyNative('stopBackgroundLocation', {});
        resetMapBearing();
        $activeNav.classList.add('hidden'); $activeNavBottom.classList.add('hidden'); $speedDisplay.classList.add('hidden'); $speedLimit.classList.add('hidden');
        $elevationProfile.classList.add('hidden');
        $locateBtn.classList.remove('nav-hidden');
        document.body.classList.remove('navigating');
        stopWatchingPosition();
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        if (routeShadowLayer) { map.removeLayer(routeShadowLayer); routeShadowLayer = null; }
        if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
        clearAltRouteLayers(); clearPOIMarkers(); clearWaypoints();
        if (userMarker && userPosition) { userMarker.setIcon(createDotIcon()); userPosition._navIcon = false; }
        if (userPosition) map.setView([userPosition.lat, userPosition.lng], 15);
        $transportModes.classList.add('hidden'); $searchInput.value = ''; $searchClear.classList.add('hidden');
        destination = null; routeData = null; routeSteps = []; allRoutes = []; currentSpeedLimit = null;
        if (rerouteTimeout) { clearTimeout(rerouteTimeout); rerouteTimeout = null; }
        stopTripRecording();
        clearRadarMarkers();
        if (radarQueryTimeout) { clearTimeout(radarQueryTimeout); radarQueryTimeout = null; }
        $navDashboard.classList.add('hidden');
    }

    function updateNavigation(pos) {
        if (!routeSteps.length) return;
        const userLat = pos.coords.latitude, userLng = pos.coords.longitude;
        const step = routeSteps[currentStepIndex]; if (!step) return;
        const stepEnd = step.maneuver.location;
        const dist = haversine(userLat, userLng, stepEnd[1], stepEnd[0]);
        if (dist < 30 && currentStepIndex < routeSteps.length - 1) {
            currentStepIndex++; updateNavigationDisplay();
            if (navigator.vibrate) navigator.vibrate(100);
            speakStep(currentStepIndex);
        }
        const nextStep = routeSteps[currentStepIndex];
        const dispLat = snappedPosition ? snappedPosition.lat : userLat;
        const dispLng = snappedPosition ? snappedPosition.lng : userLng;
        if (nextStep) $activeNavDistance.textContent = formatDistance(haversine(dispLat, dispLng, nextStep.maneuver.location[1], nextStep.maneuver.location[0]));
        updateRemainingInfo(dispLat, dispLng);
        map.setView([dispLat, dispLng], NAV_ZOOM, { animate: true, duration: 0.5 });
        const heading = (snappedPosition && snappedPosition.bearing != null) ? snappedPosition.bearing : pos.coords.heading;
        updateMapBearing(heading);
        if (settings.autoReroute) checkOffRoute(userLat, userLng);
        // 7. Speed limit
        fetchSpeedLimit(userLat, userLng);
        // 8. Radar alerts
        if (settings.radarAlerts) fetchRadarsNearby(userLat, userLng);
        // 9. Dashboard
        updateDashboard(pos);
        // 10. Trip recording
        recordTripPoint(pos);
        // Check arrival
        const destDist = haversine(userLat, userLng, destination.lat, destination.lon);
        if (destDist < 30) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            speak('Vous etes arrive a destination');
            showToast('Vous etes arrive !', 'success', 5000);
            stopNavigation();
        }
    }

    function updateRemainingInfo(userLat, userLng) {
        let remainDist = 0, remainTime = 0;
        for (let i = currentStepIndex; i < routeSteps.length; i++) { remainDist += routeSteps[i].distance; remainTime += routeSteps[i].duration; }
        $remainingDistance.textContent = formatDistance(remainDist);
        $remainingTime.textContent = formatDuration(remainTime);
        $etaTime.textContent = calculateETA(remainTime);
    }

    function checkOffRoute(userLat, userLng) {
        if (!routeData?.geometry) return;
        const coords = routeData.geometry.coordinates;
        let minDist = Infinity;
        for (let i = 0; i < coords.length; i += 3) { const d = haversine(userLat, userLng, coords[i][1], coords[i][0]); if (d < minDist) minDist = d; }
        if (minDist > REROUTE_THRESHOLD) {
            if (!rerouteTimeout) {
                rerouteTimeout = setTimeout(() => {
                    rerouteTimeout = null; speak('Recalcul de l\'itineraire');
                    calculateRoute().then(() => { if (isNavigating) updateNavigationDisplay(); });
                }, 2000);
            }
        } else if (rerouteTimeout) { clearTimeout(rerouteTimeout); rerouteTimeout = null; }
    }

    function updateNavigationDisplay() {
        const step = routeSteps[currentStepIndex]; if (!step) return;
        $activeNavIcon.innerHTML = getManeuverSVG(step.maneuver.type, step.maneuver.modifier);
        $activeNavStreet.textContent = step.name || 'Route';
        $activeNavDistance.textContent = formatDistance(step.distance);
        // Push to CarPlay
        notifyNative('navigationUpdate', {
            instruction: translateManeuver(step.maneuver.type, step.maneuver.modifier, step.name),
            distance: formatDistance(step.distance),
            street: step.name || 'Route',
            maneuverType: step.maneuver.type + (step.maneuver.modifier ? '-' + step.maneuver.modifier : ''),
            remainingDistance: $remainingDistance?.textContent || '',
            remainingTime: $remainingTime?.textContent || '',
            eta: $etaTime?.textContent || '',
            speed: parseInt($speedValue?.textContent) || 0
        });
    }

    function getManeuverSVG(type, modifier) {
        let path = '';
        if (type === 'arrive') path = '<circle cx="12" cy="12" r="4" fill="white"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="white" stroke-width="2.5" stroke-linecap="round"/>';
        else if (type === 'depart') path = '<path d="M12 19V5M12 5l-5 5M12 5l5 5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        else if (type === 'roundabout' || type === 'rotary') path = '<circle cx="12" cy="12" r="5" fill="none" stroke="white" stroke-width="2.5"/><path d="M12 7V3M12 3l-2 2M12 3l2 2" stroke="white" stroke-width="2" stroke-linecap="round"/>';
        else if (modifier?.includes('sharp left') || modifier?.includes('uturn')) path = '<path d="M18 18V9a5 5 0 00-10 0v1M8 6L4 10l4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        else if (modifier?.includes('left')) path = '<path d="M18 18v-7a3 3 0 00-3-3H7M7 8L3 12l4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        else if (modifier?.includes('sharp right')) path = '<path d="M6 18V9a5 5 0 0110 0v1M16 6l4 4-4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        else if (modifier?.includes('right')) path = '<path d="M6 18v-7a3 3 0 013-3h10M17 8l4 4-4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        else path = '<path d="M12 19V5M12 5l-4 4M12 5l4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        return `<div class="maneuver-icon"><svg viewBox="0 0 24 24">${path}</svg></div>`;
    }

    // ===== VOICE =====
    function speakStep(stepIndex) {
        if (!settings.voiceEnabled || stepIndex === lastSpokenStep) return;
        lastSpokenStep = stepIndex;
        const step = routeSteps[stepIndex]; if (!step) return;
        speak(translateManeuver(step.maneuver.type, step.maneuver.modifier, step.name));
    }

    function speak(text) {
        if (!settings.voiceEnabled || !('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = 1.0;
        window.speechSynthesis.speak(u);
    }

    function selectTransportMode(mode) {
        transportMode = mode;
        document.querySelectorAll('.transport-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
        if (destination && userPosition) calculateRoute();
    }

    // ===== 12. ELEVATION PROFILE =====
    async function fetchElevationProfile(routeCoords) {
        if (!routeCoords || routeCoords.length < 2) { $elevationProfile.classList.add('hidden'); return; }
        // Sample ~40 points along the route
        const sampleCount = Math.min(40, routeCoords.length);
        const step = Math.max(1, Math.floor(routeCoords.length / sampleCount));
        const sampled = [];
        for (let i = 0; i < routeCoords.length; i += step) sampled.push(routeCoords[i]);
        if (sampled[sampled.length - 1] !== routeCoords[routeCoords.length - 1]) sampled.push(routeCoords[routeCoords.length - 1]);

        const locations = sampled.map(c => `${c[1]},${c[0]}`).join('|');
        try {
            const resp = await fetch(`https://api.opentopodata.org/v1/mapzen?locations=${locations}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (data.status === 'OK' && data.results) {
                const elevations = data.results.map(r => r.elevation ?? 0);
                drawElevationProfile(elevations);
            } else {
                $elevationProfile.classList.add('hidden');
            }
        } catch (e) {
            $elevationProfile.classList.add('hidden');
        }
    }

    function drawElevationProfile(elevations) {
        if (!elevations || elevations.length < 2) { $elevationProfile.classList.add('hidden'); return; }
        $elevationProfile.classList.remove('hidden');

        const canvas = $elevationCanvas;
        const ctx = canvas.getContext('2d');
        // Set canvas size to actual display size
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * (window.devicePixelRatio || 1);
        canvas.height = rect.height * (window.devicePixelRatio || 1);
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        const w = rect.width;
        const h = rect.height;

        const minElev = Math.min(...elevations);
        const maxElev = Math.max(...elevations);
        const range = Math.max(maxElev - minElev, 1);

        // Calculate total ascent/descent
        let totalAscent = 0, totalDescent = 0;
        for (let i = 1; i < elevations.length; i++) {
            const diff = elevations[i] - elevations[i - 1];
            if (diff > 0) totalAscent += diff;
            else totalDescent += Math.abs(diff);
        }
        $elevationInfo.textContent = `↑ ${Math.round(totalAscent)}m  ↓ ${Math.round(totalDescent)}m`;

        // Draw filled area
        ctx.clearRect(0, 0, w, h);
        const padding = 4;
        const graphW = w - padding * 2;
        const graphH = h - padding * 2;

        ctx.beginPath();
        ctx.moveTo(padding, h - padding);
        elevations.forEach((elev, i) => {
            const x = padding + (i / (elevations.length - 1)) * graphW;
            const y = h - padding - ((elev - minElev) / range) * graphH;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(padding + graphW, h - padding);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, padding, 0, h - padding);
        gradient.addColorStop(0, 'rgba(10, 132, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(10, 132, 255, 0.05)');
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw line
        ctx.beginPath();
        elevations.forEach((elev, i) => {
            const x = padding + (i / (elevations.length - 1)) * graphW;
            const y = h - padding - ((elev - minElev) / range) * graphH;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#0a84ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Labels
        ctx.fillStyle = isDarkMode() ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(maxElev)}m`, padding + 2, padding + 10);
        ctx.fillText(`${Math.round(minElev)}m`, padding + 2, h - padding - 2);
    }

    // ===== 11. PARKING NEAR DESTINATION =====
    function setupParkingEvents() {
        $navParkingBtn.addEventListener('click', () => searchParkingNearDest());
    }

    async function searchParkingNearDest() {
        if (!destination) { showToast('Aucune destination definie', 'error'); return; }
        showLoading();
        const query = `[out:json][timeout:10];node[amenity=parking](around:1500,${destination.lat},${destination.lon});out body 15;`;
        try {
            const resp = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            hideLoading();
            if (!data.elements || data.elements.length === 0) {
                showToast('Aucun parking pres de la destination', 'info');
                return;
            }
            // Show parking markers on map
            clearPOIMarkers();
            data.elements.forEach(el => {
                el._dist = haversine(destination.lat, destination.lon, el.lat, el.lon);
            });
            data.elements.sort((a, b) => a._dist - b._dist);

            data.elements.forEach(el => {
                const name = el.tags?.name || 'Parking';
                const fee = el.tags?.fee === 'yes' ? ' (payant)' : el.tags?.fee === 'no' ? ' (gratuit)' : '';
                const capacity = el.tags?.capacity ? ` - ${el.tags.capacity} places` : '';
                const marker = L.circleMarker([el.lat, el.lon], {
                    radius: 10, fillColor: '#5856d6', color: '#fff', weight: 2, fillOpacity: 0.9
                }).bindPopup(`<b>${name}</b>${fee}${capacity}<br>${formatDistance(el._dist)} de la destination`).addTo(map);
                poiMarkers.push(marker);
            });

            // Open first parking popup
            if (poiMarkers.length > 0) poiMarkers[0].openPopup();
            // Fit bounds to show destination + parkings
            const bounds = L.latLngBounds([[destination.lat, destination.lon]]);
            data.elements.slice(0, 5).forEach(el => bounds.extend([el.lat, el.lon]));
            map.fitBounds(bounds, { padding: [60, 60] });
        } catch (e) {
            hideLoading();
            showToast('Erreur lors de la recherche de parkings', 'error');
        }
    }

    // ===== OSRM ROUTE INFO (replaces Valhalla normalization) =====
    // OSRM responses are already in a compatible format via normalizeOSRMRoute above

    // ===== HELPERS =====
    function formatDistance(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'; }
    function formatDuration(s) { if (s < 60) return '< 1 min'; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h > 0 ? h + ' h ' + m + ' min' : m + ' min'; }
    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    // ===== SNAP-TO-ROUTE =====
    function projectPointOnSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
        const cosLat = Math.cos(aLat * Math.PI / 180);
        const mPerDegLat = 110540, mPerDegLon = 111320 * cosLat;
        const abLat = (bLat - aLat) * mPerDegLat, abLon = (bLon - aLon) * mPerDegLon;
        const apLat = (pLat - aLat) * mPerDegLat, apLon = (pLon - aLon) * mPerDegLon;
        const abDotAb = abLat * abLat + abLon * abLon;
        if (abDotAb < 1e-10) return { lat: aLat, lon: aLon, t: 0, distMeters: Math.sqrt(apLat * apLat + apLon * apLon) };
        let t = (apLat * abLat + apLon * abLon) / abDotAb;
        t = Math.max(0, Math.min(1, t));
        const projLat = t * abLat, projLon = t * abLon;
        const dLat = apLat - projLat, dLon = apLon - projLon;
        return { lat: aLat + projLat / mPerDegLat, lon: aLon + projLon / mPerDegLon, t, distMeters: Math.sqrt(dLat * dLat + dLon * dLon) };
    }

    function calculateSegmentBearing(lat1, lon1, lat2, lon2) {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const lat1R = lat1 * Math.PI / 180, lat2R = lat2 * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2R);
        const x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function snapToRoute(userLat, userLon) {
        if (!routeData?.geometry?.coordinates) return null;
        const coords = routeData.geometry.coordinates;
        if (coords.length < 2) return null;
        let bestDist = Infinity, bestResult = null, bestIdx = lastMatchedSegmentIndex;
        const startIdx = Math.max(0, lastMatchedSegmentIndex - 10);
        const endIdx = Math.min(coords.length - 1, lastMatchedSegmentIndex + 50);
        for (let i = startIdx; i < endIdx; i++) {
            const proj = projectPointOnSegment(userLat, userLon, coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
            if (proj.distMeters < bestDist) { bestDist = proj.distMeters; bestResult = proj; bestIdx = i; }
        }
        if (bestDist > REROUTE_THRESHOLD) {
            for (let i = 0; i < coords.length - 1; i++) {
                if (i >= startIdx && i < endIdx) continue;
                const proj = projectPointOnSegment(userLat, userLon, coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
                if (proj.distMeters < bestDist) { bestDist = proj.distMeters; bestResult = proj; bestIdx = i; }
            }
        }
        if (bestDist > REROUTE_THRESHOLD || !bestResult) { snappedPosition = null; return null; }
        lastMatchedSegmentIndex = bestIdx;
        const bearing = calculateSegmentBearing(coords[bestIdx][1], coords[bestIdx][0], coords[bestIdx + 1][1], coords[bestIdx + 1][0]);
        snappedPosition = { lat: bestResult.lat, lng: bestResult.lon, bearing };
        return snappedPosition;
    }

    function translateManeuver(type, modifier, street) {
        const name = street || 'la route';
        const turns = { 'turn-left': 'Tournez a gauche', 'turn-right': 'Tournez a droite', 'turn-slight left': 'Legere gauche', 'turn-slight right': 'Legere droite', 'turn-sharp left': 'Tournez fortement a gauche', 'turn-sharp right': 'Tournez fortement a droite', 'continue-': 'Continuez tout droit', 'depart-': 'Depart', 'arrive-': 'Vous etes arrive', 'roundabout-': 'Au rond-point', 'merge-': 'Rejoignez', 'fork-left': 'Prenez a gauche', 'fork-right': 'Prenez a droite' };
        const key = type + '-' + (modifier || '');
        return `${turns[key] || turns[type + '-'] || 'Continuez'} sur ${name}`;
    }
    function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
    function showLoading() { $loading.classList.remove('hidden'); }
    function hideLoading() { $loading.classList.add('hidden'); }

    // ===== MARKER CLUSTERING =====
    function initPoiClusterGroup() {
        if (typeof L.markerClusterGroup === 'function') {
            poiClusterGroup = L.markerClusterGroup({ maxClusterRadius: 50 });
            map.addLayer(poiClusterGroup);
        }
    }

    function addPoiMarker(marker) {
        if (poiClusterGroup) poiClusterGroup.addLayer(marker);
        else marker.addTo(map);
        poiMarkers.push(marker);
    }

    // ===== 1. ISOCHRONES =====
    function setupIsochroneEvents() {
        if (!$isochroneBtn) return;
        $isochroneBtn.addEventListener('click', () => {
            if (!userPosition) { showToast('Activez la localisation', 'error'); return; }
            $isochroneModal.classList.remove('hidden');
        });
        $isochroneModalClose.addEventListener('click', () => $isochroneModal.classList.add('hidden'));
        $isochroneModal.addEventListener('click', e => { if (e.target === $isochroneModal) $isochroneModal.classList.add('hidden'); });
        document.querySelectorAll('.iso-time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.iso-time-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        document.querySelectorAll('.iso-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.iso-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        $isochroneCalcBtn.addEventListener('click', calculateIsochrone);
    }

    async function calculateIsochrone() {
        if (!userPosition) return;
        const activeTimes = document.querySelectorAll('.iso-time-btn.active');
        const activeMode = document.querySelector('.iso-mode-btn.active');
        const times = [];
        activeTimes.forEach(btn => times.push(parseInt(btn.dataset.minutes)));
        if (times.length === 0) times.push(15);
        const mode = activeMode?.dataset.mode || 'auto';
        const profile = mode === 'pedestrian' ? 'foot' : mode === 'bicycle' ? 'bike' : 'car';
        showLoading();
        $isochroneModal.classList.add('hidden');
        try {
            // Approximate isochrone by sending radial routes
            const maxTime = Math.max(...times);
            const avgSpeed = profile === 'car' ? 50 : profile === 'bike' ? 15 : 5; // km/h approx
            const radiusKm = (avgSpeed * maxTime) / 60;
            const numDirections = 16;
            const destPoints = [];
            for (let i = 0; i < numDirections; i++) {
                const angle = (i / numDirections) * 2 * Math.PI;
                const dLat = (radiusKm / 111) * Math.cos(angle);
                const dLon = (radiusKm / (111 * Math.cos(userPosition.lat * Math.PI / 180))) * Math.sin(angle);
                destPoints.push([userPosition.lng + dLon, userPosition.lat + dLat]);
            }
            // Fetch routes to radial points
            const reachable = [];
            const promises = destPoints.map(async (pt) => {
                try {
                    const url = `${OSRM_URL}/route/v1/${profile}/${userPosition.lng},${userPosition.lat};${pt[0]},${pt[1]}?overview=full&geometries=geojson`;
                    const resp = await fetch(url);
                    if (!resp.ok) return;
                    const data = await resp.json();
                    if (data.code === 'Ok' && data.routes?.[0]) {
                        const route = data.routes[0];
                        const durationMin = route.duration / 60;
                        // Find the furthest point within each time contour
                        const coords = route.geometry.coordinates;
                        times.forEach(t => {
                            if (durationMin <= t) {
                                reachable.push({ time: t, coord: coords[coords.length - 1] });
                            } else {
                                const ratio = t / durationMin;
                                const idx = Math.floor(coords.length * ratio);
                                if (coords[idx]) reachable.push({ time: t, coord: coords[idx] });
                            }
                        });
                    }
                } catch (e) { /* skip */ }
            });
            await Promise.all(promises);
            hideLoading();
            if (reachable.length === 0) { showToast('Erreur isochrone', 'error'); return; }
            if (isochroneLayer) { map.removeLayer(isochroneLayer); isochroneLayer = null; }
            const colors = ['rgba(48,209,88,0.3)', 'rgba(255,159,10,0.3)', 'rgba(255,69,58,0.3)'];
            const borderColors = ['rgba(48,209,88,0.8)', 'rgba(255,159,10,0.8)', 'rgba(255,69,58,0.8)'];
            const features = [];
            times.forEach((t, ti) => {
                const pts = reachable.filter(r => r.time === t).map(r => r.coord);
                if (pts.length < 3) return;
                // Close the polygon
                pts.push(pts[0]);
                features.push({
                    type: 'Feature',
                    properties: { contour: t },
                    geometry: { type: 'Polygon', coordinates: [pts] }
                });
            });
            const geojson = { type: 'FeatureCollection', features };
            isochroneLayer = L.geoJSON(geojson, {
                style: (feature) => {
                    const idx = times.indexOf(feature.properties?.contour);
                    return { fillColor: colors[idx] || colors[0], color: borderColors[idx] || borderColors[0], weight: 2, fillOpacity: 0.3 };
                }
            }).addTo(map);
            map.fitBounds(isochroneLayer.getBounds(), { padding: [40, 40] });
        } catch (e) {
            hideLoading();
            showToast('Erreur isochrone', 'error');
        }
    }

    // ===== 2. GPX EXPORT/IMPORT =====
    function setupGPXEvents() {
        if (!$navGpxBtn) return;
        $navGpxBtn.addEventListener('click', () => $gpxModal.classList.remove('hidden'));
        $gpxModalClose.addEventListener('click', () => $gpxModal.classList.add('hidden'));
        $gpxModal.addEventListener('click', e => { if (e.target === $gpxModal) $gpxModal.classList.add('hidden'); });
        $gpxExportBtn.addEventListener('click', exportGPX);
        $gpxImportBtn.addEventListener('click', () => { $gpxModal.classList.add('hidden'); $gpxImportInput.click(); });
        $gpxImportInput.addEventListener('change', importGPX);
    }

    function exportGPX() {
        if (!routeData?.geometry?.coordinates) { showToast('Aucun itineraire a exporter', 'error'); return; }
        const coords = routeData.geometry.coordinates;
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="MapsI">\n  <trk>\n    <name>Itineraire MapsI</name>\n    <trkseg>\n`;
        coords.forEach(c => { gpx += `      <trkpt lat="${c[1]}" lon="${c[0]}"></trkpt>\n`; });
        gpx += `    </trkseg>\n  </trk>\n</gpx>`;
        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'mapsi-route.gpx'; a.click();
        URL.revokeObjectURL(url);
        $gpxModal.classList.add('hidden');
        showToast('GPX exporte', 'success');
    }

    function importGPX(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(ev.target.result, 'text/xml');
                const trkpts = doc.querySelectorAll('trkpt');
                if (trkpts.length === 0) { showToast('Aucun point dans le GPX', 'error'); return; }
                const coords = [];
                trkpts.forEach(pt => coords.push([parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))]));
                if (gpxImportLayer) map.removeLayer(gpxImportLayer);
                gpxImportLayer = L.polyline(coords, { color: '#ff9f0a', weight: 4, dashArray: '8,4' }).addTo(map);
                map.fitBounds(gpxImportLayer.getBounds(), { padding: [40, 40] });
                showToast(`${trkpts.length} points importes`, 'success');
            } catch (err) { showToast('Erreur lecture GPX', 'error'); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // ===== 3. WAYPOINT OPTIMIZATION =====
    function renderWaypointsOptimizeBtn() {
        if ($optimizeWaypointsBtn) {
            $optimizeWaypointsBtn.classList.toggle('hidden', waypoints.length < 2);
        }
    }

    async function optimizeWaypointOrder() {
        if (waypoints.length < 2 || !userPosition || !destination) return;
        showLoading();
        const profile = transportMode === 'walking' ? 'foot' : transportMode === 'cycling' ? 'bike' : 'car';
        const coords = [];
        coords.push(`${userPosition.lng},${userPosition.lat}`);
        waypoints.forEach(wp => coords.push(`${wp.lon},${wp.lat}`));
        coords.push(`${destination.lon},${destination.lat}`);
        try {
            const url = `${OSRM_URL}/table/v1/${profile}/${coords.join(';')}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (data.code !== 'Ok') throw new Error('OSRM table error');
            const matrix = data.durations;
            const n = waypoints.length;
            // Nearest-neighbor heuristic (indices 1..n, start=0, end=n+1)
            const visited = new Set();
            const order = [];
            let current = 0;
            for (let step = 0; step < n; step++) {
                let bestDist = Infinity, bestIdx = -1;
                for (let j = 1; j <= n; j++) {
                    if (visited.has(j)) continue;
                    const d = matrix[current]?.[j] ?? Infinity;
                    if (d < bestDist) { bestDist = d; bestIdx = j; }
                }
                if (bestIdx === -1) break;
                visited.add(bestIdx);
                order.push(bestIdx - 1);
                current = bestIdx;
            }
            waypoints = order.map(i => waypoints[i]);
            hideLoading();
            calculateRoute();
            showToast('Ordre optimise', 'success');
        } catch (e) {
            hideLoading();
            showToast('Erreur optimisation', 'error');
        }
    }

    // ===== 4. AUTO NIGHT MODE (SunCalc) =====
    function getSunTimes(date, lat, lng) {
        const RAD = Math.PI / 180, DEG = 180 / Math.PI;
        const daysSince2000 = (date.getTime() / 86400000) - 10957.5;
        const M = (357.5291 + 0.98560028 * daysSince2000) * RAD;
        const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
        const L = (M * DEG + 102.9372 + C * DEG + 180) % 360 * RAD;
        const decl = Math.asin(Math.sin(L) * Math.sin(23.4393 * RAD));
        const Jnoon = 2451545 + daysSince2000 + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L) - lng / 360;
        const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl));
        if (cosH > 1 || cosH < -1) return { sunrise: null, sunset: null };
        const H = Math.acos(cosH) * DEG / 360;
        const sunriseJD = Jnoon - H;
        const sunsetJD = Jnoon + H;
        const jdToDate = jd => new Date((jd - 2440587.5) * 86400000);
        return { sunrise: jdToDate(sunriseJD), sunset: jdToDate(sunsetJD) };
    }

    function checkAutoNightMode() {
        if (!settings.autoNightMap || !userPosition) return;
        const now = new Date();
        const sun = getSunTimes(now, userPosition.lat, userPosition.lng);
        if (!sun.sunrise || !sun.sunset) return;
        const isNight = now < sun.sunrise || now > sun.sunset;
        if (isNight && settings.mapStyle !== 'sombre') {
            previousMapStyle = settings.mapStyle;
            settings.mapStyle = 'sombre';
            changeMapStyle('sombre');
            if ($mapStyleSelect) $mapStyleSelect.value = 'sombre';
        } else if (!isNight && previousMapStyle && settings.mapStyle === 'sombre') {
            settings.mapStyle = previousMapStyle;
            changeMapStyle(previousMapStyle);
            if ($mapStyleSelect) $mapStyleSelect.value = previousMapStyle;
            previousMapStyle = null;
        }
    }

    // ===== 5. TRIP HISTORY (IndexedDB) =====
    function setupTripsDB() {
        if (!window.indexedDB) return;
        const req = indexedDB.open(TRIPS_DB, 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(TRIPS_STORE)) {
                db.createObjectStore(TRIPS_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = e => { tripsDb = e.target.result; renderTrips(); };
        req.onerror = () => {};
    }

    function startTripRecording() {
        if (!tripsDb) return;
        tripRecording = {
            startTime: Date.now(),
            from: userPosition ? `${userPosition.lat.toFixed(4)},${userPosition.lng.toFixed(4)}` : '',
            to: destination ? (destination.name || '') : '',
            positions: [],
            maxSpeed: 0
        };
    }

    function recordTripPoint(pos) {
        if (!tripRecording) return;
        const speed = pos.coords.speed != null ? pos.coords.speed * 3.6 : 0;
        tripRecording.positions.push({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speed,
            timestamp: Date.now()
        });
        if (speed > tripRecording.maxSpeed) tripRecording.maxSpeed = speed;
    }

    function stopTripRecording() {
        if (!tripRecording || !tripsDb || tripRecording.positions.length < 2) { tripRecording = null; return; }
        const endTime = Date.now();
        const duration = (endTime - tripRecording.startTime) / 1000;
        let distance = 0;
        for (let i = 1; i < tripRecording.positions.length; i++) {
            distance += haversine(tripRecording.positions[i - 1].lat, tripRecording.positions[i - 1].lng,
                tripRecording.positions[i].lat, tripRecording.positions[i].lng);
        }
        const avgSpeed = duration > 0 ? (distance / 1000) / (duration / 3600) : 0;
        const trip = {
            date: new Date().toISOString(),
            from: tripRecording.from,
            to: tripRecording.to,
            distance,
            duration,
            avgSpeed: Math.round(avgSpeed),
            maxSpeed: Math.round(tripRecording.maxSpeed),
            positions: tripRecording.positions.filter((_, i) => i % 5 === 0) // keep 1 in 5 for storage
        };
        const tx = tripsDb.transaction(TRIPS_STORE, 'readwrite');
        tx.objectStore(TRIPS_STORE).add(trip);
        tx.oncomplete = () => renderTrips();
        tripRecording = null;
    }

    function renderTrips() {
        if (!tripsDb || !$tripsList) return;
        const tx = tripsDb.transaction(TRIPS_STORE, 'readonly');
        const store = tx.objectStore(TRIPS_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
            const trips = req.result.sort((a, b) => new Date(b.date) - new Date(a.date));
            if (trips.length === 0) {
                $tripsList.innerHTML = '';
                if ($tripsEmpty) $tripsEmpty.classList.remove('hidden');
                return;
            }
            if ($tripsEmpty) $tripsEmpty.classList.add('hidden');
            $tripsList.innerHTML = trips.slice(0, 20).map(t => {
                const d = new Date(t.date);
                const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                return `<div class="trip-item" data-id="${t.id}">
                    <div class="trip-icon"><svg viewBox="0 0 24 24"><path d="M3 12h18M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
                    <div class="trip-text">
                        <div class="trip-name">${escapeHtml(t.to || 'Trajet')}</div>
                        <div class="trip-details">${dateStr} - ${formatDistance(t.distance)} - ${formatDuration(t.duration)}</div>
                    </div>
                </div>`;
            }).join('');
            $tripsList.querySelectorAll('.trip-item').forEach(el => {
                el.addEventListener('click', () => showTrip(parseInt(el.dataset.id)));
            });
        };
    }

    function showTrip(id) {
        if (!tripsDb) return;
        const tx = tripsDb.transaction(TRIPS_STORE, 'readonly');
        const req = tx.objectStore(TRIPS_STORE).get(id);
        req.onsuccess = () => {
            const trip = req.result;
            if (!trip || !trip.positions.length) return;
            switchView('map');
            if (gpxImportLayer) map.removeLayer(gpxImportLayer);
            const coords = trip.positions.map(p => [p.lat, p.lng]);
            gpxImportLayer = L.polyline(coords, { color: '#5856d6', weight: 4 }).addTo(map);
            map.fitBounds(gpxImportLayer.getBounds(), { padding: [40, 40] });
            showToast(`Trajet du ${new Date(trip.date).toLocaleDateString('fr-FR')}`, 'info');
        };
    }

    // ===== 7. ROUTE SIMULATION =====
    function setupSimulationEvents() {
        if (!$navSimulateBtn) return;
        $navSimulateBtn.addEventListener('click', () => {
            if (isSimulating) stopSimulation();
            else startSimulation();
        });
    }

    function startSimulation() {
        if (!routeData?.geometry?.coordinates || isNavigating) return;
        isSimulating = true;
        simulationIndex = 0;
        document.body.classList.add('simulating');
        $navPanel.classList.add('hidden');
        $transportModes.classList.add('hidden');
        $routeAlternatives.classList.add('hidden');
        $activeNav.classList.remove('hidden');
        $activeNavBottom.classList.remove('hidden');
        $navSimulateBtn.textContent = 'Arreter';
        updateNavigationDisplay();
        animateSimulation();
    }

    function stopSimulation() {
        isSimulating = false;
        document.body.classList.remove('simulating');
        $activeNav.classList.add('hidden');
        $activeNavBottom.classList.add('hidden');
        $navSimulateBtn.textContent = 'Simuler';
        if (simulationFrame) { cancelAnimationFrame(simulationFrame); simulationFrame = null; }
    }

    function animateSimulation() {
        if (!isSimulating || !routeData?.geometry?.coordinates) return;
        const coords = routeData.geometry.coordinates;
        if (simulationIndex >= coords.length) { stopSimulation(); showToast('Simulation terminee', 'info'); return; }
        const c = coords[simulationIndex];
        const lat = c[1], lng = c[0];
        map.setView([lat, lng], NAV_ZOOM, { animate: true, duration: 0.1 });
        // Update step tracking
        for (let i = currentStepIndex; i < routeSteps.length; i++) {
            const stepLoc = routeSteps[i].maneuver.location;
            if (haversine(lat, lng, stepLoc[1], stepLoc[0]) < 50) {
                currentStepIndex = Math.min(i + 1, routeSteps.length - 1);
                updateNavigationDisplay();
                break;
            }
        }
        updateRemainingInfo(lat, lng);
        simulationIndex += 3; // skip points for speed
        simulationFrame = requestAnimationFrame(() => setTimeout(animateSimulation, 50));
    }

    // ===== 8. SPEED CAMERAS / RADARS =====
    function fetchRadarsNearby(lat, lng) {
        if (radarQueryTimeout) return;
        radarQueryTimeout = setTimeout(() => { radarQueryTimeout = null; }, RADAR_QUERY_INTERVAL);
        const query = `[out:json][timeout:5];node[highway=speed_camera](around:2000,${lat},${lng});out body;`;
        fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data?.elements) return;
                data.elements.forEach(el => {
                    const id = `${el.lat}_${el.lon}`;
                    if (knownRadars.has(id)) return;
                    knownRadars.add(id);
                    const marker = L.marker([el.lat, el.lon], {
                        icon: L.divIcon({ className: 'radar-marker', iconSize: [16, 16], iconAnchor: [8, 8] })
                    }).addTo(map);
                    radarMarkers.push({ marker, lat: el.lat, lon: el.lon, alerted: false });
                });
                checkRadarProximity(lat, lng);
            })
            .catch(() => {});
    }

    function checkRadarProximity(lat, lng) {
        radarMarkers.forEach(r => {
            const dist = haversine(lat, lng, r.lat, r.lon);
            if (dist < RADAR_ALERT_DISTANCE && !r.alerted) {
                r.alerted = true;
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                showToast('Radar dans ' + formatDistance(dist), 'error', 4000);
                speak('Attention, radar');
            }
            if (dist > RADAR_ALERT_DISTANCE * 2) r.alerted = false;
        });
    }

    function clearRadarMarkers() {
        radarMarkers.forEach(r => map.removeLayer(r.marker));
        radarMarkers = [];
        knownRadars.clear();
    }

    // ===== 9. CHARGING STATIONS =====
    // Handled via existing POI system with 'charging' category - see searchPOI

    // ===== 10. DASHBOARD =====
    function updateDashboard(pos) {
        if (!$navDashboard || $navDashboard.classList.contains('hidden')) return;
        if (settings.dashboardItems?.includes('altitude') && $dashAltitude) {
            const alt = pos.coords.altitude;
            $dashAltitude.textContent = alt != null ? Math.round(alt) + 'm' : '--';
        }
        if (settings.dashboardItems?.includes('heading') && $dashHeading) {
            const heading = pos.coords.heading;
            $dashHeading.textContent = heading != null ? Math.round(heading) + '\u00B0' : '--';
        }
    }

    // ===== 11. KEYBOARD SHORTCUTS =====
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.key) {
                case '/': e.preventDefault(); switchView('search'); $searchInput.focus(); break;
                case 'Escape':
                    $isochroneModal?.classList.add('hidden');
                    $gpxModal?.classList.add('hidden');
                    $shortcutsModal?.classList.add('hidden');
                    $favoriteModal?.classList.add('hidden');
                    $shareModal?.classList.add('hidden');
                    if (!$navPanel.classList.contains('hidden')) $navClose.click();
                    if (!$poiPanel.classList.contains('hidden')) $poiClose.click();
                    break;
                case 'l': case 'L': $locateBtn.click(); break;
                case 'p': case 'P': $poiBtn.click(); break;
                case 'i': case 'I': $isochroneBtn?.click(); break;
                case '1': switchView('map'); break;
                case '2': switchView('search'); break;
                case '3': switchView('settings'); break;
                case ' ':
                    e.preventDefault();
                    if (isNavigating) $activeNavStop.click();
                    else if (routeData) $navStartBtn.click();
                    break;
                case '?': $shortcutsModal?.classList.remove('hidden'); break;
            }
        });
        if ($shortcutsModalClose) {
            $shortcutsModalClose.addEventListener('click', () => $shortcutsModal.classList.add('hidden'));
            $shortcutsModal.addEventListener('click', e => { if (e.target === $shortcutsModal) $shortcutsModal.classList.add('hidden'); });
        }
    }

    // ===== OFFLINE (disabled in native iOS app) =====
    function setupOfflineDownload() {}
    function latLngToTile(lat, lng, zoom) {
        const n = Math.pow(2, zoom);
        const x = Math.floor((lng + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x, y };
    }

    // ===== 13. WEATHER =====
    function setupWeather() {
        updateWeather();
        weatherTimeout = setInterval(updateWeather, WEATHER_UPDATE_INTERVAL);
    }

    async function updateWeather() {
        if (!userPosition || !$weatherWidget) return;
        try {
            const resp = await fetch(`${WEATHER_URL}/v1/forecast?latitude=${userPosition.lat}&longitude=${userPosition.lng}&current_weather=true`);
            if (!resp.ok) return;
            const data = await resp.json();
            const cw = data.current_weather;
            if (!cw) return;
            $weatherIcon.textContent = getWeatherEmoji(cw.weathercode);
            $weatherTemp.textContent = Math.round(cw.temperature) + '\u00B0';
            $weatherWind.textContent = Math.round(cw.windspeed) + ' km/h';
            $weatherWidget.classList.remove('hidden');
        } catch (e) { /* silent */ }
    }

    function getWeatherEmoji(code) {
        if (code === 0) return '\u2600'; // sun
        if (code <= 3) return '\u26C5'; // partly cloudy
        if (code <= 48) return '\u2601'; // cloudy/fog
        if (code <= 57) return '\uD83C\uDF27'; // drizzle
        if (code <= 67) return '\uD83C\uDF27'; // rain
        if (code <= 77) return '\u2744'; // snow
        if (code <= 82) return '\u26C8'; // showers
        if (code <= 86) return '\u2744'; // snow showers
        return '\u26A1'; // thunderstorm
    }

    // ===== SYNC (disabled in native app, uses local storage only) =====
    function setupSyncEvents() {}
    function syncToServer() {}
    function syncFromServer() {}

    // ===== NEW SETTINGS EVENTS =====
    function setupNewSettingsEvents() {
        if ($autoNightToggle) $autoNightToggle.addEventListener('change', () => {
            settings.autoNightMap = $autoNightToggle.checked;
            saveSettings();
            if (settings.autoNightMap) checkAutoNightMode();
        });
        if ($radarAlertsToggle) $radarAlertsToggle.addEventListener('change', () => {
            settings.radarAlerts = $radarAlertsToggle.checked;
            saveSettings();
        });
        const vehicleInputHandler = () => {
            settings.vehicleProfile = {
                height: $vehicleHeight?.value ? parseFloat($vehicleHeight.value) : null,
                weight: $vehicleWeight?.value ? parseFloat($vehicleWeight.value) : null,
                width: $vehicleWidth?.value ? parseFloat($vehicleWidth.value) : null,
                length: $vehicleLength?.value ? parseFloat($vehicleLength.value) : null
            };
            saveSettings();
        };
        [$vehicleHeight, $vehicleWeight, $vehicleWidth, $vehicleLength].forEach(el => {
            if (el) el.addEventListener('change', vehicleInputHandler);
        });
        if ($dashAltitudeToggle) $dashAltitudeToggle.addEventListener('change', () => {
            const items = new Set(settings.dashboardItems || []);
            if ($dashAltitudeToggle.checked) items.add('altitude'); else items.delete('altitude');
            settings.dashboardItems = [...items];
            saveSettings();
        });
        if ($dashHeadingToggle) $dashHeadingToggle.addEventListener('change', () => {
            const items = new Set(settings.dashboardItems || []);
            if ($dashHeadingToggle.checked) items.add('heading'); else items.delete('heading');
            settings.dashboardItems = [...items];
            saveSettings();
        });
        if ($tripsClearBtn) $tripsClearBtn.addEventListener('click', () => {
            if (!tripsDb || !confirm('Effacer tous les trajets ?')) return;
            const tx = tripsDb.transaction(TRIPS_STORE, 'readwrite');
            tx.objectStore(TRIPS_STORE).clear();
            tx.oncomplete = () => renderTrips();
        });
        if ($optimizeWaypointsBtn) $optimizeWaypointsBtn.addEventListener('click', optimizeWaypointOrder);
    }

    // ===== iOS NATIVE BRIDGE =====
    function notifyNative(action, data) {
        if (window.webkit?.messageHandlers?.mapsiNative) {
            window.webkit.messageHandlers.mapsiNative.postMessage({ action, ...data });
        }
    }

    // CarPlay search callback
    window.mapsiCarPlaySearch = function(query) {
        searchAddress(query).then(() => {
            // Results already displayed in DOM, extract and send to native
            const items = [];
            $searchResults.querySelectorAll('.search-result-item').forEach(el => {
                items.push({
                    name: el.dataset.name,
                    address: el.dataset.address,
                    lat: parseFloat(el.dataset.lat),
                    lon: parseFloat(el.dataset.lon)
                });
            });
            notifyNative('searchResults', { results: items });
        });
    };

    window.mapsiCarPlaySelectDestination = function(lat, lon, name) {
        switchView('map');
        setDestination(lat, lon, name);
        $searchInput.value = name;
        $searchClear.classList.remove('hidden');
        addToHistory({ name, address: '', lat, lon });
    };

    window.mapsiCarPlayStartNavigation = function() {
        if (routeData) startNavigation();
    };

    window.mapsiCarPlayStopNavigation = function() {
        if (isNavigating) stopNavigation();
    };

    window.mapsiCarPlayGetFavorites = function() {
        notifyNative('favorites', { favorites: favorites });
    };

    // Override startNavigation to notify native
    const _originalStartNavigation = startNavigation;
    // Augment navigation update to push to native bridge
    const _originalUpdateNavigation = updateNavigation;

    // ===== EVENT LISTENERS =====
    $searchInput.addEventListener('input', e => {
        const val = e.target.value.trim();
        $searchClear.classList.toggle('hidden', val.length === 0);
        if (val.length >= 2) hideQuickPoiBar();
        else if (val.length === 0) showQuickPoiBar();
        debounceSearch(val);
    });
    $searchInput.addEventListener('focus', () => {
        if ($searchInput.value.trim().length >= 2) { hideQuickPoiBar(); debounceSearch($searchInput.value.trim()); }
        else showQuickPoiBar();
    });
    $searchClear.addEventListener('click', () => { $searchInput.value = ''; $searchClear.classList.add('hidden'); $searchResults.classList.add('hidden'); showQuickPoiBar(); $searchInput.focus(); if (addingWaypoint) { addingWaypoint = false; $searchInput.placeholder = 'Rechercher une adresse...'; } });
    $locateBtn.addEventListener('click', () => { if (isTracking) stopWatchingPosition(); else { locateUser(); startWatchingPosition(); } });
    document.querySelectorAll('.transport-btn').forEach(btn => btn.addEventListener('click', () => selectTransportMode(btn.dataset.mode)));
    $navClose.addEventListener('click', () => {
        $navPanel.classList.add('hidden'); $transportModes.classList.add('hidden'); $routeAlternatives.classList.add('hidden');
        $elevationProfile.classList.add('hidden');
        if (isNavigating) return;
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        if (routeShadowLayer) { map.removeLayer(routeShadowLayer); routeShadowLayer = null; }
        if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
        clearAltRouteLayers(); clearWaypoints(); clearPOIMarkers();
        $searchInput.value = ''; $searchClear.classList.add('hidden'); destination = null; allRoutes = [];
    });
    $navStartBtn.addEventListener('click', startNavigation);
    $activeNavStop.addEventListener('click', stopNavigation);

    init();
})();
