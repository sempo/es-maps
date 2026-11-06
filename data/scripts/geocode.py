#!/usr/bin/env python3
"""Geocode data/properties.json with Nominatim (OpenStreetMap), cached.

- Most precise level available: street (address_text) -> district -> city.
- Usage policy: max 1 request/second, identifying User-Agent, results cached in
  data/geocode_cache.json so re-runs make no network requests.
- Each result is sanity-checked against the hand-made district table: if
  Nominatim returns something far away, the table point is kept instead.
- District/city points get a deterministic offset (from the listing id) so markers
  don't stack; geo_precision tells the UI how approximate the point is.

Usage: python3 data/scripts/geocode.py [--offline]
"""
import json, os, sys, time, math, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_export import offset, DATA  # noqa: E402

PROPS = os.path.join(DATA, 'properties.json')
CACHE = os.path.join(DATA, 'geocode_cache.json')
UA = 'time2map-valencia-map-prototype/0.1 (https://time2map.com)'
URL = 'https://nominatim.openstreetmap.org/search'
MAX_KM = {'street': 4, 'district': 5, 'city': 10}
# Valencia city bounding box: neighbourhood names are ambiguous across the province
VLC_BOX = '-0.43,39.52,-0.30,39.42'
OFFLINE = '--offline' in sys.argv

cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
_last = [0.0]

def km(a, b):
    dlat = math.radians(b[0] - a[0]); dlon = math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))

def nominatim(q, bounded=False):
    key = q + (' |vlc-box' if bounded else '')
    if key in cache:
        return cache[key]
    if OFFLINE:
        return None
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    p = {'q': q, 'format': 'jsonv2', 'limit': 1, 'countrycodes': 'es', 'accept-language': 'es'}
    if bounded:
        p.update(viewbox=VLC_BOX, bounded=1)
    params = urllib.parse.urlencode(p)
    req = urllib.request.Request(f'{URL}?{params}', headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            res = json.load(r)
    except Exception as e:  # network trouble: don't cache, try again next run
        print('  ! request failed', q, e)
        return None
    finally:
        _last[0] = time.time()
    hit = None
    if res:
        x = res[0]
        hit = {'lat': float(x['lat']), 'lon': float(x['lon']), 'display_name': x.get('display_name'),
               'category': x.get('category'), 'type': x.get('type'), 'addresstype': x.get('addresstype')}
    cache[key] = hit
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
    print(f"  {'✓' if hit else '✗'} {key} -> {hit and hit['display_name'][:80]}")
    return hit

def main():
    data = json.load(open(PROPS, encoding='utf-8'))
    stats = {}
    for x in data['listings']:
        if not x.get('geo_query'):
            stats['none'] = stats.get('none', 0) + 1
            continue
        level = x['geo_precision']           # 'district' or 'city' from the table
        table = (x['lat'], x['lon'])
        candidates = []
        if x.get('address_text'):
            candidates.append((f"{x['address_text']}, {x['city']}, Spain", 'street'))
        candidates.append((x['geo_query'], level))
        for q, lvl in candidates:
            hit = nominatim(q, bounded=x['city'] == 'Valencia')
            if not hit:
                continue
            if km(table, (hit['lat'], hit['lon'])) > MAX_KM[level]:
                print(f"  ~ {x['id']}: '{q}' is {km(table, (hit['lat'], hit['lon'])):.1f} km from table point, ignored")
                continue
            x['lat'], x['lon'] = offset(x['sunline_id'] or x['id'], hit['lat'], hit['lon'], lvl)
            x['geo_precision'], x['geo_source'] = lvl, 'nominatim'
            break
        key = f"{x['geo_precision']}/{x['geo_source']}"
        stats[key] = stats.get(key, 0) + 1
    # drop cache entries no listing uses any more (keeps the file reviewable)
    used = {q + (' |vlc-box' if x['city'] == 'Valencia' else '') for x in data['listings'] if x.get('geo_query')
            for q in ([f"{x['address_text']}, {x['city']}, Spain"] if x.get('address_text') else []) + [x['geo_query']]}
    if not OFFLINE:
        for k in list(cache):
            if k not in used:
                del cache[k]
        json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
    data['geocoded_at'] = time.strftime('%Y-%m-%dT%H:%M:%S')
    data['note'] = ('Private sample data, listings and photos belong to SunLine. Do not publish. '
                    'Coordinates: Nominatim (OSM) at street/district/city level with a small deterministic offset.')
    json.dump(data, open(PROPS, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('geocoding:', stats)

if __name__ == '__main__':
    main()
