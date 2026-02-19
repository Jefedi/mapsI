"""Fuel price proxy server for MapsI.

Downloads French government fuel price data (XML) server-side and serves it
via a simple REST API. This is the ONLY component that makes external requests,
and it does so server-side on a schedule — no client browser ever contacts
an external server.
"""

import io
import json
import math
import os
import threading
import time
import zipfile
from xml.etree import ElementTree

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

FUEL_XML_URL = "https://donnees.roulez-eco.fr/opendata/instantane"
SYNC_INTERVAL = int(os.environ.get("SYNC_INTERVAL_MINUTES", 30)) * 60

stations = []
stations_lock = threading.Lock()


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_fuel_xml(xml_bytes):
    """Parse the government fuel XML into a list of station dicts."""
    results = []
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return results

    for pdv in root.iter("pdv"):
        try:
            lat = float(pdv.get("latitude", "0")) / 100000
            lon = float(pdv.get("longitude", "0")) / 100000
            adresse = (pdv.findtext("adresse") or "").strip()
            ville = (pdv.findtext("ville") or "").strip()
            cp = pdv.get("cp", "")

            prix_list = []
            for prix in pdv.iter("prix"):
                prix_list.append({
                    "nom": prix.get("nom", ""),
                    "valeur": prix.get("valeur", ""),
                    "maj": prix.get("maj", "")
                })

            horaires_el = pdv.find("horaires")
            horaires = horaires_el.get("automate-24-24", "") if horaires_el is not None else ""

            results.append({
                "adresse": adresse,
                "ville": ville,
                "cp": cp,
                "geom": {"lat": lat, "lon": lon},
                "prix": json.dumps(prix_list),
                "horaires": horaires,
                "_lat": lat,
                "_lon": lon
            })
        except (ValueError, TypeError):
            continue

    return results


def sync_fuel_data():
    """Download and parse fuel data."""
    global stations
    try:
        resp = requests.get(FUEL_XML_URL, timeout=60)
        resp.raise_for_status()
        # The endpoint returns a zip containing an XML file
        try:
            z = zipfile.ZipFile(io.BytesIO(resp.content))
            xml_bytes = z.read(z.namelist()[0])
        except zipfile.BadZipFile:
            xml_bytes = resp.content

        parsed = parse_fuel_xml(xml_bytes)
        with stations_lock:
            stations = parsed
        print(f"[fuel-proxy] Synced {len(parsed)} stations")
    except Exception as e:
        print(f"[fuel-proxy] Sync error: {e}")


def sync_loop():
    """Background thread that syncs fuel data periodically."""
    while True:
        sync_fuel_data()
        time.sleep(SYNC_INTERVAL)


@app.route("/records")
def get_records():
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    radius = request.args.get("radius", 5000, type=float)
    limit = request.args.get("limit", 15, type=int)

    if lat is None or lon is None:
        return jsonify({"results": []})

    with stations_lock:
        local_stations = list(stations)

    # Filter by distance and sort
    nearby = []
    for s in local_stations:
        dist = haversine(lat, lon, s["_lat"], s["_lon"])
        if dist <= radius:
            nearby.append((dist, s))

    nearby.sort(key=lambda x: x[0])
    results = []
    for _, s in nearby[:limit]:
        results.append({
            "adresse": s["adresse"],
            "ville": s["ville"],
            "cp": s["cp"],
            "geom": s["geom"],
            "prix": s["prix"],
            "horaires": s["horaires"]
        })

    return jsonify({"results": results})


if __name__ == "__main__":
    # Start background sync thread
    t = threading.Thread(target=sync_loop, daemon=True)
    t.start()
    # Wait a bit for initial data
    time.sleep(2)
    app.run(host="0.0.0.0", port=8000)
