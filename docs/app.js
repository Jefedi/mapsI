// ==========================================
// MapsI PWA - Navigation GPS avec OpenStreetMap
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
    const DEFAULT_CENTER = [46.603354, 1.888334]; // France center
    const DEFAULT_ZOOM = 6;
    const SEARCH_DEBOUNCE = 400;
    const LONG_PRESS_DURATION = 800; // ms - durée pour appui long
    const LONG_PRESS_MOVE_THRESHOLD = 10; // pixels - mouvement max avant annulation
    const NAV_ZOOM = 18; // Zoom proche pour navigation
    const NAV_OFFSET_RATIO = 0.35; // Position utilisateur à 35% du bas de l'écran

    // ===== STATE =====
    let map;
    let userMarker;
    let destMarker;
    let routeLayer;
    let routeShadowLayer;
    let userPosition = null;
    let destination = null;
    let routeData = null;
    let routeSteps = [];
    let currentStepIndex = 0;
    let transportMode = 'driving';
    let isTracking = false;
    let isNavigating = false;
    let watchId = null;
    let searchTimeout = null;
    let locationRequested = false;
    let locationErrorShown = false;

    // Long press state
    let longPressTimer = null;
    let longPressStartX = 0;
    let longPressStartY = 0;
    let isLongPress = false;

    // Navigation view state
    let currentHeading = 0;
    let lastHeading = 0;
    let mapRotation = 0;

    // ===== DOM ELEMENTS =====
    const $searchInput = document.getElementById('search-input');
    const $searchClear = document.getElementById('search-clear');
    const $searchResults = document.getElementById('search-results');
    const $locateBtn = document.getElementById('locate-btn');
    const $transportModes = document.getElementById('transport-modes');
    const $navPanel = document.getElementById('nav-panel');
    const $navDistance = document.getElementById('nav-distance');
    const $navDuration = document.getElementById('nav-duration');
    const $navStepText = document.getElementById('nav-step-text');
    const $navClose = document.getElementById('nav-close');
    const $navStartBtn = document.getElementById('nav-start-btn');
    const $activeNav = document.getElementById('active-nav');
    const $activeNavDistance = document.getElementById('active-nav-distance');
    const $activeNavStreet = document.getElementById('active-nav-street');
    const $activeNavIcon = document.getElementById('active-nav-icon');
    const $activeNavStop = document.getElementById('active-nav-stop');
    const $loading = document.getElementById('loading');

    // ===== INIT MAP =====
    function initMap() {
        map = L.map('map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: false,
            attributionControl: true
        });

        // OpenStreetMap tiles
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        }).addTo(map);

        // Apply dark tiles based on preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.querySelector('.leaflet-tile-pane')?.classList.add('dark-tiles');
        }

        // Setup map event listeners
        setupMapEvents();

        // Don't auto-request location - wait for user to click locate button
        // This avoids error loops when permission is denied
    }

    // ===== LOCATION PERMISSION =====
    function requestLocationPermission() {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported');
            return;
        }

        if (locationRequested) return;
        locationRequested = true;

        // This will trigger the browser permission dialog
        navigator.geolocation.getCurrentPosition(
            pos => {
                updateUserPosition(pos);
                map.setView([pos.coords.latitude, pos.coords.longitude], 15);
                startWatchingPosition();
            },
            err => {
                console.warn('Geolocation error:', err.message);
                // Permission denied or error - still let user use the map
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    // ===== USER LOCATION =====
    function locateUser(animate = true) {
        if (!navigator.geolocation) return;

        showLoading();
        navigator.geolocation.getCurrentPosition(
            pos => {
                hideLoading();
                updateUserPosition(pos);
                if (animate) {
                    map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 1 });
                } else {
                    map.setView([pos.coords.latitude, pos.coords.longitude], 15);
                }
            },
            err => {
                hideLoading();
                // Only show permission error once to avoid spam
                if (err.code === 1) {
                    if (!locationErrorShown) {
                        locationErrorShown = true;
                        alert('Permission refusee.\n\nPour utiliser la localisation:\n1. Utilisez HTTPS (certificat valide)\n2. Activez Safari > Service de localisation');
                    }
                } else if (err.code === 2) {
                    alert('Position indisponible. Verifiez que le GPS est active.');
                } else if (err.code === 3) {
                    alert('Delai depasse. Reessayez.');
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    }

    function startWatchingPosition() {
        if (watchId !== null) return;
        if (!navigator.geolocation) return;

        watchId = navigator.geolocation.watchPosition(
            pos => {
                updateUserPosition(pos);
                if (isNavigating) {
                    updateNavigation(pos);
                }
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
        userPosition = { lat, lng, accuracy: pos.coords.accuracy, heading: pos.coords.heading };

        const latlng = [lat, lng];

        // Icône différente selon le mode (navigation ou non)
        const iconHtml = isNavigating
            ? '<div class="user-nav-arrow"></div><div class="user-location-dot nav"></div>'
            : '<div class="user-location-pulse"></div><div class="user-location-dot"></div>';

        if (!userMarker) {
            const dotIcon = L.divIcon({
                className: 'user-marker-container',
                html: iconHtml,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
            userMarker = L.marker(latlng, { icon: dotIcon, zIndexOffset: 1000 }).addTo(map);
        } else {
            userMarker.setLatLng(latlng);
            // Mettre à jour l'icône si le mode a changé
            const currentHtml = userMarker.getIcon().options.html;
            if ((isNavigating && !currentHtml.includes('user-nav-arrow')) ||
                (!isNavigating && currentHtml.includes('user-nav-arrow'))) {
                const newIcon = L.divIcon({
                    className: 'user-marker-container',
                    html: iconHtml,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });
                userMarker.setIcon(newIcon);
            }
        }
    }

    // ===== MAP EVENTS (Long Press) =====
    function setupMapEvents() {
        const mapEl = document.getElementById('map');

        // Touch events for long press
        mapEl.addEventListener('touchstart', handleTouchStart, { passive: false });
        mapEl.addEventListener('touchmove', handleTouchMove, { passive: true });
        mapEl.addEventListener('touchend', handleTouchEnd, { passive: true });
        mapEl.addEventListener('touchcancel', handleTouchEnd, { passive: true });

        // Close search results when tapping map
        map.on('click', () => {
            $searchResults.classList.add('hidden');
            $searchInput.blur();
        });
    }

    function handleTouchStart(e) {
        if (isNavigating) return;
        if (e.touches.length !== 1) return; // Only single touch

        const touch = e.touches[0];
        longPressStartX = touch.clientX;
        longPressStartY = touch.clientY;
        isLongPress = false;

        // Start long press timer
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            handleLongPress(touch.clientX, touch.clientY);
        }, LONG_PRESS_DURATION);
    }

    function handleTouchMove(e) {
        if (!longPressTimer) return;

        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - longPressStartX);
        const dy = Math.abs(touch.clientY - longPressStartY);

        // Cancel long press if finger moved too much
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
        // Vibrate feedback if supported
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        // Get map coordinates from screen position
        const containerPoint = L.point(clientX, clientY);
        const layerPoint = map.containerPointToLayerPoint(containerPoint);
        const latlng = map.layerPointToLatLng(layerPoint);

        if (latlng) {
            reverseGeocode(latlng.lat, latlng.lng);
        }
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
                q: query,
                format: 'json',
                addressdetails: '1',
                limit: '8',
                'accept-language': 'fr'
            });

            if (userPosition) {
                params.set('viewbox',
                    `${userPosition.lng - 1},${userPosition.lat + 1},${userPosition.lng + 1},${userPosition.lat - 1}`);
                params.set('bounded', '0');
            }

            const resp = await fetch(`${NOMINATIM_URL}/search?${params}`, {
                headers: { 'User-Agent': 'MapsI-PWA/1.0' }
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
                <div class="search-result-item" data-index="${i}" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escapeHtml(name)}">
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

        $searchInput.value = name;
        $searchResults.classList.add('hidden');
        $searchClear.classList.remove('hidden');

        setDestination(lat, lon, name);
    }

    // ===== REVERSE GEOCODE (for long press) =====
    async function reverseGeocode(lat, lon) {
        showLoading();
        try {
            const resp = await fetch(
                `${NOMINATIM_URL}/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr`,
                { headers: { 'User-Agent': 'MapsI-PWA/1.0' } }
            );
            const data = await resp.json();
            hideLoading();
            const name = data.display_name?.split(',')[0] || 'Destination';
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

        // Remove existing destination marker
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

        // Calculate route if we have user position
        if (userPosition) {
            calculateRoute();
        } else {
            // Try to get user position first
            navigator.geolocation?.getCurrentPosition(
                pos => {
                    updateUserPosition(pos);
                    calculateRoute();
                },
                () => {
                    alert('Activez la localisation pour calculer l\'itineraire');
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    }

    // ===== ROUTING (OSRM) =====
    async function calculateRoute() {
        if (!userPosition || !destination) return;

        showLoading();

        const profile = transportMode === 'walking' ? 'foot' : transportMode === 'cycling' ? 'bike' : 'car';
        const url = `${OSRM_URL}/route/v1/${profile}/${userPosition.lng},${userPosition.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=true`;

        try {
            const resp = await fetch(url);
            const data = await resp.json();
            hideLoading();

            if (data.code !== 'Ok' || !data.routes.length) {
                alert('Impossible de calculer le trajet');
                return;
            }

            routeData = data.routes[0];
            routeSteps = routeData.legs[0].steps;
            currentStepIndex = 0;

            drawRoute(routeData.geometry);
            showNavPanel();

            // Fit map to route bounds
            const coords = routeData.geometry.coordinates.map(c => [c[1], c[0]]);
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds, { padding: [60, 60] });

        } catch (err) {
            hideLoading();
            console.error('Route error:', err);
            alert('Erreur de calcul du trajet');
        }
    }

    function drawRoute(geometry) {
        // Clear existing route
        if (routeLayer) map.removeLayer(routeLayer);
        if (routeShadowLayer) map.removeLayer(routeShadowLayer);

        // Shadow line
        routeShadowLayer = L.geoJSON(geometry, {
            style: { color: '#000', weight: 8, opacity: 0.15 }
        }).addTo(map);

        // Main route line
        const color = transportMode === 'walking' ? '#30d158' : transportMode === 'cycling' ? '#ff9f0a' : '#0a84ff';
        routeLayer = L.geoJSON(geometry, {
            style: {
                color: color,
                weight: 5,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
            }
        }).addTo(map);
    }

    function showNavPanel() {
        const distance = routeData.distance;
        const duration = routeData.duration;

        $navDistance.textContent = formatDistance(distance);
        $navDuration.textContent = formatDuration(duration);

        if (routeSteps.length > 0) {
            $navStepText.textContent = translateManeuver(routeSteps[0].maneuver.type, routeSteps[0].maneuver.modifier, routeSteps[0].name);
        }

        // Show transport modes (inside nav panel area, at bottom)
        $transportModes.classList.remove('hidden');
        $navPanel.classList.remove('hidden');
    }

    // ===== ACTIVE NAVIGATION =====
    function startNavigation() {
        isNavigating = true;
        currentStepIndex = 0;

        $navPanel.classList.add('hidden');
        $transportModes.classList.add('hidden');
        $activeNav.classList.remove('hidden');

        // Activer le mode navigation sur la carte
        document.getElementById('map').classList.add('nav-mode');

        startWatchingPosition();
        updateNavigationDisplay();

        // Zoom proche et centrage sur l'utilisateur
        if (userPosition) {
            setNavigationView(userPosition.lat, userPosition.lng, userPosition.heading);
        }

        // Keep screen awake
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen').catch(() => {});
        }
    }

    // Calculer le cap vers la prochaine étape si pas de heading GPS
    function calculateBearingToNextStep() {
        if (!userPosition || !routeSteps.length) return 0;

        const step = routeSteps[currentStepIndex];
        if (!step || !step.maneuver) return lastHeading;

        const loc = step.maneuver.location;
        return calculateBearing(userPosition.lat, userPosition.lng, loc[1], loc[0]);
    }

    function calculateBearing(lat1, lng1, lat2, lng2) {
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;

        const x = Math.sin(dLng) * Math.cos(lat2Rad);
        const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

        let bearing = Math.atan2(x, y) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }

    function setNavigationView(lat, lng, heading) {
        // Utiliser le heading GPS ou calculer vers la prochaine étape
        let targetHeading = heading;
        if (targetHeading === null || targetHeading === undefined || isNaN(targetHeading)) {
            targetHeading = calculateBearingToNextStep();
        }

        // Lisser la rotation (éviter les sauts brusques)
        let headingDiff = targetHeading - lastHeading;
        if (headingDiff > 180) headingDiff -= 360;
        if (headingDiff < -180) headingDiff += 360;

        // Ne mettre à jour que si le changement est significatif (> 5°)
        if (Math.abs(headingDiff) > 5) {
            currentHeading = targetHeading;
            lastHeading = targetHeading;
            mapRotation = -targetHeading; // Rotation inverse pour que le nord soit "devant"

            // Appliquer la rotation CSS sur le conteneur de tuiles
            const mapEl = document.getElementById('map');
            mapEl.style.setProperty('--map-rotation', `${mapRotation}deg`);
        }

        // Calculer le décalage pour positionner l'utilisateur en bas de l'écran
        const mapSize = map.getSize();
        const offsetY = mapSize.y * (0.5 - NAV_OFFSET_RATIO); // Décaler vers le haut

        // Convertir le décalage en coordonnées géographiques
        const targetPoint = map.project([lat, lng], NAV_ZOOM);
        targetPoint.y -= offsetY;
        const offsetLatLng = map.unproject(targetPoint, NAV_ZOOM);

        // Appliquer la vue
        map.setView(offsetLatLng, NAV_ZOOM, { animate: true, duration: 0.3 });

        // Mettre à jour l'orientation du marqueur utilisateur
        updateUserMarkerRotation(targetHeading);
    }

    function updateUserMarkerRotation(heading) {
        if (!userMarker) return;

        const markerEl = userMarker.getElement();
        if (markerEl) {
            // Compenser la rotation de la carte pour que la flèche pointe toujours vers l'avant
            const arrowRotation = heading + mapRotation;
            markerEl.style.setProperty('--arrow-rotation', `${arrowRotation}deg`);
        }
    }

    function stopNavigation() {
        isNavigating = false;
        $activeNav.classList.add('hidden');
        stopWatchingPosition();

        // Désactiver le mode navigation
        const mapEl = document.getElementById('map');
        mapEl.classList.remove('nav-mode');
        mapEl.style.setProperty('--map-rotation', '0deg');
        mapRotation = 0;
        lastHeading = 0;

        // Réinitialiser le marqueur utilisateur (retirer la flèche)
        if (userMarker) {
            const markerEl = userMarker.getElement();
            if (markerEl) {
                markerEl.style.setProperty('--arrow-rotation', '0deg');
            }
        }

        // Clear route
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }
        if (routeShadowLayer) {
            map.removeLayer(routeShadowLayer);
            routeShadowLayer = null;
        }
        if (destMarker) {
            map.removeLayer(destMarker);
            destMarker = null;
        }

        // Revenir à un zoom normal centré sur l'utilisateur
        if (userPosition) {
            map.setView([userPosition.lat, userPosition.lng], 15, { animate: true });
        }

        $transportModes.classList.add('hidden');
        $searchInput.value = '';
        $searchClear.classList.add('hidden');
        destination = null;
        routeData = null;
        routeSteps = [];
    }

    function updateNavigation(pos) {
        if (!routeSteps.length) return;

        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        const step = routeSteps[currentStepIndex];
        if (!step) return;

        const stepEnd = step.maneuver.location;
        const dist = haversine(userLat, userLng, stepEnd[1], stepEnd[0]);

        if (dist < 30 && currentStepIndex < routeSteps.length - 1) {
            currentStepIndex++;
            updateNavigationDisplay();
            // Vibrate on new instruction
            if (navigator.vibrate) navigator.vibrate(100);
        }

        // Update distance to next step
        const nextStep = routeSteps[currentStepIndex];
        if (nextStep) {
            const nextDist = haversine(userLat, userLng, nextStep.maneuver.location[1], nextStep.maneuver.location[0]);
            $activeNavDistance.textContent = formatDistance(nextDist);
        }

        // Mettre à jour la vue navigation (zoom proche + rotation + centrage bas)
        setNavigationView(userLat, userLng, pos.coords.heading);

        // Check if arrived at destination
        const destDist = haversine(userLat, userLng, destination.lat, destination.lon);
        if (destDist < 30) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            alert('Vous etes arrive !');
            stopNavigation();
        }
    }

    function updateNavigationDisplay() {
        const step = routeSteps[currentStepIndex];
        if (!step) return;

        const maneuver = step.maneuver;
        $activeNavIcon.textContent = getManeuverEmoji(maneuver.type, maneuver.modifier);
        $activeNavStreet.textContent = step.name || 'Route';
        $activeNavDistance.textContent = formatDistance(step.distance);
    }

    // ===== TRANSPORT MODE SELECTION =====
    function selectTransportMode(mode) {
        transportMode = mode;
        document.querySelectorAll('.transport-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        if (destination && userPosition) {
            calculateRoute();
        }
    }

    // ===== HELPERS =====
    function formatDistance(meters) {
        if (meters >= 1000) {
            return (meters / 1000).toFixed(1) + ' km';
        }
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

    function getManeuverEmoji(type, modifier) {
        if (type === 'arrive') return '🏁';
        if (type === 'depart') return '🚀';
        if (modifier?.includes('left')) return '⬅️';
        if (modifier?.includes('right')) return '➡️';
        if (type === 'roundabout') return '🔄';
        return '⬆️';
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function showLoading() { $loading.classList.remove('hidden'); }
    function hideLoading() { $loading.classList.add('hidden'); }

    // ===== EVENT LISTENERS =====
    // Search
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

    // Locate button
    $locateBtn.addEventListener('click', () => {
        if (isTracking) {
            stopWatchingPosition();
        } else {
            locateUser(true);
            startWatchingPosition();
        }
    });

    // Transport mode buttons
    document.querySelectorAll('.transport-btn').forEach(btn => {
        btn.addEventListener('click', () => selectTransportMode(btn.dataset.mode));
    });

    // Navigation panel close
    $navClose.addEventListener('click', () => {
        $navPanel.classList.add('hidden');
        $transportModes.classList.add('hidden');
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }
        if (routeShadowLayer) {
            map.removeLayer(routeShadowLayer);
            routeShadowLayer = null;
        }
        if (destMarker) {
            map.removeLayer(destMarker);
            destMarker = null;
        }
        $searchInput.value = '';
        $searchClear.classList.add('hidden');
        destination = null;
    });

    $navStartBtn.addEventListener('click', startNavigation);
    $activeNavStop.addEventListener('click', stopNavigation);

    // ===== START =====
    initMap();

})();
