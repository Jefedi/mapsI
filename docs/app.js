// ==========================================
// MapsI PWA v3.2 - Navigation GPS avec OpenStreetMap
// ==========================================

(function() {
    'use strict';

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW registration failed:', e));
    }

    // ===== CONFIG =====
    const NOMINATIM_URL = '/api/nominatim';
    const VALHALLA_URL = '/api/valhalla';
    const FUEL_API = '/api/fuel/records';
    const OVERPASS_URL = '/api/overpass/interpreter';
    const WEATHER_URL = '/api/weather';
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

    const MAP_TILES = {
        standard: { url: '/tiles/styles/osm-bright/{z}/{x}/{y}.png', attr: '&copy; OpenMapTiles &copy; OSM', maxZoom: 19 },
        clair: { url: '/tiles/styles/positron/{z}/{x}/{y}.png', attr: '&copy; OpenMapTiles &copy; OSM', maxZoom: 20 },
        sombre: { url: '/tiles/styles/dark-matter/{z}/{x}/{y}.png', attr: '&copy; OpenMapTiles &copy; OSM', maxZoom: 20 }
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
        syncEnabled: false,
        dashboardItems: ['speed', 'altitude', 'heading'],
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

    // Feature 1: Isochrones
    let isochroneLayer = null;

    // Feature 5: Trip history
    let tripDB = null;
    let currentTrip = null;
    let tripPositions = [];
    let tripMaxSpeed = 0;
    let tripLayer = null;

    // Feature 6: Marker clustering
    let poiClusterGroup = null;

    // Feature 7: Route simulation
    let isSimulating = false;
    let simulationFrame = null;
    let simulationIndex = 0;
    let simulationMarker = null;
    let simulationSpeed = 10;

    // Feature 8: Speed cameras/radars
    let radarMarkers = [];
    let knownRadars = new Set();
    let radarQueryTimeout = null;

    // Feature 4: Auto night mode
    let previousDayStyle = null;

    // Feature 10: Dashboard
    let currentAltitude = null;
    let currentHeading = null;

    // Feature 13: Weather
    let weatherTimeout = null;
    let lastWeatherPos = null;

    // Feature 12: Offline zone
    let offlineDownloading = false;

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

    // Feature 1: Isochrone DOM
    const $isochroneBtn = $('isochrone-btn');

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
        renderHistory();
        renderFavorites();
        // New feature setups
        setupIsochroneEvents();
        setupGPXEvents();
        setupOptimizeWaypointsEvents();
        setupSimulationEvents();
        setupKeyboardShortcuts();
        setupOfflineDownload();
        setupWeather();
        setupChargingStationEvents();
        setupDashboardSettings();
        setupVehicleProfileSettings();
        setupSyncSettings();
        setupRadarSettings();
        setupAutoNightSettings();
        setupTripHistoryUI();
        initMarkerCluster();
        initTripsDB();
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
        if (settings.syncEnabled) syncSettingsPush();
    }

    function isDarkMode() {
        if (settings.theme === 'dark') return true;
        if (settings.theme === 'light') return false;
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    }

    function applySettings() {
        const dark = isDarkMode();
        document.body.classList.toggle('light-mode', !dark);
        if ($themeSelect) $themeSelect.value = settings.theme;
        if ($mapStyleSelect) $mapStyleSelect.value = settings.mapStyle;
        if ($fuelTypeSelect) $fuelTypeSelect.value = settings.fuelType;
        if ($voiceToggle) $voiceToggle.checked = settings.voiceEnabled;
        if ($autoRerouteToggle) $autoRerouteToggle.checked = settings.autoReroute;
        if ($showSpeedToggle) $showSpeedToggle.checked = settings.showSpeed;
        if ($avoidMotorwayToggle) $avoidMotorwayToggle.checked = settings.avoidMotorway;
        if ($avoidTollToggle) $avoidTollToggle.checked = settings.avoidToll;
        if ($avoidFerryToggle) $avoidFerryToggle.checked = settings.avoidFerry;

        const tilePane = document.querySelector('.leaflet-tile-pane');
        if (tilePane) {
            tilePane.classList.toggle('dark-tiles', dark && settings.mapStyle === 'standard');
        }

        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.content = dark ? '#1a1a2e' : '#f2f2f7';
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
        else if (view === 'search') { renderHistory(); renderFavorites(); renderTripHistory(); }
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
        if (settings.syncEnabled) {
            syncFavoritesPull().then(() => {}).catch(() => {});
        }
        try { const saved = localStorage.getItem(FAVORITES_KEY); favorites = saved ? JSON.parse(saved) : []; } catch (e) { favorites = []; }
    }

    function saveFavorites() {
        try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) {}
        if (settings.syncEnabled) syncFavoritesPush();
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
                else if (btn.dataset.cat === 'charging') searchChargingStations();
                else searchPOI(btn.dataset.cat);
            });
        });
    }

    const POI_QUERIES = { fuel: '[amenity=fuel]', restaurant: '[amenity=restaurant]', parking: '[amenity=parking]', pharmacy: '[amenity=pharmacy]' };

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
            const url = `${FUEL_API}?limit=15&lat=${lat}&lon=${lng}&radius=${POI_RADIUS}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            displayFuelResults(data.results || [], fuelType);
        } catch (err) {
            // Fallback to Overpass without prices
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
        poiMarkers.forEach(m => map.removeLayer(m));
        poiMarkers = [];
        if (poiClusterGroup) poiClusterGroup.clearLayers();
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
        else if (category === 'charging') await searchQuickCharging();
        else await searchQuickOverpass(category);
    }

    async function searchQuickFuel() {
        try {
            const fuelType = settings.fuelType;
            const lat = userPosition.lat;
            const lng = userPosition.lng;
            const url = `${FUEL_API}?limit=15&lat=${lat}&lon=${lng}&radius=${POI_RADIUS}`;
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
            fuel_fallback: `[out:json][timeout:10];node[amenity=fuel](around:${POI_RADIUS},${lat},${lng});out body 15;`
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
            if (el.tags?.['socket:ccs'] === 'yes' || el.tags?.['socket:type2_combo'] === 'yes') parts.push('CCS');
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
        currentAltitude = pos.coords.altitude;
        currentHeading = pos.coords.heading;
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
        // Feature 4: Auto night mode check
        if (settings.autoNightMap) checkAutoNightMode(lat, lng);
        // Feature 5: Trip recording
        if (isNavigating && currentTrip) {
            tripPositions.push({ lat, lng, speed: speed || 0, timestamp: Date.now() });
            if (speed && speed > tripMaxSpeed) tripMaxSpeed = speed;
        }
        // Feature 13: Weather update
        updateWeatherIfNeeded(lat, lng);
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

    // ===== ROUTING (multi-stops) =====
    async function calculateRoute() {
        if (!userPosition || !destination) return;
        showLoading();
        const costing = transportMode === 'walking' ? 'pedestrian' : transportMode === 'cycling' ? 'bicycle' : 'auto';
        const locations = [{ lat: userPosition.lat, lon: userPosition.lng }];
        waypoints.forEach(wp => locations.push({ lat: wp.lat, lon: wp.lon }));
        locations.push({ lat: destination.lat, lon: destination.lon });
        const body = { locations, costing, alternates: waypoints.length === 0 ? 2 : 0, units: 'km', language: 'fr-FR' };
        if (settings.avoidMotorway || settings.avoidToll || settings.avoidFerry) {
            body.costing_options = { [costing]: {} };
            if (settings.avoidMotorway) body.costing_options[costing].use_highways = 0;
            if (settings.avoidToll) body.costing_options[costing].use_tolls = 0;
            if (settings.avoidFerry) body.costing_options[costing].use_ferry = 0;
        }
        // Feature 14: Vehicle profile
        if (costing === 'auto' && settings.vehicleProfile) {
            const vp = settings.vehicleProfile;
            if (vp.height || vp.weight || vp.width || vp.length) {
                if (!body.costing_options) body.costing_options = {};
                if (!body.costing_options[costing]) body.costing_options[costing] = {};
                if (vp.height) body.costing_options[costing].height = vp.height;
                if (vp.weight) body.costing_options[costing].weight = vp.weight;
                if (vp.width) body.costing_options[costing].width = vp.width;
                if (vp.length) body.costing_options[costing].length = vp.length;
            }
        }
        if (routeAbortController) routeAbortController.abort();
        routeAbortController = new AbortController();
        try {
            const resp = await fetch(`${VALHALLA_URL}/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: routeAbortController.signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json(); hideLoading();
            if (data.error_code || data.status_code) { showToast('Impossible de calculer le trajet', 'error'); return; }
            allRoutes = normalizeValhallaResponse(data); selectedRouteIndex = 0; selectRoute(0);
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
        } catch (err) {
            if (err.name === 'AbortError') return;
            hideLoading(); showToast('Erreur de calcul du trajet', 'error'); console.warn('Route error:', err);
        }
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
        // Feature 13: Show weather at destination
        fetchDestinationWeather();
    }

    function calculateETA(sec) {
        const d = new Date(Date.now() + sec * 1000);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    // ===== ACTIVE NAVIGATION =====
    function startNavigation() {
        isNavigating = true; currentStepIndex = 0; lastSpokenStep = -1; lastMatchedSegmentIndex = 0; snappedPosition = null;
        $navPanel.classList.add('hidden'); $transportModes.classList.add('hidden'); $routeAlternatives.classList.add('hidden');
        $activeNav.classList.remove('hidden'); $activeNavBottom.classList.remove('hidden'); $locateBtn.classList.add('nav-hidden');
        document.body.classList.add('navigating');
        clearAltRouteLayers();
        startWatchingPosition(); updateNavigationDisplay();
        if (userPosition) { map.setView([userPosition.lat, userPosition.lng], NAV_ZOOM); if (userMarker) userMarker.setIcon(createNavIcon()); userPosition._navIcon = true; updateMapBearing(userPosition.heading); }
        if (settings.showSpeed) $speedDisplay.classList.remove('hidden');
        if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {});
        speakStep(0);
        // Feature 5: Start trip recording
        startTripRecording();
        // Feature 8: Start radar alerts
        if (settings.radarAlerts) startRadarAlerts();
        // Feature 10: Show dashboard
        updateDashboard();
    }

    function stopNavigation() {
        isNavigating = false; lastMatchedSegmentIndex = 0; snappedPosition = null;
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
        // Feature 5: Stop trip recording
        stopTripRecording();
        // Feature 7: Stop simulation if running
        if (isSimulating) stopSimulation();
        // Feature 8: Stop radar alerts
        stopRadarAlerts();
        // Feature 10: Hide dashboard
        hideDashboard();
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
        // Feature 8: Check radars
        if (settings.radarAlerts) checkRadarProximity(userLat, userLng);
        // Feature 10: Update dashboard
        updateDashboard();
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
            const resp = await fetch(`/api/elevation/v1/mapzen?locations=${locations}`);
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

    // ===== VALHALLA RESPONSE NORMALIZATION =====
    function decodePolyline(encoded, precision) {
        precision = precision || 6;
        const factor = Math.pow(10, precision);
        const coords = [];
        let lat = 0, lng = 0, index = 0;
        while (index < encoded.length) {
            let b, shift = 0, result = 0;
            do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lat += (result & 1) ? ~(result >> 1) : (result >> 1);
            shift = 0; result = 0;
            do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lng += (result & 1) ? ~(result >> 1) : (result >> 1);
            coords.push([lng / factor, lat / factor]);
        }
        return coords;
    }

    const VALHALLA_MANEUVER_MAP = {
        0: { type: 'turn', modifier: 'straight' },
        1: { type: 'depart', modifier: '' }, 2: { type: 'depart', modifier: 'right' }, 3: { type: 'depart', modifier: 'left' },
        4: { type: 'arrive', modifier: '' }, 5: { type: 'arrive', modifier: 'right' }, 6: { type: 'arrive', modifier: 'left' },
        7: { type: 'continue', modifier: '' }, 8: { type: 'continue', modifier: '' },
        9: { type: 'turn', modifier: 'slight right' }, 10: { type: 'turn', modifier: 'right' }, 11: { type: 'turn', modifier: 'sharp right' },
        12: { type: 'turn', modifier: 'uturn' }, 13: { type: 'turn', modifier: 'uturn' },
        14: { type: 'turn', modifier: 'sharp left' }, 15: { type: 'turn', modifier: 'left' }, 16: { type: 'turn', modifier: 'slight left' },
        17: { type: 'continue', modifier: 'straight' }, 18: { type: 'fork', modifier: 'right' }, 19: { type: 'fork', modifier: 'left' },
        20: { type: 'fork', modifier: 'right' }, 21: { type: 'fork', modifier: 'left' },
        22: { type: 'continue', modifier: '' }, 23: { type: 'fork', modifier: 'right' }, 24: { type: 'fork', modifier: 'left' },
        25: { type: 'merge', modifier: '' }, 26: { type: 'roundabout', modifier: '' }, 27: { type: 'roundabout', modifier: '' },
        28: { type: 'notification', modifier: '' }, 29: { type: 'notification', modifier: '' },
        37: { type: 'merge', modifier: 'right' }, 38: { type: 'merge', modifier: 'left' }
    };

    function normalizeValhallaTrip(trip) {
        const allCoords = [];
        const legs = trip.legs.map(leg => {
            const coords = decodePolyline(leg.shape);
            const steps = leg.maneuvers.map(m => {
                const mInfo = VALHALLA_MANEUVER_MAP[m.type] || { type: 'turn', modifier: 'straight' };
                const loc = coords[m.begin_shape_index] || coords[0];
                return {
                    maneuver: { type: mInfo.type, modifier: mInfo.modifier, location: loc },
                    name: escapeHtml((m.street_names && m.street_names[0]) || ''),
                    ref: escapeHtml((m.begin_street_names && m.begin_street_names[0]) || ''),
                    distance: m.length * 1000,
                    duration: m.time
                };
            });
            allCoords.push(...coords);
            return { steps, distance: leg.summary.length * 1000, duration: leg.summary.time };
        });
        return {
            geometry: { type: 'LineString', coordinates: allCoords },
            legs,
            distance: trip.summary.length * 1000,
            duration: trip.summary.time
        };
    }

    function normalizeValhallaResponse(data) {
        const routes = [normalizeValhallaTrip(data.trip)];
        if (data.alternates) {
            data.alternates.forEach(alt => routes.push(normalizeValhallaTrip(alt.trip)));
        }
        return routes;
    }

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

    // =========================================================
    // ===== NEW FEATURES =====
    // =========================================================

    // ===== FEATURE 1: ISOCHRONES (Valhalla /isochrone) =====
    function setupIsochroneEvents() {
        if (!$isochroneBtn) return;
        $isochroneBtn.addEventListener('click', showIsochroneDialog);
    }

    function showIsochroneDialog() {
        if (!userPosition) { showToast('Position non disponible', 'error'); return; }
        // Create a simple popup to choose time
        const existing = document.getElementById('isochrone-dialog');
        if (existing) existing.remove();
        const dialog = document.createElement('div');
        dialog.id = 'isochrone-dialog';
        dialog.className = 'mapsi-modal';
        dialog.innerHTML = `
            <div class="modal-content" style="max-width:280px">
                <div class="modal-header">
                    <span>Isochrones</span>
                    <button id="isochrone-dialog-close" aria-label="Fermer">&times;</button>
                </div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:8px">
                    <button class="iso-time-btn" data-minutes="15" style="padding:12px;border-radius:8px;background:#30d158;color:#fff;border:none;font-size:15px;cursor:pointer">15 minutes</button>
                    <button class="iso-time-btn" data-minutes="30" style="padding:12px;border-radius:8px;background:#ff9f0a;color:#fff;border:none;font-size:15px;cursor:pointer">30 minutes</button>
                    <button class="iso-time-btn" data-minutes="60" style="padding:12px;border-radius:8px;background:#ff3b30;color:#fff;border:none;font-size:15px;cursor:pointer">60 minutes</button>
                    <button id="iso-all-btn" style="padding:12px;border-radius:8px;background:var(--primary);color:#fff;border:none;font-size:15px;cursor:pointer">Tout afficher</button>
                    ${isochroneLayer ? '<button id="iso-clear-btn" style="padding:12px;border-radius:8px;background:var(--danger);color:#fff;border:none;font-size:15px;cursor:pointer">Effacer</button>' : ''}
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        dialog.querySelector('#isochrone-dialog-close').addEventListener('click', () => dialog.remove());
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
        dialog.querySelectorAll('.iso-time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dialog.remove();
                fetchIsochrone([parseInt(btn.dataset.minutes)]);
            });
        });
        const allBtn = dialog.querySelector('#iso-all-btn');
        if (allBtn) allBtn.addEventListener('click', () => { dialog.remove(); fetchIsochrone([15, 30, 60]); });
        const clearBtn = dialog.querySelector('#iso-clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', () => { dialog.remove(); clearIsochrone(); });
    }

    async function fetchIsochrone(times) {
        if (!userPosition) return;
        showLoading();
        clearIsochrone();
        const contours = times.map(t => ({ time: t }));
        const body = {
            locations: [{ lat: userPosition.lat, lon: userPosition.lng }],
            costing: 'auto',
            contours,
            polygons: true
        };
        try {
            const resp = await fetch(`${VALHALLA_URL}/isochrone`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const geojson = await resp.json();
            hideLoading();
            displayIsochrone(geojson, times);
        } catch (e) {
            hideLoading();
            showToast('Erreur lors du calcul des isochrones', 'error');
            console.warn('Isochrone error:', e);
        }
    }

    function displayIsochrone(geojson, times) {
        const colors = { 15: '#30d158', 30: '#ff9f0a', 60: '#ff3b30' };
        const defaultColors = ['#30d158', '#ff9f0a', '#ff3b30'];
        isochroneLayer = L.geoJSON(geojson, {
            style: function(feature) {
                const contour = feature.properties?.contour;
                const color = colors[contour] || defaultColors[0];
                return { color, fillColor: color, fillOpacity: 0.15, weight: 2, opacity: 0.7 };
            }
        }).addTo(map);
        map.fitBounds(isochroneLayer.getBounds(), { padding: [40, 40] });
    }

    function clearIsochrone() {
        if (isochroneLayer) {
            map.removeLayer(isochroneLayer);
            isochroneLayer = null;
        }
    }

    // ===== FEATURE 2: EXPORT/IMPORT GPX =====
    function setupGPXEvents() {
        const exportBtn = $('nav-gpx-export');
        const importInput = $('gpx-import-input');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportGPX);
        }
        if (importInput) {
            importInput.addEventListener('change', importGPX);
        }
    }

    function exportGPX() {
        if (!routeData || !routeData.geometry || !routeData.geometry.coordinates || routeData.geometry.coordinates.length === 0) {
            showToast('Aucun itineraire a exporter', 'error');
            return;
        }
        const coords = routeData.geometry.coordinates;
        let trkpts = '';
        coords.forEach(c => {
            trkpts += `      <trkpt lat="${c[1]}" lon="${c[0]}"></trkpt>\n`;
        });
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MapsI PWA"
     xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeHtml(destination?.name || 'Itineraire MapsI')}</name>
    <trkseg>
${trkpts}    </trkseg>
  </trk>
</gpx>`;
        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mapsi_route_${Date.now()}.gpx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('GPX exporte !', 'success');
    }

    function importGPX(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const parser = new DOMParser();
                const xml = parser.parseFromString(ev.target.result, 'text/xml');
                const trkpts = xml.querySelectorAll('trkpt');
                if (trkpts.length === 0) {
                    showToast('Aucun point trouve dans le fichier GPX', 'error');
                    return;
                }
                const coords = [];
                trkpts.forEach(pt => {
                    const lat = parseFloat(pt.getAttribute('lat'));
                    const lon = parseFloat(pt.getAttribute('lon'));
                    if (!isNaN(lat) && !isNaN(lon)) coords.push([lat, lon]);
                });
                if (coords.length < 2) {
                    showToast('Pas assez de points dans le GPX', 'error');
                    return;
                }
                // Draw imported track on map
                if (tripLayer) { map.removeLayer(tripLayer); tripLayer = null; }
                tripLayer = L.polyline(coords, { color: '#ff9f0a', weight: 4, opacity: 0.8 }).addTo(map);
                map.fitBounds(tripLayer.getBounds(), { padding: [40, 40] });
                showToast(`GPX importe: ${coords.length} points`, 'success');
            } catch (err) {
                showToast('Erreur lors de l\'import GPX', 'error');
            }
        };
        reader.readAsText(file);
        // Reset input for re-import
        e.target.value = '';
    }

    // ===== FEATURE 3: WAYPOINT ORDER OPTIMIZATION =====
    function setupOptimizeWaypointsEvents() {
        const optimizeBtn = $('optimize-waypoints-btn');
        if (optimizeBtn) {
            optimizeBtn.addEventListener('click', optimizeWaypointOrder);
        }
    }

    async function optimizeWaypointOrder() {
        if (waypoints.length < 2) {
            showToast('Il faut au moins 2 etapes pour optimiser', 'info');
            return;
        }
        if (waypoints.length >= 10) {
            showToast('Maximum 9 etapes pour l\'optimisation', 'error');
            return;
        }
        showLoading();
        const costing = transportMode === 'walking' ? 'pedestrian' : transportMode === 'cycling' ? 'bicycle' : 'auto';
        // Build locations: origin + waypoints + destination
        const allLocs = [];
        if (userPosition) allLocs.push({ lat: userPosition.lat, lon: userPosition.lng });
        waypoints.forEach(wp => allLocs.push({ lat: wp.lat, lon: wp.lon }));
        if (destination) allLocs.push({ lat: destination.lat, lon: destination.lon });

        try {
            const body = {
                sources: allLocs.map(l => ({ lat: l.lat, lon: l.lon })),
                targets: allLocs.map(l => ({ lat: l.lat, lon: l.lon })),
                costing
            };
            const resp = await fetch(`${VALHALLA_URL}/sources_to_targets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            hideLoading();
            const matrix = data.sources_to_targets;
            if (!matrix) { showToast('Erreur de matrice de distances', 'error'); return; }

            // Extract distance matrix
            const n = allLocs.length;
            const dist = [];
            for (let i = 0; i < n; i++) {
                dist[i] = [];
                for (let j = 0; j < n; j++) {
                    dist[i][j] = matrix[i][j]?.distance ?? Infinity;
                }
            }

            // Optimize: origin is index 0, destination is index n-1, optimize middle indices
            const waypointIndices = [];
            for (let i = 1; i < n - 1; i++) waypointIndices.push(i);

            let bestOrder;
            if (waypointIndices.length <= 7) {
                // Brute force permutation
                bestOrder = bruteForceOptimize(dist, waypointIndices, 0, n - 1);
            } else {
                // Nearest neighbor heuristic
                bestOrder = nearestNeighborOptimize(dist, waypointIndices, 0, n - 1);
            }

            // Reorder waypoints
            const newWaypoints = bestOrder.map(idx => waypoints[idx - 1]);
            waypoints = newWaypoints;
            // Reorder markers
            const newMarkers = bestOrder.map(idx => waypointMarkers[idx - 1]);
            waypointMarkers.forEach(m => map.removeLayer(m));
            waypointMarkers = [];
            newMarkers.forEach((m, i) => {
                if (m) {
                    const icon = L.divIcon({
                        className: 'destination-marker',
                        html: '<svg viewBox="0 0 24 36"><circle cx="12" cy="12" r="10" fill="#ff9f0a" stroke="white" stroke-width="3"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">' + (i + 1) + '</text></svg>',
                        iconSize: [32, 40], iconAnchor: [16, 40]
                    });
                    m.setIcon(icon);
                    m.addTo(map);
                    waypointMarkers.push(m);
                }
            });
            renderWaypoints();
            calculateRoute();
            showToast('Etapes optimisees !', 'success');
        } catch (e) {
            hideLoading();
            showToast('Erreur lors de l\'optimisation', 'error');
            console.warn('Optimize error:', e);
        }
    }

    function bruteForceOptimize(dist, indices, startIdx, endIdx) {
        const perms = permutations(indices);
        let bestCost = Infinity;
        let bestPerm = indices;
        for (const perm of perms) {
            let cost = dist[startIdx][perm[0]];
            for (let i = 0; i < perm.length - 1; i++) {
                cost += dist[perm[i]][perm[i + 1]];
            }
            cost += dist[perm[perm.length - 1]][endIdx];
            if (cost < bestCost) { bestCost = cost; bestPerm = perm; }
        }
        return bestPerm;
    }

    function permutations(arr) {
        if (arr.length <= 1) return [arr];
        const result = [];
        for (let i = 0; i < arr.length; i++) {
            const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
            for (const perm of permutations(rest)) {
                result.push([arr[i], ...perm]);
            }
        }
        return result;
    }

    function nearestNeighborOptimize(dist, indices, startIdx, endIdx) {
        const remaining = new Set(indices);
        const order = [];
        let current = startIdx;
        while (remaining.size > 0) {
            let nearest = null, nearestDist = Infinity;
            for (const idx of remaining) {
                if (dist[current][idx] < nearestDist) {
                    nearestDist = dist[current][idx];
                    nearest = idx;
                }
            }
            if (nearest === null) break;
            order.push(nearest);
            remaining.delete(nearest);
            current = nearest;
        }
        return order;
    }

    // ===== FEATURE 4: AUTO NIGHT MODE (SunCalc inline) =====
    function getSunTimes(date, lat, lng) {
        // Solar position calculation (simplified but accurate enough)
        const rad = Math.PI / 180;
        const dayMs = 1000 * 60 * 60 * 24;
        const J0 = 2451545; // Julian date for Jan 1 2000 12:00 UTC
        const J1970 = 2440588;

        function toJulian(d) { return d.valueOf() / dayMs - 0.5 + J1970; }
        function fromJulian(j) { return new Date((j + 0.5 - J1970) * dayMs); }
        function toDays(d) { return toJulian(d) - J0; }

        function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }
        function eclipticLongitude(M) {
            const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
            const P = rad * 102.9372;
            return M + C + P + Math.PI;
        }
        function declination(l) { return Math.asin(Math.sin(l) * Math.sin(rad * 23.4397)); }
        function rightAscension(l) { return Math.atan2(Math.sin(l) * Math.cos(rad * 23.4397), Math.cos(l)); }

        function julianCycle(d, lw) { return Math.round(d - 0.0009 - lw / (2 * Math.PI)); }
        function approxTransit(Ht, lw, n) { return 0.0009 + (Ht + lw) / (2 * Math.PI) + n; }
        function solarTransitJ(ds, M, L) { return J0 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L); }

        function hourAngle(h, phi, dec) {
            const cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
            if (cosH > 1) return 0; // Sun never rises
            if (cosH < -1) return Math.PI; // Sun never sets
            return Math.acos(cosH);
        }

        function getSetJ(h, lw, phi, dec, n, M, L) {
            const w = hourAngle(h, phi, dec);
            const a = approxTransit(w, lw, n);
            return solarTransitJ(a, M, L);
        }

        const lw = rad * -lng;
        const phi = rad * lat;
        const d = toDays(date);
        const n = julianCycle(d, lw);
        const ds = approxTransit(0, lw, n);
        const M = solarMeanAnomaly(ds);
        const L = eclipticLongitude(M);
        const dec = declination(L);

        // Sunrise/sunset angle: -0.833 degrees (standard refraction)
        const h0 = rad * -0.833;
        const Jset = getSetJ(h0, lw, phi, dec, n, M, L);
        const Jnoon = solarTransitJ(ds, M, L);
        const Jrise = Jnoon - (Jset - Jnoon);

        return {
            sunrise: fromJulian(Jrise),
            sunset: fromJulian(Jset)
        };
    }

    function checkAutoNightMode(lat, lng) {
        if (!settings.autoNightMap) return;
        const now = new Date();
        const sunTimes = getSunTimes(now, lat, lng);
        const isNight = now < sunTimes.sunrise || now > sunTimes.sunset;
        if (isNight && settings.mapStyle !== 'sombre') {
            previousDayStyle = settings.mapStyle;
            settings.mapStyle = 'sombre';
            changeMapStyle('sombre');
            if ($mapStyleSelect) $mapStyleSelect.value = 'sombre';
        } else if (!isNight && previousDayStyle && settings.mapStyle === 'sombre') {
            settings.mapStyle = previousDayStyle;
            changeMapStyle(previousDayStyle);
            if ($mapStyleSelect) $mapStyleSelect.value = previousDayStyle;
            previousDayStyle = null;
        }
    }

    function setupAutoNightSettings() {
        const toggle = $('auto-night-toggle');
        if (toggle) {
            toggle.checked = settings.autoNightMap;
            toggle.addEventListener('change', () => {
                settings.autoNightMap = toggle.checked;
                if (!toggle.checked && previousDayStyle) {
                    settings.mapStyle = previousDayStyle;
                    changeMapStyle(previousDayStyle);
                    if ($mapStyleSelect) $mapStyleSelect.value = previousDayStyle;
                    previousDayStyle = null;
                }
                saveSettings();
            });
        }
    }

    // ===== FEATURE 5: TRIP HISTORY (IndexedDB) =====
    function initTripsDB() {
        try {
            const request = indexedDB.open(TRIPS_DB, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(TRIPS_STORE)) {
                    db.createObjectStore(TRIPS_STORE, { keyPath: 'id' });
                }
            };
            request.onsuccess = (e) => {
                tripDB = e.target.result;
            };
            request.onerror = () => { console.warn('IndexedDB not available for trip history'); };
        } catch (e) {
            console.warn('IndexedDB error:', e);
        }
    }

    function startTripRecording() {
        if (!destination) return;
        tripPositions = [];
        tripMaxSpeed = 0;
        currentTrip = {
            id: Date.now(),
            date: new Date().toISOString(),
            from: userPosition ? `${userPosition.lat.toFixed(4)},${userPosition.lng.toFixed(4)}` : 'Inconnu',
            to: destination.name || `${destination.lat.toFixed(4)},${destination.lon.toFixed(4)}`,
            startTime: Date.now()
        };
    }

    function stopTripRecording() {
        if (!currentTrip || tripPositions.length < 2) { currentTrip = null; tripPositions = []; return; }
        const endTime = Date.now();
        const durationSec = (endTime - currentTrip.startTime) / 1000;
        let totalDist = 0;
        for (let i = 1; i < tripPositions.length; i++) {
            totalDist += haversine(tripPositions[i - 1].lat, tripPositions[i - 1].lng, tripPositions[i].lat, tripPositions[i].lng);
        }
        const avgSpeed = durationSec > 0 ? (totalDist / durationSec) * 3.6 : 0;
        const trip = {
            ...currentTrip,
            distance: totalDist,
            duration: durationSec,
            avgSpeed: Math.round(avgSpeed * 10) / 10,
            maxSpeed: Math.round(tripMaxSpeed * 3.6),
            positions: tripPositions.slice() // copy
        };
        saveTripToDB(trip);
        currentTrip = null;
        tripPositions = [];
        tripMaxSpeed = 0;
    }

    function saveTripToDB(trip) {
        if (!tripDB) return;
        try {
            const tx = tripDB.transaction(TRIPS_STORE, 'readwrite');
            tx.objectStore(TRIPS_STORE).put(trip);
        } catch (e) { console.warn('Error saving trip:', e); }
    }

    function getAllTrips(callback) {
        if (!tripDB) { callback([]); return; }
        try {
            const tx = tripDB.transaction(TRIPS_STORE, 'readonly');
            const store = tx.objectStore(TRIPS_STORE);
            const req = store.getAll();
            req.onsuccess = () => { callback(req.result || []); };
            req.onerror = () => { callback([]); };
        } catch (e) { callback([]); }
    }

    function deleteTripFromDB(id) {
        if (!tripDB) return;
        try {
            const tx = tripDB.transaction(TRIPS_STORE, 'readwrite');
            tx.objectStore(TRIPS_STORE).delete(id);
        } catch (e) {}
    }

    function setupTripHistoryUI() {
        // The trip history section is rendered dynamically in search-view
    }

    function renderTripHistory() {
        const container = $('trip-history-list');
        if (!container) return;
        getAllTrips(trips => {
            if (!trips || trips.length === 0) {
                container.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:14px;text-align:center">Aucun trajet enregistre</div>';
                return;
            }
            trips.sort((a, b) => b.id - a.id);
            container.innerHTML = trips.slice(0, 20).map(trip => {
                const dateStr = new Date(trip.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                return `<div class="history-item trip-history-item" data-trip-id="${trip.id}">
                    <div class="history-icon"><svg viewBox="0 0 24 24"><path d="M9 2L4 5v15l5-3 6 3 5-3V2l-5 3-6-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></div>
                    <div class="history-text">
                        <div class="history-name">${escapeHtml(trip.to)}</div>
                        <div class="history-address">${dateStr} · ${formatDistance(trip.distance)} · ${formatDuration(trip.duration)}</div>
                    </div>
                </div>`;
            }).join('');
            container.querySelectorAll('.trip-history-item').forEach(el => {
                el.addEventListener('click', () => {
                    const tripId = parseInt(el.dataset.tripId);
                    showTripOnMap(tripId);
                });
                // Long press to delete
                let lpTimer = null;
                el.addEventListener('touchstart', () => {
                    lpTimer = setTimeout(() => {
                        lpTimer = null;
                        const tripId = parseInt(el.dataset.tripId);
                        if (confirm('Supprimer ce trajet ?')) {
                            deleteTripFromDB(tripId);
                            renderTripHistory();
                        }
                    }, 600);
                }, { passive: true });
                el.addEventListener('touchend', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
                el.addEventListener('touchmove', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
            });
        });
    }

    function showTripOnMap(tripId) {
        getAllTrips(trips => {
            const trip = trips.find(t => t.id === tripId);
            if (!trip || !trip.positions || trip.positions.length < 2) {
                showToast('Trajet introuvable', 'error');
                return;
            }
            switchView('map');
            if (tripLayer) { map.removeLayer(tripLayer); tripLayer = null; }
            const coords = trip.positions.map(p => [p.lat, p.lng]);
            tripLayer = L.polyline(coords, { color: '#5856d6', weight: 4, opacity: 0.8 }).addTo(map);
            map.fitBounds(tripLayer.getBounds(), { padding: [40, 40] });
            showToast(`Trajet vers ${escapeHtml(trip.to)}`, 'info');
        });
    }

    // ===== FEATURE 6: MARKER CLUSTERING =====
    function initMarkerCluster() {
        try {
            if (typeof L.markerClusterGroup === 'function') {
                poiClusterGroup = L.markerClusterGroup({ maxClusterRadius: 50 });
                map.addLayer(poiClusterGroup);
            }
        } catch (e) {
            console.warn('MarkerCluster not available:', e);
        }
    }

    // ===== FEATURE 7: ROUTE SIMULATION / ANIMATION =====
    function setupSimulationEvents() {
        const simBtn = $('nav-simulate-btn');
        if (simBtn) {
            simBtn.addEventListener('click', () => {
                if (isSimulating) stopSimulation();
                else startSimulation();
            });
        }
    }

    function startSimulation() {
        if (!routeData || !routeData.geometry || !routeData.geometry.coordinates || routeData.geometry.coordinates.length < 2) {
            showToast('Aucun itineraire a simuler', 'error');
            return;
        }
        isSimulating = true;
        simulationIndex = 0;
        isNavigating = true;
        currentStepIndex = 0;
        lastSpokenStep = -1;
        lastMatchedSegmentIndex = 0;
        snappedPosition = null;

        $navPanel.classList.add('hidden');
        $transportModes.classList.add('hidden');
        $routeAlternatives.classList.add('hidden');
        $activeNav.classList.remove('hidden');
        $activeNavBottom.classList.remove('hidden');
        $locateBtn.classList.add('nav-hidden');
        document.body.classList.add('navigating');
        clearAltRouteLayers();

        const simBtn = $('nav-simulate-btn');
        if (simBtn) simBtn.textContent = 'Stop Sim.';

        updateNavigationDisplay();
        animateSimulation();
    }

    function stopSimulation() {
        isSimulating = false;
        if (simulationFrame) { cancelAnimationFrame(simulationFrame); simulationFrame = null; }
        if (simulationMarker) { map.removeLayer(simulationMarker); simulationMarker = null; }
        const simBtn = $('nav-simulate-btn');
        if (simBtn) simBtn.textContent = 'Simuler';
        // Reset navigation state
        isNavigating = false;
        resetMapBearing();
        $activeNav.classList.add('hidden');
        $activeNavBottom.classList.add('hidden');
        $locateBtn.classList.remove('nav-hidden');
        document.body.classList.remove('navigating');
    }

    function animateSimulation() {
        if (!isSimulating || !routeData) return;
        const coords = routeData.geometry.coordinates;
        if (simulationIndex >= coords.length) {
            showToast('Simulation terminee', 'success');
            stopSimulation();
            return;
        }
        const c = coords[simulationIndex];
        const lat = c[1], lon = c[0];

        // Update simulation marker
        if (!simulationMarker) {
            simulationMarker = L.marker([lat, lon], { icon: createNavIcon(), zIndexOffset: 1000 }).addTo(map);
        } else {
            simulationMarker.setLatLng([lat, lon]);
        }

        // Update map view
        map.setView([lat, lon], NAV_ZOOM, { animate: true, duration: 0.1 });

        // Update navigation display based on proximity to step maneuvers
        if (routeSteps[currentStepIndex]) {
            const stepLoc = routeSteps[currentStepIndex].maneuver.location;
            const dist = haversine(lat, lon, stepLoc[1], stepLoc[0]);
            if (dist < 30 && currentStepIndex < routeSteps.length - 1) {
                currentStepIndex++;
                updateNavigationDisplay();
                speakStep(currentStepIndex);
            }
            const nextStep = routeSteps[currentStepIndex];
            if (nextStep) {
                $activeNavDistance.textContent = formatDistance(haversine(lat, lon, nextStep.maneuver.location[1], nextStep.maneuver.location[0]));
            }
        }

        // Update remaining info
        let remainDist = 0, remainTime = 0;
        for (let i = currentStepIndex; i < routeSteps.length; i++) { remainDist += routeSteps[i].distance; remainTime += routeSteps[i].duration; }
        $remainingDistance.textContent = formatDistance(remainDist);
        $remainingTime.textContent = formatDuration(remainTime);
        $etaTime.textContent = calculateETA(remainTime);

        // Bearing
        if (simulationIndex + 1 < coords.length) {
            const nextC = coords[simulationIndex + 1];
            const bearing = calculateSegmentBearing(lat, lon, nextC[1], nextC[0]);
            updateMapBearing(bearing);
        }

        simulationIndex += simulationSpeed;
        simulationFrame = requestAnimationFrame(() => {
            setTimeout(animateSimulation, 50); // ~20fps with delay
        });
    }

    // ===== FEATURE 8: SPEED CAMERAS / RADARS =====
    function setupRadarSettings() {
        const toggle = $('radar-alerts-toggle');
        if (toggle) {
            toggle.checked = settings.radarAlerts;
            toggle.addEventListener('change', () => {
                settings.radarAlerts = toggle.checked;
                saveSettings();
            });
        }
    }

    function startRadarAlerts() {
        if (!settings.radarAlerts) return;
        queryRadarsNearby();
    }

    function stopRadarAlerts() {
        if (radarQueryTimeout) { clearTimeout(radarQueryTimeout); radarQueryTimeout = null; }
        radarMarkers.forEach(m => map.removeLayer(m));
        radarMarkers = [];
        knownRadars.clear();
    }

    async function queryRadarsNearby() {
        if (!isNavigating || !userPosition) return;
        const lat = userPosition.lat, lng = userPosition.lng;
        try {
            const query = `[out:json][timeout:5];node[highway=speed_camera](around:2000,${lat},${lng});out body;`;
            const resp = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (data.elements) {
                data.elements.forEach(el => {
                    const key = `${el.lat},${el.lon}`;
                    if (!knownRadars.has(key)) {
                        knownRadars.add(key);
                        const marker = L.circleMarker([el.lat, el.lon], {
                            radius: 8, fillColor: '#ff3b30', color: '#fff', weight: 2, fillOpacity: 0.9
                        }).bindPopup('Radar').addTo(map);
                        radarMarkers.push(marker);
                    }
                });
            }
        } catch (e) {
            // Silent fail
        }
        // Schedule next query in 30s
        if (isNavigating) {
            radarQueryTimeout = setTimeout(queryRadarsNearby, 30000);
        }
    }

    function checkRadarProximity(lat, lng) {
        for (const radarKey of knownRadars) {
            const [rLat, rLon] = radarKey.split(',').map(Number);
            const dist = haversine(lat, lng, rLat, rLon);
            if (dist < 500) {
                showRadarWarning(dist);
                return;
            }
        }
    }

    let lastRadarWarningTime = 0;
    function showRadarWarning(dist) {
        const now = Date.now();
        if (now - lastRadarWarningTime < 30000) return; // Don't warn more than once every 30s
        lastRadarWarningTime = now;
        showToast(`Radar a ${Math.round(dist)} m`, 'error', 4000);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        if (settings.voiceEnabled) speak('Attention, radar dans ' + Math.round(dist) + ' metres');
    }

    // ===== FEATURE 9: CHARGING STATIONS =====
    function setupChargingStationEvents() {
        // Handled in setupPOIEvents via data-cat="charging"
        // Also add to quick POI bar if button exists
        const chargingQuickBtn = document.querySelector('.quick-poi-btn[data-qpoi="charging"]');
        if (chargingQuickBtn) {
            chargingQuickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                searchQuickPOI('charging');
            });
        }
    }

    async function searchChargingStations() {
        if (!userPosition) { showToast('Position non disponible', 'error'); return; }
        $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Recherche des bornes...</div>';
        const lat = userPosition.lat, lng = userPosition.lng;
        const query = `[out:json][timeout:10];node[amenity=charging_station](around:${POI_RADIUS},${lat},${lng});out body 15;`;
        try {
            const resp = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            displayChargingResults(data.elements || []);
        } catch (err) {
            $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--danger)">Erreur de recherche</div>';
        }
    }

    function displayChargingResults(elements) {
        clearPOIMarkers();
        if (!elements || elements.length === 0) {
            $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Aucune borne a proximite</div>';
            return;
        }
        elements.forEach(el => { el._dist = haversine(userPosition.lat, userPosition.lng, el.lat, el.lon); });
        elements.sort((a, b) => a._dist - b._dist);
        $poiResults.innerHTML = elements.map(el => {
            const name = el.tags?.name || 'Borne de recharge';
            const operator = el.tags?.operator ? escapeHtml(el.tags.operator) : '';
            const capacity = el.tags?.capacity ? el.tags.capacity + ' bornes' : '';
            const sockets = [];
            if (el.tags?.['socket:type2'] === 'yes') sockets.push('Type 2');
            if (el.tags?.['socket:chademo'] === 'yes') sockets.push('CHAdeMO');
            if (el.tags?.['socket:ccs'] === 'yes' || el.tags?.['socket:type2_combo'] === 'yes') sockets.push('CCS');
            const extra = [operator, capacity, sockets.join(', ')].filter(Boolean).join(' · ');
            return `<div class="poi-item" data-lat="${el.lat}" data-lon="${el.lon}" data-name="${escapeHtml(name)}">
                <div class="poi-item-icon" style="color:#30d158"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                <div class="poi-item-text"><div class="poi-item-name">${escapeHtml(name)}</div><div class="poi-item-dist">${extra ? extra + ' · ' : ''}${formatDistance(el._dist)}</div></div>
            </div>`;
        }).join('');
        elements.forEach(el => {
            const marker = L.circleMarker([el.lat, el.lon], { radius: 8, fillColor: '#30d158', color: '#fff', weight: 2, fillOpacity: 0.9 }).bindPopup(el.tags?.name || 'Borne de recharge').addTo(map);
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

    async function searchQuickCharging() {
        if (!userPosition) return;
        const lat = userPosition.lat, lng = userPosition.lng;
        const query = `[out:json][timeout:10];node[amenity=charging_station](around:${POI_RADIUS},${lat},${lng});out body 15;`;
        try {
            const resp = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const elements = data.elements || [];
            if (elements.length === 0) {
                $quickPoiPopupResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Aucune borne a proximite</div>';
                return;
            }
            const results = elements.map(el => {
                const dist = haversine(userPosition.lat, userPosition.lng, el.lat, el.lon);
                const name = el.tags?.name || 'Borne de recharge';
                const extra = buildQuickPoiExtraInfo(el, 'charging');
                return { name, lat: el.lat, lon: el.lon, dist, extra };
            }).filter(Boolean).sort((a, b) => a.dist - b.dist);
            renderQuickPoiResults(results, 'charging');
        } catch (err) {
            $quickPoiPopupResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--danger)">Erreur de recherche</div>';
        }
    }

    // ===== FEATURE 10: CUSTOMIZABLE DASHBOARD =====
    function setupDashboardSettings() {
        const container = $('dashboard-config');
        if (!container) return;
        const items = ['speed', 'altitude', 'heading'];
        items.forEach(item => {
            const cb = $(`dashboard-${item}-toggle`);
            if (cb) {
                cb.checked = (settings.dashboardItems || []).includes(item);
                cb.addEventListener('change', () => {
                    if (cb.checked) {
                        if (!settings.dashboardItems.includes(item)) settings.dashboardItems.push(item);
                    } else {
                        settings.dashboardItems = settings.dashboardItems.filter(i => i !== item);
                    }
                    saveSettings();
                });
            }
        });
    }

    function updateDashboard() {
        if (!isNavigating) return;
        const dashEl = $('nav-dashboard');
        if (!dashEl) return;
        const items = settings.dashboardItems || ['speed', 'altitude', 'heading'];
        let html = '';
        items.forEach(item => {
            if (item === 'speed') {
                const kmh = (userPosition?.speed && userPosition.speed > 0) ? Math.round(userPosition.speed * 3.6) : 0;
                html += `<div class="dashboard-widget"><span class="dashboard-value">${kmh}</span><span class="dashboard-label">km/h</span></div>`;
            } else if (item === 'altitude') {
                const alt = currentAltitude != null ? Math.round(currentAltitude) : '--';
                html += `<div class="dashboard-widget"><span class="dashboard-value">${alt}</span><span class="dashboard-label">alt. m</span></div>`;
            } else if (item === 'heading') {
                const hdg = currentHeading != null ? Math.round(currentHeading) : '--';
                const compass = getCompassDirection(currentHeading);
                html += `<div class="dashboard-widget"><span class="dashboard-value">${hdg}° ${compass}</span><span class="dashboard-label">cap</span></div>`;
            }
        });
        dashEl.innerHTML = html;
        dashEl.classList.remove('hidden');
    }

    function hideDashboard() {
        const dashEl = $('nav-dashboard');
        if (dashEl) dashEl.classList.add('hidden');
    }

    function getCompassDirection(heading) {
        if (heading == null || isNaN(heading)) return '';
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
        const idx = Math.round(heading / 45) % 8;
        return dirs[idx];
    }

    // ===== FEATURE 11: KEYBOARD SHORTCUTS =====
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', handleKeyboardShortcut);
    }

    function handleKeyboardShortcut(e) {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            if (e.key === 'Escape') {
                e.target.blur();
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                closeAllPanels();
                break;
            case '/':
                e.preventDefault();
                switchView('search');
                $searchInput.focus();
                break;
            case 'l':
            case 'L':
                e.preventDefault();
                locateUser();
                startWatchingPosition();
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                $poiPanel.classList.toggle('hidden');
                break;
            case '1':
                e.preventDefault();
                switchView('map');
                break;
            case '2':
                e.preventDefault();
                switchView('search');
                break;
            case '3':
                e.preventDefault();
                switchView('settings');
                break;
            case ' ':
                e.preventDefault();
                if (isNavigating) stopNavigation();
                else if (routeData && !isNavigating) startNavigation();
                break;
            case '?':
                e.preventDefault();
                showShortcutsModal();
                break;
        }

        // Ctrl+K for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            switchView('search');
            $searchInput.focus();
        }
    }

    function closeAllPanels() {
        $poiPanel.classList.add('hidden');
        $shareModal.classList.add('hidden');
        $favoriteModal.classList.add('hidden');
        const isoDialog = document.getElementById('isochrone-dialog');
        if (isoDialog) isoDialog.remove();
        const shortcutsModal = document.getElementById('shortcuts-modal');
        if (shortcutsModal) shortcutsModal.remove();
        closeQuickPoiPopup();
        $searchResults.classList.add('hidden');
    }

    function showShortcutsModal() {
        const existing = document.getElementById('shortcuts-modal');
        if (existing) { existing.remove(); return; }
        const modal = document.createElement('div');
        modal.id = 'shortcuts-modal';
        modal.className = 'mapsi-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:340px">
                <div class="modal-header">
                    <span>Raccourcis clavier</span>
                    <button id="shortcuts-modal-close" aria-label="Fermer">&times;</button>
                </div>
                <div class="modal-body" style="font-size:14px">
                    <div style="display:grid;grid-template-columns:80px 1fr;gap:6px 12px;align-items:center">
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">Echap</kbd><span>Fermer les panneaux</span>
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">/</kbd><span>Rechercher</span>
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">Ctrl+K</kbd><span>Rechercher</span>
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">L</kbd><span>Ma position</span>
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">P</kbd><span>Points d'interet</span>
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">1</kbd><span>Vue carte</span>
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">2</kbd><span>Vue recherche</span>
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">3</kbd><span>Reglages</span>
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">Espace</kbd><span>Demarrer/Arreter nav.</span>
                        <kbd style="background:var(--bg-secondary);padding:4px 8px;border-radius:4px;text-align:center">?</kbd><span>Afficher cette aide</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#shortcuts-modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    // ===== FEATURE 12: OFFLINE ZONE DOWNLOAD =====
    function setupOfflineDownload() {
        const btn = $('offline-download-btn');
        if (!btn) return;
        btn.addEventListener('click', startOfflineDownload);
    }

    function getTileCoords(lat, lng, zoom) {
        const n = Math.pow(2, zoom);
        const x = Math.floor((lng + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x, y };
    }

    async function startOfflineDownload() {
        if (offlineDownloading) { showToast('Telechargement deja en cours', 'info'); return; }
        if (!map) return;

        const bounds = map.getBounds();
        const minLat = bounds.getSouth(), maxLat = bounds.getNorth();
        const minLng = bounds.getWest(), maxLng = bounds.getEast();

        // Calculate tile count for zoom 10-16
        let totalTiles = 0;
        for (let z = 10; z <= 16; z++) {
            const topLeft = getTileCoords(maxLat, minLng, z);
            const bottomRight = getTileCoords(minLat, maxLng, z);
            const xRange = Math.abs(bottomRight.x - topLeft.x) + 1;
            const yRange = Math.abs(bottomRight.y - topLeft.y) + 1;
            totalTiles += xRange * yRange;
        }

        if (totalTiles > 5000) {
            showToast(`Trop de tuiles (${totalTiles}). Zoomez pour reduire la zone.`, 'error');
            return;
        }

        if (!confirm(`Telecharger ${totalTiles} tuiles pour cette zone ?\nCela peut prendre quelques minutes.`)) return;

        offlineDownloading = true;
        showToast(`Telechargement de ${totalTiles} tuiles...`, 'info', 5000);

        const tileUrl = MAP_TILES[settings.mapStyle]?.url || MAP_TILES.standard.url;
        let downloaded = 0;
        let errors = 0;

        // Use service worker to cache tiles
        const sw = navigator.serviceWorker?.controller;

        for (let z = 10; z <= 16; z++) {
            const topLeft = getTileCoords(maxLat, minLng, z);
            const bottomRight = getTileCoords(minLat, maxLng, z);
            const xMin = Math.min(topLeft.x, bottomRight.x);
            const xMax = Math.max(topLeft.x, bottomRight.x);
            const yMin = Math.min(topLeft.y, bottomRight.y);
            const yMax = Math.max(topLeft.y, bottomRight.y);

            for (let x = xMin; x <= xMax; x++) {
                for (let y = yMin; y <= yMax; y++) {
                    const url = tileUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
                    try {
                        // Try to cache via SW message
                        if (sw) {
                            sw.postMessage({ type: 'CACHE_TILE', url });
                        } else {
                            // Fallback: just fetch to populate browser cache
                            await fetch(url, { mode: 'cors' });
                        }
                        downloaded++;
                    } catch (e) {
                        errors++;
                    }

                    // Progress update every 50 tiles
                    if (downloaded % 50 === 0) {
                        showToast(`Progression: ${downloaded}/${totalTiles} tuiles`, 'info', 2000);
                    }
                }
            }
        }

        offlineDownloading = false;
        showToast(`Telechargement termine: ${downloaded} tuiles${errors > 0 ? `, ${errors} erreurs` : ''}`, downloaded > 0 ? 'success' : 'error', 5000);
    }

    // ===== FEATURE 13: WEATHER (Open-Meteo) =====
    function setupWeather() {
        // Initial weather fetch when position available
    }

    function updateWeatherIfNeeded(lat, lng) {
        if (!lat || !lng) return;
        // Only update every 15 minutes or significant position change
        const now = Date.now();
        if (lastWeatherPos) {
            const distMoved = haversine(lat, lng, lastWeatherPos.lat, lastWeatherPos.lng);
            const timeSince = now - lastWeatherPos.time;
            if (distMoved < 5000 && timeSince < 900000) return; // 5km or 15min
        }
        lastWeatherPos = { lat, lng, time: now };
        fetchWeather(lat, lng);
    }

    async function fetchWeather(lat, lng) {
        try {
            const resp = await fetch(`${WEATHER_URL}/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (data.current_weather) {
                displayWeatherWidget(data.current_weather);
            }
        } catch (e) {
            // Silent fail
        }
    }

    function displayWeatherWidget(weather) {
        let widget = $('weather-widget');
        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'weather-widget';
            widget.style.cssText = 'position:absolute;top:env(safe-area-inset-top, 8px);right:8px;z-index:800;background:var(--bg-glass);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:12px;padding:8px 12px;font-size:13px;color:var(--text-primary);display:flex;align-items:center;gap:6px;pointer-events:none;';
            const mapContainer = document.getElementById('map-view');
            if (mapContainer) mapContainer.appendChild(widget);
        }
        const icon = getWeatherIcon(weather.weathercode);
        const temp = Math.round(weather.temperature);
        const wind = Math.round(weather.windspeed);
        widget.innerHTML = `<span style="font-size:18px">${icon}</span><span>${temp}°C</span><span style="opacity:0.6;font-size:11px">${wind} km/h</span>`;
    }

    function getWeatherIcon(code) {
        // WMO weather interpretation codes to simple text icons
        if (code === 0) return '☀️';
        if (code <= 3) return '⛅';
        if (code <= 48) return '🌫️';
        if (code <= 57) return '🌧️';
        if (code <= 67) return '🌧️';
        if (code <= 77) return '❄️';
        if (code <= 82) return '🌧️';
        if (code <= 86) return '❄️';
        if (code >= 95) return '⛈️';
        return '🌤️';
    }

    async function fetchDestinationWeather() {
        if (!destination) return;
        try {
            const resp = await fetch(`${WEATHER_URL}/v1/forecast?latitude=${destination.lat}&longitude=${destination.lon}&current_weather=true`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (data.current_weather) {
                const icon = getWeatherIcon(data.current_weather.weathercode);
                const temp = Math.round(data.current_weather.temperature);
                const weatherInfo = $('nav-weather-info');
                if (weatherInfo) {
                    weatherInfo.innerHTML = `${icon} ${temp}°C`;
                    weatherInfo.classList.remove('hidden');
                }
            }
        } catch (e) {}
    }

    // ===== FEATURE 14: VEHICLE PROFILE =====
    function setupVehicleProfileSettings() {
        const fields = ['height', 'weight', 'width', 'length'];
        fields.forEach(field => {
            const input = $(`vehicle-${field}`);
            if (input) {
                if (settings.vehicleProfile && settings.vehicleProfile[field]) {
                    input.value = settings.vehicleProfile[field];
                }
                input.addEventListener('change', () => {
                    const val = parseFloat(input.value);
                    if (!settings.vehicleProfile) settings.vehicleProfile = { height: null, weight: null, width: null, length: null };
                    settings.vehicleProfile[field] = (isNaN(val) || val <= 0) ? null : val;
                    saveSettings();
                    if (destination && userPosition) calculateRoute();
                });
            }
        });
    }

    // ===== FEATURE 15: CROSS-DEVICE FAVORITES SYNC =====
    function setupSyncSettings() {
        const toggle = $('sync-toggle');
        if (toggle) {
            toggle.checked = settings.syncEnabled;
            toggle.addEventListener('change', () => {
                settings.syncEnabled = toggle.checked;
                saveSettings();
                if (toggle.checked) {
                    syncFavoritesPush();
                    syncSettingsPush();
                }
            });
        }
    }

    async function syncFavoritesPush() {
        if (!settings.syncEnabled) return;
        try {
            await fetch('/api/sync/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(favorites)
            });
        } catch (e) {
            // Silent failure
        }
    }

    async function syncFavoritesPull() {
        if (!settings.syncEnabled) return;
        try {
            const resp = await fetch('/api/sync/favorites');
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data) && data.length > 0) {
                    favorites = data;
                    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) {}
                }
            }
        } catch (e) {
            // Silent failure - use localStorage data
        }
    }

    async function syncSettingsPush() {
        if (!settings.syncEnabled) return;
        try {
            await fetch('/api/sync/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
        } catch (e) {
            // Silent failure
        }
    }

    async function syncSettingsPull() {
        if (!settings.syncEnabled) return;
        try {
            const resp = await fetch('/api/sync/settings');
            if (resp.ok) {
                const data = await resp.json();
                if (data && typeof data === 'object') {
                    settings = { ...settings, ...data };
                    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
                    applySettings();
                }
            }
        } catch (e) {
            // Silent failure
        }
    }

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
