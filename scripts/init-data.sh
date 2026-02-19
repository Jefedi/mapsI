#!/bin/bash
# ===========================================
# MapsI - Script d'initialisation des donnees
# A executer UNE SEULE FOIS avant le premier docker-compose up
# Necessite: ~16 Go RAM, ~128 Go disque, ~4h
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data"

echo "=== MapsI Data Init ==="
echo "Repertoire: $DATA_DIR"

# Create directory structure
mkdir -p "$DATA_DIR"/{osm,valhalla,tiles,elevation/mapzen}

# ===== 1. Download France OSM PBF (~4 Go) =====
echo ""
echo "--- 1/5 Telechargement de france-latest.osm.pbf ---"
if [ ! -f "$DATA_DIR/osm/france-latest.osm.pbf" ]; then
    wget -c "https://download.geofabrik.de/europe/france-latest.osm.pbf" \
        -O "$DATA_DIR/osm/france-latest.osm.pbf"
    echo "OK: PBF telecharge"
else
    echo "SKIP: PBF deja present"
fi

# ===== 2. Build Valhalla tiles =====
echo ""
echo "--- 2/5 Construction des tuiles Valhalla (routage) ---"
if [ ! -d "$DATA_DIR/valhalla/valhalla_tiles" ]; then
    cp "$DATA_DIR/osm/france-latest.osm.pbf" "$DATA_DIR/valhalla/france-latest.osm.pbf"
    docker run --rm -v "$DATA_DIR/valhalla:/custom_files" \
        ghcr.io/gis-ops/valhalla:latest \
        valhalla_build_tiles -c /custom_files/valhalla.json /custom_files/france-latest.osm.pbf
    # Cleanup PBF copy from valhalla dir
    rm -f "$DATA_DIR/valhalla/france-latest.osm.pbf"
    echo "OK: Tuiles Valhalla construites"
else
    echo "SKIP: Tuiles Valhalla deja presentes"
fi

# ===== 3. Download map tiles (OpenMapTiles mbtiles) =====
echo ""
echo "--- 3/5 Telechargement des tuiles de carte (mbtiles) ---"
if [ ! -f "$DATA_DIR/tiles/france.mbtiles" ]; then
    echo "Telechargez manuellement le fichier france.mbtiles depuis:"
    echo "  https://data.maptiler.com/downloads/tileset/osm/europe/france/"
    echo "Placez-le dans: $DATA_DIR/tiles/france.mbtiles"
    echo ""
    echo "Ou utilisez planetiler pour generer les tuiles:"
    echo "  docker run -v $DATA_DIR:/data ghcr.io/onthegomap/planetiler:latest \\"
    echo "    --osm-path=/data/osm/france-latest.osm.pbf \\"
    echo "    --output=/data/tiles/france.mbtiles"
else
    echo "SKIP: mbtiles deja present"
fi

# ===== 4. Download elevation data (Mapzen GeoTIFF for France) =====
echo ""
echo "--- 4/5 Telechargement des donnees d'elevation ---"
ELEV_DIR="$DATA_DIR/elevation/mapzen"
ELEV_COUNT=$(ls "$ELEV_DIR"/*.tif 2>/dev/null | wc -l)
if [ "$ELEV_COUNT" -lt 10 ]; then
    echo "Telechargement des tuiles d'elevation Mapzen pour la France..."
    echo "(lat 42-51, lon -5 a 8 = ~130 fichiers, ~3 Go)"
    for lat in $(seq 42 51); do
        for lon in $(seq -5 8); do
            if [ "$lon" -ge 0 ]; then
                NS="N"
                EW="E"
                LAT_STR=$(printf "%02d" $lat)
                LON_STR=$(printf "%03d" $lon)
            else
                NS="N"
                EW="W"
                LAT_STR=$(printf "%02d" $lat)
                LON_STR=$(printf "%03d" $((-lon)))
            fi
            FILE="${NS}${LAT_STR}${EW}${LON_STR}.tif"
            if [ ! -f "$ELEV_DIR/$FILE" ]; then
                wget -q "https://elevation-tiles-prod.s3.amazonaws.com/geotiff/${FILE}" \
                    -O "$ELEV_DIR/$FILE" 2>/dev/null || true
            fi
        done
        echo "  Latitude $lat done"
    done
    echo "OK: Donnees d'elevation telechargees"
else
    echo "SKIP: Donnees d'elevation deja presentes ($ELEV_COUNT fichiers)"
fi

# ===== 5. Summary =====
echo ""
echo "--- 5/5 Nominatim et Overpass ---"
echo "Ces services importent le PBF automatiquement au premier demarrage."
echo "Le premier docker-compose up prendra du temps (~2-4h)."

echo ""
echo "=== INIT TERMINE ==="
echo ""
echo "Verifiez que $DATA_DIR/tiles/france.mbtiles existe."
echo "Puis lancez: docker-compose up -d"
echo ""
du -sh "$DATA_DIR"/* 2>/dev/null || true
