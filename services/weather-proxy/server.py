#!/usr/bin/env python3
"""MapsI Weather Proxy - caches Open-Meteo forecasts server-side."""
import os
import json
import time
import threading
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)
DATA_DIR = os.environ.get('DATA_DIR', '/data')
CACHE_FILE = os.path.join(DATA_DIR, 'weather_cache.json')
CACHE_DURATION = 900  # 15 minutes
OPEN_METEO_URL = 'https://api.open-meteo.com'

cache_lock = threading.Lock()

def get_cache_key(lat, lon):
    return f"{round(lat, 2)}_{round(lon, 2)}"

def load_cache():
    try:
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
    except:
        pass
    return {}

def save_cache(cache):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(CACHE_FILE, 'w') as f:
            json.dump(cache, f)
    except:
        pass

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/v1/forecast')
def forecast():
    lat = request.args.get('latitude')
    lon = request.args.get('longitude')
    if not lat or not lon:
        return jsonify({'error': 'latitude and longitude required'}), 400

    try:
        lat_f, lon_f = float(lat), float(lon)
    except ValueError:
        return jsonify({'error': 'invalid coordinates'}), 400

    key = get_cache_key(lat_f, lon_f)

    with cache_lock:
        cache = load_cache()
        entry = cache.get(key)
        if entry and time.time() - entry.get('timestamp', 0) < CACHE_DURATION:
            return jsonify(entry['data'])

    # Fetch from Open-Meteo (server-side only)
    try:
        params = {
            'latitude': lat,
            'longitude': lon,
            'current_weather': 'true',
            'timezone': 'auto'
        }
        resp = requests.get(f'{OPEN_METEO_URL}/v1/forecast', params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        with cache_lock:
            cache = load_cache()
            cache[key] = {'data': data, 'timestamp': time.time()}
            # Keep max 50 cache entries
            if len(cache) > 50:
                oldest = sorted(cache.items(), key=lambda x: x[1].get('timestamp', 0))
                cache = dict(oldest[-50:])
            save_cache(cache)

        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 502

if __name__ == '__main__':
    os.makedirs(DATA_DIR, exist_ok=True)
    app.run(host='0.0.0.0', port=8003)
