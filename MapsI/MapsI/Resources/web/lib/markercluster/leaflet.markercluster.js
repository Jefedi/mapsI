/**
 * Leaflet.MarkerCluster - Minimal but functional implementation
 * Compatible with Leaflet 1.9.4
 * No external dependencies beyond Leaflet itself.
 *
 * Provides: L.MarkerClusterGroup (extends L.FeatureGroup)
 * Supports: addLayer, addLayers, removeLayers, clearLayers,
 *           configurable maxClusterRadius, cluster icons with count,
 *           spiderfy on click with animation.
 */
(function (L) {
    'use strict';

    if (!L) {
        throw new Error('Leaflet must be loaded before leaflet.markercluster.js');
    }

    // ---- Cluster Icon ----

    L.MarkerClusterIcon = L.DivIcon.extend({
        options: {
            iconSize: [40, 40],
            className: 'marker-cluster'
        },
        createIcon: function () {
            var div = document.createElement('div');
            var inner = document.createElement('span');
            inner.textContent = this.options.childCount;
            div.appendChild(inner);
            this._setIconStyles(div, 'icon');
            var c = this.options.childCount;
            var sizeClass = c < 10 ? 'marker-cluster-small'
                : c < 100 ? 'marker-cluster-medium'
                : 'marker-cluster-large';
            div.className = 'marker-cluster ' + sizeClass;
            return div;
        }
    });

    // ---- Cluster Marker (represents a group of markers) ----

    L.MarkerCluster = L.Marker.extend({
        initialize: function (group, markers) {
            var totalLat = 0, totalLng = 0;
            for (var i = 0; i < markers.length; i++) {
                var ll = markers[i].getLatLng();
                totalLat += ll.lat;
                totalLng += ll.lng;
            }
            var center = L.latLng(totalLat / markers.length, totalLng / markers.length);

            L.Marker.prototype.initialize.call(this, center, {
                icon: new L.MarkerClusterIcon({ childCount: markers.length }),
                interactive: true
            });

            this._group = group;
            this._markers = markers;
            this._spiderfied = false;
            this._spiderLegs = [];
            this._spiderMarkers = [];
        },

        getChildMarkers: function () {
            return this._markers.slice();
        },

        getChildCount: function () {
            return this._markers.length;
        },

        // Zoom in or spiderfy on click
        _onClusterClick: function (e) {
            var map = this._group._map;
            if (!map) return;

            var maxZoom = map.getMaxZoom();
            var currentZoom = map.getZoom();

            // If already at max zoom (or close), spiderfy instead of zooming
            if (currentZoom >= maxZoom - 1) {
                this._spiderfy(map);
            } else {
                // Zoom to bounds of child markers
                var bounds = L.latLngBounds();
                for (var i = 0; i < this._markers.length; i++) {
                    bounds.extend(this._markers[i].getLatLng());
                }
                map.fitBounds(bounds, { padding: [20, 20], maxZoom: maxZoom });
            }
        },

        _spiderfy: function (map) {
            if (this._spiderfied) {
                this._unspiderfy(map);
                return;
            }

            // Unspiderfy any other cluster first
            if (this._group._spiderfiedCluster) {
                this._group._spiderfiedCluster._unspiderfy(map);
            }

            this._spiderfied = true;
            this._group._spiderfiedCluster = this;
            var center = this.getLatLng();
            var markers = this._markers;
            var count = markers.length;
            var angleStep = (2 * Math.PI) / count;
            var radius = 35 + Math.min(count, 20) * 3; // pixels

            for (var i = 0; i < count; i++) {
                var angle = angleStep * i - Math.PI / 2;
                var centerPoint = map.latLngToLayerPoint(center);
                var offset = L.point(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius
                );
                var spiderPoint = centerPoint.add(offset);
                var spiderLatLng = map.layerPointToLatLng(spiderPoint);

                // Create a visible copy of the original marker at the spider position
                var spiderMarker = L.marker(spiderLatLng, {
                    icon: markers[i].options.icon || new L.Icon.Default(),
                    interactive: true,
                    zIndexOffset: 1000
                });

                // Copy popup / tooltip bindings
                if (markers[i].getPopup()) {
                    spiderMarker.bindPopup(markers[i].getPopup());
                }
                if (markers[i].getTooltip()) {
                    spiderMarker.bindTooltip(markers[i].getTooltip());
                }

                // Re-fire click events on the original marker
                (function (original) {
                    spiderMarker.on('click', function (e) {
                        original.fire('click', e);
                    });
                })(markers[i]);

                spiderMarker.addTo(map);
                this._spiderMarkers.push(spiderMarker);

                // Draw a thin line (leg) from center to spider position
                var leg = L.polyline([center, spiderLatLng], {
                    weight: 1.5,
                    color: '#888',
                    opacity: 0.6,
                    className: 'spider-leg'
                }).addTo(map);
                this._spiderLegs.push(leg);
            }

            // Animate: start at center and move outward
            this._animateSpider(map);
        },

        _animateSpider: function (map) {
            // Simple CSS-driven animation: markers start at cluster center
            var center = this.getLatLng();
            var targets = [];
            for (var i = 0; i < this._spiderMarkers.length; i++) {
                var target = this._spiderMarkers[i].getLatLng();
                targets.push(target);
                // Briefly set at center, then restore
                this._spiderMarkers[i].setLatLng(center);
            }
            // Use requestAnimationFrame for smooth animation
            var self = this;
            requestAnimationFrame(function () {
                for (var j = 0; j < self._spiderMarkers.length; j++) {
                    var el = self._spiderMarkers[j]._icon;
                    if (el) {
                        el.style.transition = 'transform 0.3s ease-out';
                    }
                    self._spiderMarkers[j].setLatLng(targets[j]);
                }
                // Also animate legs
                for (var k = 0; k < self._spiderLegs.length; k++) {
                    var legEl = self._spiderLegs[k]._path;
                    if (legEl) {
                        legEl.style.transition = 'stroke-dashoffset 0.3s ease-out';
                    }
                }
            });
        },

        _unspiderfy: function (map) {
            if (!this._spiderfied) return;

            for (var i = 0; i < this._spiderMarkers.length; i++) {
                map.removeLayer(this._spiderMarkers[i]);
            }
            for (var j = 0; j < this._spiderLegs.length; j++) {
                map.removeLayer(this._spiderLegs[j]);
            }
            this._spiderMarkers = [];
            this._spiderLegs = [];
            this._spiderfied = false;
            if (this._group._spiderfiedCluster === this) {
                this._group._spiderfiedCluster = null;
            }
        }
    });

    // ---- MarkerClusterGroup ----

    L.MarkerClusterGroup = L.FeatureGroup.extend({
        options: {
            maxClusterRadius: 80,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: null,
            singleMarkerMode: false,
            iconCreateFunction: null
        },

        initialize: function (options) {
            L.Util.setOptions(this, options);
            L.FeatureGroup.prototype.initialize.call(this, []);
            this._markers = [];         // all source markers
            this._clusterMarkers = [];  // currently displayed cluster markers
            this._spiderfiedCluster = null;
        },

        onAdd: function (map) {
            this._map = map;
            L.FeatureGroup.prototype.onAdd.call(this, map);
            this._recluster();

            map.on('zoomend moveend', this._onMapChange, this);
            map.on('click', this._onMapClick, this);
        },

        onRemove: function (map) {
            map.off('zoomend moveend', this._onMapChange, this);
            map.off('click', this._onMapClick, this);
            this._clearClusters();
            this._map = null;
            L.FeatureGroup.prototype.onRemove.call(this, map);
        },

        addLayer: function (layer) {
            if (!(layer instanceof L.Marker)) return this;
            this._markers.push(layer);
            if (this._map) {
                this._recluster();
            }
            return this;
        },

        addLayers: function (layers) {
            if (!Array.isArray(layers)) return this;
            for (var i = 0; i < layers.length; i++) {
                if (layers[i] instanceof L.Marker) {
                    this._markers.push(layers[i]);
                }
            }
            if (this._map) {
                this._recluster();
            }
            return this;
        },

        removeLayer: function (layer) {
            var idx = this._markers.indexOf(layer);
            if (idx !== -1) {
                this._markers.splice(idx, 1);
            }
            if (this._map) {
                this._recluster();
            }
            return this;
        },

        removeLayers: function (layers) {
            if (!Array.isArray(layers)) return this;
            for (var i = 0; i < layers.length; i++) {
                var idx = this._markers.indexOf(layers[i]);
                if (idx !== -1) {
                    this._markers.splice(idx, 1);
                }
            }
            if (this._map) {
                this._recluster();
            }
            return this;
        },

        clearLayers: function () {
            this._clearClusters();
            this._markers = [];
            return this;
        },

        getLayers: function () {
            return this._markers.slice();
        },

        hasLayer: function (layer) {
            return this._markers.indexOf(layer) !== -1;
        },

        getBounds: function () {
            var bounds = L.latLngBounds();
            for (var i = 0; i < this._markers.length; i++) {
                bounds.extend(this._markers[i].getLatLng());
            }
            return bounds;
        },

        // ---- Internal methods ----

        _onMapChange: function () {
            this._recluster();
        },

        _onMapClick: function () {
            // Clicking the map unspiderfies any open cluster
            if (this._spiderfiedCluster) {
                this._spiderfiedCluster._unspiderfy(this._map);
                this._spiderfiedCluster = null;
            }
        },

        _clearClusters: function () {
            if (this._spiderfiedCluster && this._map) {
                this._spiderfiedCluster._unspiderfy(this._map);
                this._spiderfiedCluster = null;
            }
            // Remove all displayed layers from the actual FeatureGroup
            for (var i = 0; i < this._clusterMarkers.length; i++) {
                L.FeatureGroup.prototype.removeLayer.call(this, this._clusterMarkers[i]);
            }
            this._clusterMarkers = [];
            // Also remove any unclustered markers
            if (this._displayedSingles) {
                for (var j = 0; j < this._displayedSingles.length; j++) {
                    L.FeatureGroup.prototype.removeLayer.call(this, this._displayedSingles[j]);
                }
            }
            this._displayedSingles = [];
        },

        _recluster: function () {
            if (!this._map) return;

            this._clearClusters();

            var map = this._map;
            var zoom = map.getZoom();
            var disableZoom = this.options.disableClusteringAtZoom;
            var radius = this.options.maxClusterRadius;
            var markers = this._markers;

            // If clustering is disabled at this zoom, show all markers directly
            if (disableZoom !== null && zoom >= disableZoom) {
                for (var d = 0; d < markers.length; d++) {
                    L.FeatureGroup.prototype.addLayer.call(this, markers[d]);
                    this._displayedSingles.push(markers[d]);
                }
                return;
            }

            // Grid-based clustering for performance
            var clustered = this._gridCluster(markers, radius, zoom);

            for (var i = 0; i < clustered.length; i++) {
                var group = clustered[i];
                if (group.length === 1 && !this.options.singleMarkerMode) {
                    // Single marker, display directly
                    L.FeatureGroup.prototype.addLayer.call(this, group[0]);
                    this._displayedSingles.push(group[0]);
                } else {
                    // Create a cluster marker
                    var cluster = new L.MarkerCluster(this, group);

                    // Apply custom icon function if provided
                    if (this.options.iconCreateFunction) {
                        cluster.setIcon(this.options.iconCreateFunction(cluster));
                    }

                    cluster.on('click', cluster._onClusterClick, cluster);
                    L.FeatureGroup.prototype.addLayer.call(this, cluster);
                    this._clusterMarkers.push(cluster);
                }
            }
        },

        /**
         * Simple grid-based spatial clustering.
         * Divides the map into a grid where each cell is roughly `radius` pixels wide.
         * Markers in the same or adjacent cells get merged into clusters.
         */
        _gridCluster: function (markers, radius, zoom) {
            if (markers.length === 0) return [];

            var map = this._map;
            var used = new Array(markers.length);
            var clusters = [];

            // Pre-compute pixel positions for all markers
            var points = [];
            for (var p = 0; p < markers.length; p++) {
                points.push(map.project(markers[p].getLatLng(), zoom));
            }

            for (var i = 0; i < markers.length; i++) {
                if (used[i]) continue;

                var group = [markers[i]];
                used[i] = true;
                var cx = points[i].x;
                var cy = points[i].y;

                // Find all nearby markers within radius
                for (var j = i + 1; j < markers.length; j++) {
                    if (used[j]) continue;

                    var dx = points[j].x - cx;
                    var dy = points[j].y - cy;
                    if (dx * dx + dy * dy <= radius * radius) {
                        group.push(markers[j]);
                        used[j] = true;
                    }
                }

                clusters.push(group);
            }

            return clusters;
        }
    });

    // Factory function
    L.markerClusterGroup = function (options) {
        return new L.MarkerClusterGroup(options);
    };

})(window.L);
