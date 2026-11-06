#!/usr/bin/env python3
"""Quick extraction-quality report for data/properties.json.

Prints how many listings were parsed and how many have each key field,
plus schema sanity checks. Exit code 1 if a hard check fails.
Usage: python3 data/scripts/check_quality.py
"""
import json, os, sys
from collections import Counter

DATA = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(DATA, 'properties.json'), encoding='utf-8'))
L = d['listings']
n = len(L)

def has(k):
    return sum(1 for x in L if x.get(k) not in (None, [], ''))

def pct(v):
    return f'{v:>3}/{n}  {100 * v / n:5.1f}%'

print(f'Listings parsed: {n}   (source {d["source"]}, export {d["exported_at"]})')
print('Field coverage:')
for k in ('deal_type', 'price_eur', 'area_m2', 'bedrooms', 'bathrooms', 'floor', 'terrace_m2',
          'district', 'address_text', 'lat', 'photos', 'sunline_id', 'features'):
    print(f'  {k:14} {pct(has(k))}')
print('Deal type:     ', dict(Counter(x['deal_type'] for x in L)))
print('Status:        ', dict(Counter(x['status'] for x in L)))
print('Property type: ', dict(Counter(x['property_type'] for x in L)))
print('Geo precision: ', dict(Counter(f"{x['geo_precision']}/{x.get('geo_source')}" for x in L)))

errors = []
ENUMS = {'deal_type': {'rent', 'sale', None}, 'price_period': {'month', 'total', None},
         'property_type': {'apartment', 'house', 'villa', 'townhouse', 'studio', 'commercial', 'land', 'other'},
         'geo_precision': {'address', 'street', 'district', 'city', 'none'},
         'status': {'available', 'rented', 'sold'}}
ids = Counter(x['id'] for x in L)
errors += [f'duplicate id {i}' for i, c in ids.items() if c > 1]
missing_photos = 0
for x in L:
    for k, allowed in ENUMS.items():
        if x.get(k) not in allowed:
            errors.append(f"{x['id']}: {k}={x.get(k)!r}")
    if (x['lat'] is None) != (x['geo_precision'] == 'none'):
        errors.append(f"{x['id']}: lat/geo_precision mismatch")
    if x['price_eur'] is not None and x['deal_type'] == 'rent' and not 200 <= x['price_eur'] <= 20000:
        errors.append(f"{x['id']}: suspicious rent {x['price_eur']}")
    if x['price_eur'] is not None and x['deal_type'] == 'sale' and x['price_eur'] < 20000:
        errors.append(f"{x['id']}: suspicious sale price {x['price_eur']}")
    if x['area_m2'] is not None and not 10 <= x['area_m2'] <= 5000:
        errors.append(f"{x['id']}: suspicious area {x['area_m2']}")
    if x['price_eur'] == 0 or x['area_m2'] == 0:
        errors.append(f"{x['id']}: zero instead of null")
    missing_photos += sum(1 for p in x['photos'] if not os.path.exists(os.path.join(DATA, p)))

print(f'Photo files missing on disk: {missing_photos}')
print('Without coordinates (listed, not on map):', [x['id'] for x in L if x['lat'] is None])
print('Without price:', [x['id'] for x in L if x['price_eur'] is None])
if errors:
    print(f'\n{len(errors)} problem(s):')
    for e in errors:
        print('  -', e)
    sys.exit(1)
print('\nAll checks passed.')
