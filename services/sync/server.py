#!/usr/bin/env python3
"""MapsI Sync Service - stores favorites and settings as JSON files."""
import os
import json
from flask import Flask, request, jsonify

app = Flask(__name__)
DATA_DIR = os.environ.get('DATA_DIR', '/data')

def get_path(key):
    safe_key = key.replace('/', '_').replace('..', '')
    return os.path.join(DATA_DIR, f'{safe_key}.json')

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/<key>', methods=['GET'])
def get_data(key):
    path = get_path(key)
    if not os.path.exists(path):
        return jsonify({'data': None}), 404
    try:
        with open(path, 'r') as f:
            return jsonify({'data': json.load(f)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/<key>', methods=['POST'])
def set_data(key):
    path = get_path(key)
    try:
        data = request.get_json(force=True)
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(path, 'w') as f:
            json.dump(data, f)
        return jsonify({'status': 'saved'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    os.makedirs(DATA_DIR, exist_ok=True)
    app.run(host='0.0.0.0', port=8001)
