// ==========================================
// MapsI PWA v2.0 - Navigation GPS avec OpenStreetMap
// 12 fonctionnalités avancées
// ==========================================

(function() {
    'use strict';

    // ===== REGISTER SERVICE WORKER =====
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // ===== CONFIG =====
    const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
    const OSRM_URL = 'https://router.project-osrm.org';
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
    const REROUTE_THRESHOLD = 50; // meters off route before reroute
    const POI_RADIUS = 5000; // meters

    // ===== SETTINGS (defaults) =====
    let settings = {
        theme: 'system', // 'system', 'dark', 'light'
        voiceEnabled: true,
        autoReroute: true,
        showSpeed: true
    };

    // ===== STATE =====
    let map, tileLayer;
    let userMarker, destMarker;
    let routeLayer, routeShadowLayer;
    let altRouteLayers = [];
    let poiMarkers = [];
    let userPosition = null;
    let destination = null;
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

    // Long press state
    let longPressTimer = null;
    let longPressStartX = 0;
    let longPressStartY = 0;

    // ===== DOM ELEMENTS =====
    const $ = id => document.getElementById(id);
    const $mapView = $('map-view');
    const $searchView = $('search-view');
    const $settingsView = $('settings-view');
    const $searchInput = $('search-input');
    const $searchClear = $('search-clear');
    const $searchResults = $('search-results');
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
    const $remainingDistance = $('remaining-distance');
    const $remainingTime = $('remaining-time');
    const $etaTime = $('eta-time');
    const $speedDisplay = $('speed-display');
    const $speedValue = $('speed-value');
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
    const $voiceToggle = $('voice-toggle');
    const $autoRerouteToggle = $('auto-reroute-toggle');
    const $showSpeedToggle = $('show-speed-toggle');

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
        renderHistory();
        renderFavorites();
    }

    // ===== SETTINGS (9. Page Parametres + 7. Mode jour/nuit) =====
    function loadSettings() {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Migrate old darkMode boolean to theme string
                if ('darkMode' in parsed && !('theme' in parsed)) {
                    parsed.theme = parsed.darkMode ? 'dark' : 'light';
                    delete parsed.darkMode;
                }
                settings = { ...settings, ...parsed };
            }
        } catch (e) {}
    }

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {}
    }

    function isDarkMode() {
        if (settings.theme === 'dark') return true;
        if (settings.theme === 'light') return false;
        // system
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function applySettings() {
        // Theme
        const dark = isDarkMode();
        document.body.classList.toggle('light-mode', !dark);
        $themeSelect.value = settings.theme;

        // Map tiles
        const tilePane = document.querySelector('.leaflet-tile-pane');
        if (tilePane) tilePane.classList.toggle('dark-tiles', dark);

        // Voice
        $voiceToggle.checked = settings.voiceEnabled;

        // Auto reroute
        $autoRerouteToggle.checked = settings.autoReroute;

        // Show speed
        $showSpeedToggle.checked = settings.showSpeed;

        // Update theme-color meta
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.content = dark ? '#1a1a2e' : '#f2f2f7';
        }
    }

    function setupSettingsEvents() {
        $themeSelect.addEventListener('change', () => {
            settings.theme = $themeSelect.value;
            applySettings();
            saveSettings();
        });

        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (settings.theme === 'system') applySettings();
            });
        }

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

        if (view === 'map') {
            setTimeout(() => map.invalidateSize(), 100);
        } else if (view === 'search') {
            renderHistory();
            renderFavorites();
        }
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
        } catch (e) {
            searchHistory = [];
        }
    }

    function saveHistory() {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory));
        } catch (e) {}
    }

    function addToHistory(item) {
        searchHistory = searchHistory.filter(h =>
            !(h.lat === item.lat && h.lon === item.lon)
        );
        searchHistory.unshift({
            name: item.name,
            address: item.address || '',
            lat: item.lat,
            lon: item.lon,
            timestamp: Date.now()
        });
        if (searchHistory.length > MAX_HISTORY) {
            searchHistory = searchHistory.slice(0, MAX_HISTORY);
        }
        saveHistory();
    }

    function clearHistory() {
        searchHistory = [];
        saveHistory();
        renderHistory();
    }

    function renderHistory() {
        if (searchHistory.length === 0) {
            $historyList.innerHTML = '';
            $historyEmpty.classList.remove('hidden');
            return;
        }

        $historyEmpty.classList.add('hidden');
        $historyList.innerHTML = searchHistory.map((item, i) => `
            <div class="history-item" data-index="${i}">
                <div class="history-icon">
                    <svg viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="history-text">
                    <div class="history-name">${escapeHtml(item.name)}</div>
                    ${item.address ? `<div class="history-address">${escapeHtml(item.address)}</div>` : ''}
                </div>
            </div>
        `).join('');

        $historyList.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => {
                const item = searchHistory[parseInt(el.dataset.index)];
                if (item) selectHistoryItem(item);
            });
        });
    }

    function selectHistoryItem(item) {
        switchView('map');
        $searchInput.value = item.name;
        $searchClear.classList.remove('hidden');
        setDestination(item.lat, item.lon, item.name);
        addToHistory(item);
    }

    function setupHistoryEvents() {
        $historyClearBtn.addEventListener('click', () => {
            if (confirm('Effacer tout l\'historique ?')) clearHistory();
        });
    }

    // ===== FAVORITES (6. Favoris) =====
    function loadFavorites() {
        try {
            const saved = localStorage.getItem(FAVORITES_KEY);
            favorites = saved ? JSON.parse(saved) : [];
        } catch (e) {
            favorites = [];
        }
    }

    function saveFavorites() {
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        } catch (e) {}
    }

    function renderFavorites() {
        if (favorites.length === 0) {
            $favoritesList.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:14px;text-align:center;grid-column:1/-1">Aucun favori</div>';
            return;
        }

        const iconSVGs = {
            home: '<path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
            work: '<rect x="2" y="7" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
            star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
            heart: '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="none" stroke="currentColor" stroke-width="1.5"/>'
        };

        $favoritesList.innerHTML = favorites.map((fav, i) => `
            <div class="favorite-item" data-index="${i}">
                <div class="favorite-icon">
                    <svg viewBox="0 0 24 24">${iconSVGs[fav.icon] || iconSVGs.star}</svg>
                </div>
                <div class="favorite-name">${escapeHtml(fav.name)}</div>
            </div>
        `).join('');

        $favoritesList.querySelectorAll('.favorite-item').forEach(el => {
            el.addEventListener('click', () => {
                const fav = favorites[parseInt(el.dataset.index)];
                if (fav) {
                    switchView('map');
                    $searchInput.value = fav.name;
                    $searchClear.classList.remove('hidden');
                    setDestination(fav.lat, fav.lon, fav.name);
                }
            });
        });
    }

    let selectedFavIcon = 'home';

    function setupFavoriteEvents() {
        $addFavoriteBtn.addEventListener('click', () => {
            if (!userPosition) {
                alert('Position non disponible');
                return;
            }
            $favoriteName.value = '';
            selectedFavIcon = 'home';
            document.querySelectorAll('.fav-icon-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.icon === 'home');
            });
            $favoriteModal.classList.remove('hidden');
        });

        $favoriteModalClose.addEventListener('click', () => {
            $favoriteModal.classList.add('hidden');
        });

        $favoriteModal.addEventListener('click', (e) => {
            if (e.target === $favoriteModal) $favoriteModal.classList.add('hidden');
        });

        document.querySelectorAll('.fav-icon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedFavIcon = btn.dataset.icon;
                document.querySelectorAll('.fav-icon-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });
            });
        });

        $saveFavoriteBtn.addEventListener('click', () => {
            const name = $favoriteName.value.trim();
            if (!name) {
                alert('Entrez un nom pour le favori');
                return;
            }
            if (!userPosition) return;

            favorites.push({
                name,
                icon: selectedFavIcon,
                lat: userPosition.lat,
                lon: userPosition.lng
            });
            saveFavorites();
            renderFavorites();
            $favoriteModal.classList.add('hidden');
        });
    }

    // ===== SHARE (11. Partager position) =====
    function setupShareEvents() {
        $navShareBtn.addEventListener('click', () => {
            $shareModal.classList.remove('hidden');
        });

        $shareModalClose.addEventListener('click', () => {
            $shareModal.classList.add('hidden');
        });

        $shareModal.addEventListener('click', (e) => {
            if (e.target === $shareModal) $shareModal.classList.add('hidden');
        });

        $sharePositionBtn.addEventListener('click', () => {
            if (!userPosition) {
                alert('Position non disponible');
                return;
            }
            const url = `https://www.openstreetmap.org/?mlat=${userPosition.lat}&mlon=${userPosition.lng}#map=16/${userPosition.lat}/${userPosition.lng}`;
            shareContent('Ma position', url);
            $shareModal.classList.add('hidden');
        });

        $shareRouteBtn.addEventListener('click', () => {
            if (!userPosition || !destination) {
                alert('Aucun itineraire actif');
                return;
            }
            const url = `https://www.openstreetmap.org/directions?from=${userPosition.lat},${userPosition.lng}&to=${destination.lat},${destination.lon}`;
            shareContent('Mon itineraire MapsI', url);
            $shareModal.classList.add('hidden');
        });
    }

    function shareContent(title, url) {
        if (navigator.share) {
            navigator.share({ title, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url).then(() => {
                alert('Lien copie dans le presse-papiers !');
            }).catch(() => {
                alert(url);
            });
        }
    }

    // ===== POI (12. Points d'interet) =====
    function setupPOIEvents() {
        $poiBtn.addEventListener('click', () => {
            $poiPanel.classList.toggle('hidden');
        });

        $poiClose.addEventListener('click', () => {
            $poiPanel.classList.add('hidden');
            clearPOIMarkers();
        });

        document.querySelectorAll('.poi-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.poi-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                searchPOI(btn.dataset.cat);
            });
        });
    }

    const POI_QUERIES = {
        fuel: '[amenity=fuel]',
        restaurant: '[amenity=restaurant]',
        parking: '[amenity=parking]',
        pharmacy: '[amenity=pharmacy]'
    };

    async function searchPOI(category) {
        if (!userPosition) {
            alert('Position non disponible');
            return;
        }

        $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Recherche...</div>';

        const query = POI_QUERIES[category];
        const lat = userPosition.lat;
        const lng = userPosition.lng;
        const overpassData = `[out:json][timeout:10];node${query}(around:${POI_RADIUS},${lat},${lng});out body 10;`;
        const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassData)}`;

        try {
            const resp = await fetch(overpassUrl);
            const data = await resp.json();
            displayPOIResults(data.elements, category);
        } catch (err) {
            $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--danger)">Erreur de recherche</div>';
        }
    }

    function displayPOIResults(elements, category) {
        clearPOIMarkers();

        if (!elements || elements.length === 0) {
            $poiResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">Aucun resultat a proximite</div>';
            return;
        }

        // Sort by distance
        elements.forEach(el => {
            el._dist = haversine(userPosition.lat, userPosition.lng, el.lat, el.lon);
        });
        elements.sort((a, b) => a._dist - b._dist);

        $poiResults.innerHTML = elements.map((el, i) => {
            const name = el.tags?.name || category.charAt(0).toUpperCase() + category.slice(1);
            const dist = formatDistance(el._dist);
            return `
                <div class="poi-item" data-index="${i}" data-lat="${el.lat}" data-lon="${el.lon}" data-name="${escapeHtml(name)}">
                    <div class="poi-item-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg>
                    </div>
                    <div class="poi-item-text">
                        <div class="poi-item-name">${escapeHtml(name)}</div>
                        <div class="poi-item-dist">${dist}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Add markers on map
        elements.forEach(el => {
            const name = el.tags?.name || category;
            const marker = L.circleMarker([el.lat, el.lon], {
                radius: 8,
                fillColor: '#ff9f0a',
                color: '#fff',
                weight: 2,
                fillOpacity: 0.9
            }).bindPopup(name).addTo(map);
            poiMarkers.push(marker);
        });

        // Click handlers
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

    function clearPOIMarkers() {
        poiMarkers.forEach(m => map.removeLayer(m));
        poiMarkers = [];
    }

    // ===== INIT MAP =====
    function initMap() {
        map = L.map('map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: false,
            attributionControl: true
        });

        tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        }).addTo(map);

        // Apply theme to tiles after map init
        setTimeout(() => applySettings(), 100);

        setupMapEvents();
        autoLocateOnLoad();
    }

    function autoLocateOnLoad() {
        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
            pos => {
                updateUserPosition(pos);
                map.setView([pos.coords.latitude, pos.coords.longitude], 15);
                startWatchingPosition();
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
    }

    // ===== USER LOCATION =====
    function locateUser() {
        if (!navigator.geolocation) return;

        showLoading();
        navigator.geolocation.getCurrentPosition(
            pos => {
                hideLoading();
                updateUserPosition(pos);
                map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.8 });
            },
            err => {
                hideLoading();
                if (err.code === 1 && !locationErrorShown) {
                    locationErrorShown = true;
                    alert('Permission refusee.\n\nActivez la localisation dans les reglages.');
                } else if (err.code === 2) {
                    alert('Position indisponible.');
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    }

    function startWatchingPosition() {
        if (watchId !== null || !navigator.geolocation) return;

        watchId = navigator.geolocation.watchPosition(
            pos => {
                updateUserPosition(pos);
                if (isNavigating) updateNavigation(pos);
            },
            () => {},
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
        );
        isTracking = true;
        $locateBtn.classList.add('tracking');
    }

    function stopWatchingPosition() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        isTracking = false;
        $locateBtn.classList.remove('tracking');
    }

    function updateUserPosition(pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speed = pos.coords.speed;
        userPosition = { lat, lng, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed };

        const latlng = [lat, lng];
        const icon = isNavigating ? createNavIcon() : createDotIcon();

        if (!userMarker) {
            userMarker = L.marker(latlng, { icon: icon, zIndexOffset: 1000 }).addTo(map);
        } else {
            userMarker.setLatLng(latlng);
            userMarker.setIcon(icon);
        }

        // 4. Speed display
        updateSpeedDisplay(speed);
    }

    // ===== 4. SPEED DISPLAY =====
    function updateSpeedDisplay(speed) {
        if (!isNavigating || !settings.showSpeed) {
            $speedDisplay.classList.add('hidden');
            return;
        }

        $speedDisplay.classList.remove('hidden');
        const kmh = (speed && speed > 0) ? Math.round(speed * 3.6) : 0;
        $speedValue.textContent = kmh;
    }

    function createDotIcon() {
        return L.divIcon({
            className: '',
            html: '<div class="user-location-pulse"></div><div class="user-location-dot"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
    }

    function createNavIcon() {
        return L.divIcon({
            className: 'user-nav-marker',
            html: `<svg viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="#0a84ff" stroke="white" stroke-width="4"/>
                <polygon points="24,8 32,28 24,24 16,28" fill="white"/>
            </svg>`,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
        });
    }

    // ===== MAP EVENTS =====
    function setupMapEvents() {
        const mapEl = document.getElementById('map');
        mapEl.addEventListener('touchstart', handleTouchStart, { passive: false });
        mapEl.addEventListener('touchmove', handleTouchMove, { passive: true });
        mapEl.addEventListener('touchend', handleTouchEnd, { passive: true });
        mapEl.addEventListener('touchcancel', handleTouchEnd, { passive: true });

        map.on('click', () => {
            $searchResults.classList.add('hidden');
            $searchInput.blur();
        });
    }

    function handleTouchStart(e) {
        if (isNavigating || e.touches.length !== 1) return;
        const touch = e.touches[0];
        longPressStartX = touch.clientX;
        longPressStartY = touch.clientY;
        longPressTimer = setTimeout(() => {
            handleLongPress(touch.clientX, touch.clientY);
        }, LONG_PRESS_DURATION);
    }

    function handleTouchMove(e) {
        if (!longPressTimer) return;
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - longPressStartX);
        const dy = Math.abs(touch.clientY - longPressStartY);
        if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function handleTouchEnd() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function handleLongPress(clientX, clientY) {
        if (navigator.vibrate) navigator.vibrate(50);
        const containerPoint = L.point(clientX, clientY);
        const layerPoint = map.containerPointToLayerPoint(containerPoint);
        const latlng = map.layerPointToLatLng(layerPoint);
        if (latlng) reverseGeocode(latlng.lat, latlng.lng);
    }

    // ===== SEARCH =====
    function debounceSearch(query) {
        clearTimeout(searchTimeout);
        if (!query || query.length < 2) {
            $searchResults.classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(() => searchAddress(query), SEARCH_DEBOUNCE);
    }

    async function searchAddress(query) {
        try {
            const params = new URLSearchParams({
                q: query, format: 'json', addressdetails: '1', limit: '8', 'accept-language': 'fr'
            });
            if (userPosition) {
                params.set('viewbox', `${userPosition.lng - 1},${userPosition.lat + 1},${userPosition.lng + 1},${userPosition.lat - 1}`);
                params.set('bounded', '0');
            }
            const resp = await fetch(`${NOMINATIM_URL}/search?${params}`, {
                headers: { 'User-Agent': 'MapsI-PWA/2.0' }
            });
            const data = await resp.json();
            displayResults(data);
        } catch (err) {
            console.error('Search error:', err);
        }
    }

    function displayResults(results) {
        if (!results || results.length === 0) {
            $searchResults.innerHTML = '<div style="padding:16px;color:var(--text-secondary);text-align:center">Aucun resultat</div>';
            $searchResults.classList.remove('hidden');
            return;
        }

        $searchResults.innerHTML = results.map((r, i) => {
            const name = r.display_name.split(',')[0];
            const address = r.display_name.split(',').slice(1, 3).join(',').trim();
            return `
                <div class="search-result-item" data-index="${i}" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escapeHtml(name)}" data-address="${escapeHtml(address)}">
                    <svg class="result-pin" viewBox="0 0 24 24">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="currentColor"/>
                    </svg>
                    <div class="result-text">
                        <div class="result-name">${escapeHtml(name)}</div>
                        <div class="result-address">${escapeHtml(address)}</div>
                    </div>
                </div>
            `;
        }).join('');

        $searchResults.classList.remove('hidden');
        $searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => selectResult(item));
        });
    }

    function selectResult(item) {
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        const name = item.dataset.name;
        const address = item.dataset.address;

        $searchInput.value = name;
        $searchResults.classList.add('hidden');
        $searchClear.classList.remove('hidden');

        addToHistory({ name, address, lat, lon });
        switchView('map');
        setDestination(lat, lon, name);
    }

    async function reverseGeocode(lat, lon) {
        showLoading();
        try {
            const resp = await fetch(
                `${NOMINATIM_URL}/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr`,
                { headers: { 'User-Agent': 'MapsI-PWA/2.0' } }
            );
            const data = await resp.json();
            hideLoading();
            const name = data.display_name?.split(',')[0] || 'Destination';
            const address = data.display_name?.split(',').slice(1, 3).join(',').trim() || '';

            addToHistory({ name, address, lat, lon });
            setDestination(lat, lon, name);
            $searchInput.value = name;
            $searchClear.classList.remove('hidden');
        } catch (err) {
            hideLoading();
            setDestination(lat, lon, 'Destination');
        }
    }

    // ===== SET DESTINATION =====
    function setDestination(lat, lon, name) {
        destination = { lat, lon, name };

        if (destMarker) map.removeLayer(destMarker);

        const destIcon = L.divIcon({
            className: 'destination-marker',
            html: `<svg viewBox="0 0 24 36">
                <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#ff453a"/>
                <circle cx="12" cy="12" r="5" fill="white"/>
            </svg>`,
            iconSize: [32, 40],
            iconAnchor: [16, 40]
        });

        destMarker = L.marker([lat, lon], { icon: destIcon }).addTo(map);
        map.flyTo([lat, lon], 15, { duration: 0.8 });

        if (userPosition) {
            calculateRoute();
        } else {
            navigator.geolocation?.getCurrentPosition(
                pos => {
                    updateUserPosition(pos);
                    calculateRoute();
                },
                () => alert('Activez la localisation pour calculer l\'itineraire'),
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    }

    // ===== ROUTING (10. Routes alternatives + 1. ETA) =====
    async function calculateRoute() {
        if (!userPosition || !destination) return;

        showLoading();

        const profile = transportMode === 'walking' ? 'foot' : transportMode === 'cycling' ? 'bike' : 'car';
        const url = `${OSRM_URL}/route/v1/${profile}/${userPosition.lng},${userPosition.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;

        try {
            const resp = await fetch(url);
            const data = await resp.json();
            hideLoading();

            if (data.code !== 'Ok' || !data.routes.length) {
                alert('Impossible de calculer le trajet');
                return;
            }

            allRoutes = data.routes;
            selectedRouteIndex = 0;
            selectRoute(0);

            const coords = allRoutes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds, { padding: [60, 60] });

            // Show alternatives
            displayRouteAlternatives();
            showNavPanel();

        } catch (err) {
            hideLoading();
            alert('Erreur de calcul du trajet');
        }
    }

    function selectRoute(index) {
        selectedRouteIndex = index;
        routeData = allRoutes[index];
        routeSteps = routeData.legs[0].steps;
        currentStepIndex = 0;

        // Clear old route layers
        clearAltRouteLayers();
        if (routeLayer) map.removeLayer(routeLayer);
        if (routeShadowLayer) map.removeLayer(routeShadowLayer);

        // Draw alternative routes first (behind)
        allRoutes.forEach((route, i) => {
            if (i !== index) {
                const altLayer = L.geoJSON(route.geometry, {
                    style: { color: '#888', weight: 4, opacity: 0.4, dashArray: '8,8' }
                }).addTo(map);
                altLayer.on('click', () => {
                    selectRoute(i);
                    displayRouteAlternatives();
                    showNavPanel();
                });
                altRouteLayers.push(altLayer);
            }
        });

        // Draw main route
        drawRoute(routeData.geometry);
    }

    function clearAltRouteLayers() {
        altRouteLayers.forEach(l => map.removeLayer(l));
        altRouteLayers = [];
    }

    function displayRouteAlternatives() {
        if (allRoutes.length <= 1) {
            $routeAlternatives.classList.add('hidden');
            return;
        }

        $routeAlternatives.classList.remove('hidden');
        $routeAlternatives.innerHTML = allRoutes.map((route, i) => `
            <div class="route-option ${i === selectedRouteIndex ? 'active' : ''}" data-route="${i}">
                <span class="route-time">${formatDuration(route.duration)}</span>
                <span class="route-dist">${formatDistance(route.distance)}</span>
            </div>
        `).join('');

        $routeAlternatives.querySelectorAll('.route-option').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.route);
                selectRoute(idx);
                displayRouteAlternatives();
                showNavPanel();
            });
        });
    }

    function drawRoute(geometry) {
        if (routeLayer) map.removeLayer(routeLayer);
        if (routeShadowLayer) map.removeLayer(routeShadowLayer);

        routeShadowLayer = L.geoJSON(geometry, {
            style: { color: '#000', weight: 8, opacity: 0.15 }
        }).addTo(map);

        const color = transportMode === 'walking' ? '#30d158' : transportMode === 'cycling' ? '#ff9f0a' : '#0a84ff';
        routeLayer = L.geoJSON(geometry, {
            style: { color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }
        }).addTo(map);
    }

    function showNavPanel() {
        $navDistance.textContent = formatDistance(routeData.distance);
        $navDuration.textContent = formatDuration(routeData.duration);

        // 1. ETA
        $navEta.textContent = 'Arr. ' + calculateETA(routeData.duration);

        if (routeSteps.length > 0) {
            $navStepText.textContent = translateManeuver(routeSteps[0].maneuver.type, routeSteps[0].maneuver.modifier, routeSteps[0].name);
        }

        $transportModes.classList.remove('hidden');
        $navPanel.classList.remove('hidden');
    }

    // ===== 1. ETA CALCULATION =====
    function calculateETA(durationSeconds) {
        const arrival = new Date(Date.now() + durationSeconds * 1000);
        const h = arrival.getHours().toString().padStart(2, '0');
        const m = arrival.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    // ===== ACTIVE NAVIGATION =====
    function startNavigation() {
        isNavigating = true;
        currentStepIndex = 0;
        lastSpokenStep = -1;

        $navPanel.classList.add('hidden');
        $transportModes.classList.add('hidden');
        $routeAlternatives.classList.add('hidden');
        $activeNav.classList.remove('hidden');
        $locateBtn.classList.add('nav-hidden');
        document.body.classList.add('navigating');

        // Hide alt routes
        clearAltRouteLayers();

        startWatchingPosition();
        updateNavigationDisplay();

        if (userPosition) {
            map.setView([userPosition.lat, userPosition.lng], NAV_ZOOM);
            if (userMarker) userMarker.setIcon(createNavIcon());
        }

        // Speed display
        if (settings.showSpeed) {
            $speedDisplay.classList.remove('hidden');
        }

        // Wake lock
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen').catch(() => {});
        }

        // 2. Voice: announce first step
        speakStep(0);
    }

    function stopNavigation() {
        isNavigating = false;
        $activeNav.classList.add('hidden');
        $speedDisplay.classList.add('hidden');
        $locateBtn.classList.remove('nav-hidden');
        document.body.classList.remove('navigating');
        stopWatchingPosition();

        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        if (routeShadowLayer) { map.removeLayer(routeShadowLayer); routeShadowLayer = null; }
        if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
        clearAltRouteLayers();
        clearPOIMarkers();

        if (userMarker && userPosition) {
            userMarker.setIcon(createDotIcon());
        }

        if (userPosition) map.setView([userPosition.lat, userPosition.lng], 15);

        $transportModes.classList.add('hidden');
        $searchInput.value = '';
        $searchClear.classList.add('hidden');
        destination = null;
        routeData = null;
        routeSteps = [];
        allRoutes = [];

        if (rerouteTimeout) {
            clearTimeout(rerouteTimeout);
            rerouteTimeout = null;
        }
    }

    function updateNavigation(pos) {
        if (!routeSteps.length) return;

        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        const step = routeSteps[currentStepIndex];
        if (!step) return;

        const stepEnd = step.maneuver.location;
        const dist = haversine(userLat, userLng, stepEnd[1], stepEnd[0]);

        // Advance step
        if (dist < 30 && currentStepIndex < routeSteps.length - 1) {
            currentStepIndex++;
            updateNavigationDisplay();
            if (navigator.vibrate) navigator.vibrate(100);
            // 2. Voice guidance
            speakStep(currentStepIndex);
        }

        // Update distance to next maneuver
        const nextStep = routeSteps[currentStepIndex];
        if (nextStep) {
            const nextDist = haversine(userLat, userLng, nextStep.maneuver.location[1], nextStep.maneuver.location[0]);
            $activeNavDistance.textContent = formatDistance(nextDist);
        }

        // 5. Remaining distance + time
        updateRemainingInfo(userLat, userLng);

        // Center map
        map.setView([userLat, userLng], NAV_ZOOM, { animate: true, duration: 0.5 });

        // 3. Auto-reroute: check if off route
        if (settings.autoReroute) {
            checkOffRoute(userLat, userLng);
        }

        // Check arrival
        const destDist = haversine(userLat, userLng, destination.lat, destination.lon);
        if (destDist < 30) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            speak('Vous etes arrive a destination');
            alert('Vous etes arrive !');
            stopNavigation();
        }
    }

    // ===== 5. REMAINING DISTANCE + TIME =====
    function updateRemainingInfo(userLat, userLng) {
        // Sum remaining step distances
        let remainDist = 0;
        let remainTime = 0;
        for (let i = currentStepIndex; i < routeSteps.length; i++) {
            remainDist += routeSteps[i].distance;
            remainTime += routeSteps[i].duration;
        }

        // Subtract distance already covered in current step
        if (routeSteps[currentStepIndex]) {
            const stepLoc = routeSteps[currentStepIndex].maneuver.location;
            const coveredDist = routeSteps[currentStepIndex].distance - haversine(userLat, userLng, stepLoc[1], stepLoc[0]);
            if (coveredDist > 0) {
                remainDist = Math.max(0, remainDist - coveredDist);
            }
        }

        $remainingDistance.textContent = formatDistance(remainDist);
        $remainingTime.textContent = formatDuration(remainTime);
        $etaTime.textContent = calculateETA(remainTime);
    }

    // ===== 3. AUTO-REROUTE =====
    function checkOffRoute(userLat, userLng) {
        if (!routeData || !routeData.geometry) return;

        const coords = routeData.geometry.coordinates;
        let minDist = Infinity;

        // Check distance to route polyline (sample every 3 points for perf)
        for (let i = 0; i < coords.length; i += 3) {
            const d = haversine(userLat, userLng, coords[i][1], coords[i][0]);
            if (d < minDist) minDist = d;
        }

        if (minDist > REROUTE_THRESHOLD) {
            // Debounce reroute
            if (!rerouteTimeout) {
                rerouteTimeout = setTimeout(() => {
                    rerouteTimeout = null;
                    speak('Recalcul de l\'itineraire');
                    calculateRoute().then(() => {
                        if (isNavigating) {
                            updateNavigationDisplay();
                        }
                    });
                }, 2000);
            }
        } else if (rerouteTimeout) {
            clearTimeout(rerouteTimeout);
            rerouteTimeout = null;
        }
    }

    // ===== 8. SVG MANEUVER ICONS =====
    function updateNavigationDisplay() {
        const step = routeSteps[currentStepIndex];
        if (!step) return;

        const maneuver = step.maneuver;
        $activeNavIcon.innerHTML = getManeuverSVG(maneuver.type, maneuver.modifier);
        $activeNavStreet.textContent = step.name || 'Route';
        $activeNavDistance.textContent = formatDistance(step.distance);
    }

    function getManeuverSVG(type, modifier) {
        let path = '';

        if (type === 'arrive') {
            path = '<circle cx="12" cy="12" r="4" fill="white"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="white" stroke-width="2.5" stroke-linecap="round"/>';
        } else if (type === 'depart') {
            path = '<path d="M12 19V5M12 5l-5 5M12 5l5 5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        } else if (type === 'roundabout' || type === 'rotary') {
            path = '<circle cx="12" cy="12" r="5" fill="none" stroke="white" stroke-width="2.5"/><path d="M12 7V3M12 3l-2 2M12 3l2 2" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        } else if (modifier?.includes('sharp left') || modifier?.includes('uturn')) {
            path = '<path d="M18 18V9a5 5 0 00-10 0v1M8 6L4 10l4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        } else if (modifier?.includes('left')) {
            path = '<path d="M18 18v-7a3 3 0 00-3-3H7M7 8L3 12l4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        } else if (modifier?.includes('sharp right')) {
            path = '<path d="M6 18V9a5 5 0 0110 0v1M16 6l4 4-4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        } else if (modifier?.includes('right')) {
            path = '<path d="M6 18v-7a3 3 0 013-3h10M17 8l4 4-4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        } else {
            // Straight
            path = '<path d="M12 19V5M12 5l-4 4M12 5l4 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        }

        return `<div class="maneuver-icon"><svg viewBox="0 0 24 24">${path}</svg></div>`;
    }

    // ===== 2. VOICE GUIDANCE (TTS) =====
    function speakStep(stepIndex) {
        if (!settings.voiceEnabled || stepIndex === lastSpokenStep) return;
        lastSpokenStep = stepIndex;

        const step = routeSteps[stepIndex];
        if (!step) return;

        const text = translateManeuver(step.maneuver.type, step.maneuver.modifier, step.name);
        speak(text);
    }

    function speak(text) {
        if (!settings.voiceEnabled || !('speechSynthesis' in window)) return;

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fr-FR';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }

    function selectTransportMode(mode) {
        transportMode = mode;
        document.querySelectorAll('.transport-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        if (destination && userPosition) calculateRoute();
    }

    // ===== HELPERS =====
    function formatDistance(meters) {
        if (meters >= 1000) return (meters / 1000).toFixed(1) + ' km';
        return Math.round(meters) + ' m';
    }

    function formatDuration(seconds) {
        if (seconds < 60) return '< 1 min';
        const h = Math.floor(seconds / 3600);
        const m = Math.round((seconds % 3600) / 60);
        if (h > 0) return h + ' h ' + m + ' min';
        return m + ' min';
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function translateManeuver(type, modifier, street) {
        const name = street || 'la route';
        const turns = {
            'turn-left': 'Tournez a gauche',
            'turn-right': 'Tournez a droite',
            'turn-slight left': 'Legere gauche',
            'turn-slight right': 'Legere droite',
            'turn-sharp left': 'Tournez fortement a gauche',
            'turn-sharp right': 'Tournez fortement a droite',
            'continue-': 'Continuez tout droit',
            'depart-': 'Depart',
            'arrive-': 'Vous etes arrive',
            'roundabout-': 'Au rond-point',
            'merge-': 'Rejoignez',
            'fork-left': 'Prenez a gauche',
            'fork-right': 'Prenez a droite',
        };
        const key = type + '-' + (modifier || '');
        const action = turns[key] || turns[type + '-'] || 'Continuez';
        return `${action} sur ${name}`;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function showLoading() { $loading.classList.remove('hidden'); }
    function hideLoading() { $loading.classList.add('hidden'); }

    // ===== EVENT LISTENERS =====
    $searchInput.addEventListener('input', e => {
        const val = e.target.value.trim();
        $searchClear.classList.toggle('hidden', val.length === 0);
        debounceSearch(val);
    });

    $searchInput.addEventListener('focus', () => {
        if ($searchInput.value.trim().length >= 2) {
            debounceSearch($searchInput.value.trim());
        }
    });

    $searchClear.addEventListener('click', () => {
        $searchInput.value = '';
        $searchClear.classList.add('hidden');
        $searchResults.classList.add('hidden');
        $searchInput.focus();
    });

    $locateBtn.addEventListener('click', () => {
        if (isTracking) {
            stopWatchingPosition();
        } else {
            locateUser();
            startWatchingPosition();
        }
    });

    document.querySelectorAll('.transport-btn').forEach(btn => {
        btn.addEventListener('click', () => selectTransportMode(btn.dataset.mode));
    });

    $navClose.addEventListener('click', () => {
        $navPanel.classList.add('hidden');
        $transportModes.classList.add('hidden');
        $routeAlternatives.classList.add('hidden');
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        if (routeShadowLayer) { map.removeLayer(routeShadowLayer); routeShadowLayer = null; }
        if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
        clearAltRouteLayers();
        $searchInput.value = '';
        $searchClear.classList.add('hidden');
        destination = null;
        allRoutes = [];
    });

    $navStartBtn.addEventListener('click', startNavigation);
    $activeNavStop.addEventListener('click', stopNavigation);

    // ===== START =====
    init();

})();
