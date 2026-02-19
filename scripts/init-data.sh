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
    echo "Copie du PBF dans le repertoire Valhalla..."
    cp "$DATA_DIR/osm/france-latest.osm.pbf" "$DATA_DIR/valhalla/france-latest.osm.pbf"
    echo "Construction des tuiles (cela peut prendre 1-2h)..."
    echo "Les tuiles seront construites automatiquement au premier demarrage du conteneur Valhalla."
    echo "Le conteneur detecte le PBF dans /custom_files/ et construit les tuiles."
    echo "OK: PBF copie pour Valhalla"
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

# ===== 4. Download elevation data (SRTM 90m for France) =====
echo ""
echo "--- 4/5 Telechargement des donnees d'elevation (SRTM) ---"
ELEV_DIR="$DATA_DIR/elevation/srtm"
mkdir -p "$ELEV_DIR"
ELEV_COUNT=$(find "$ELEV_DIR" -name "*.tif" 2>/dev/null | wc -l)
if [ "$ELEV_COUNT" -lt 10 ]; then
    echo "Telechargement des tuiles SRTM 90m pour la France..."
    echo "(lat 42-51, lon W005 a E008 = ~130 fichiers)"
    FAILED=0
    for lat in $(seq 42 51); do
        for lon in $(seq -5 8); do
            if [ "$lon" -ge 0 ]; then
                LAT_STR=$(printf "N%02d" $lat)
                LON_STR=$(printf "E%03d" $lon)
            else
                LAT_STR=$(printf "N%02d" $lat)
                LON_STR=$(printf "W%03d" $((-lon)))
            fi
            FILE="${LAT_STR}${LON_STR}.hgt"
            TIFFILE="${LAT_STR}${LON_STR}.tif"
            if [ ! -f "$ELEV_DIR/$TIFFILE" ] && [ ! -f "$ELEV_DIR/$FILE" ]; then
                # Try elevation-tiles-prod S3 (skimmed tiles, 1-degree GeoTIFF)
                wget -q --timeout=10 \
                    "https://elevation-tiles-prod.s3.amazonaws.com/skadi/${LAT_STR}/${FILE}.gz" \
                    -O "$ELEV_DIR/${FILE}.gz" 2>/dev/null
                if [ -f "$ELEV_DIR/${FILE}.gz" ] && [ -s "$ELEV_DIR/${FILE}.gz" ]; then
                    gunzip -f "$ELEV_DIR/${FILE}.gz" 2>/dev/null || rm -f "$ELEV_DIR/${FILE}.gz"
                else
                    rm -f "$ELEV_DIR/${FILE}.gz"
                    FAILED=$((FAILED+1))
                fi
            fi
        done
        echo "  Latitude $lat done"
    done
    FINAL_COUNT=$(find "$ELEV_DIR" -name "*.hgt" -o -name "*.tif" 2>/dev/null | wc -l)
    echo "OK: $FINAL_COUNT fichiers d'elevation telecharges ($FAILED echoues - zones maritimes normales)"
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
