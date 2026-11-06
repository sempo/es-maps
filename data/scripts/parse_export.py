#!/usr/bin/env python3
"""Parse a Telegram Desktop JSON export of the SunLine channel into properties.json.

Usage (from the repo root or anywhere):
    python3 data/scripts/parse_export.py      # 1. parse  -> data/properties.json
    python3 data/scripts/geocode.py           # 2. geocode (Nominatim, cached)
    python3 data/scripts/check_quality.py     # 3. coverage report

Coordinates written here come from a hand-made table of district centres
(geo_source="table"); geocode.py replaces them with Nominatim results.
Values that are not in the post are always null — nothing is invented.
"""
import json, re, os, unicodedata, hashlib
from collections import Counter

DATA = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(DATA, 'raw', 'result.json')
OUT = os.path.join(DATA, 'properties.json')
CHANNEL = 'sunlinespain'

# ---------------------------------------------------------------------------
# Places: (match patterns, district, city, level, fallback lat, lon, nominatim query)
# Most specific first. level: "district" (neighbourhood) or "city" (whole town).
# ---------------------------------------------------------------------------
P = []
def place(pats, district, city, level, lat, lon, query):
    P.append((pats, district, city, level, lat, lon, query))

VLC = 'València'
place(['pla del remei'], 'Pla del Remei', 'Valencia', 'district', 39.4690, -0.3690, 'el Pla del Remei, València')
place(['gran vía', 'gran via'], 'Gran Vía', 'Valencia', 'district', 39.4655, -0.3700, 'Gran Vía, Ensanche, València')
place(['benicalap'], 'Benicalap', 'Valencia', 'district', 39.4960, -0.3920, 'Benicalap, València')
place(['sant llor'], 'Sant Llorenç', 'Valencia', 'district', 39.4945, -0.3720, 'Sant Llorenç, Rascanya, València')
place(['albors'], 'Albors', 'Valencia', 'district', 39.4650, -0.3560, 'Albors, València')
place(['ciutat de les arts', 'город искусств'], 'Ciutat de les Arts i les Ciències', 'Valencia', 'district', 39.4550, -0.3500, 'Ciutat de les Arts i de les Ciències, València')
place(['penya'], 'Penya-roja', 'Valencia', 'district', 39.4600, -0.3420, 'Penya-Roja, Camins al Grau, València')
place(['aiora', 'ayora', 'amistat'], 'Aiora', 'Valencia', 'district', 39.4690, -0.3460, 'Aiora, València')
place(['jaume roig'], 'Jaume Roig', 'Valencia', 'district', 39.4800, -0.3600, 'Jaume Roig, València')
place(['camins al grau'], 'Camins al Grau', 'Valencia', 'district', 39.4640, -0.3520, 'Camins al Grau, València')
place(['pobla de vallbona'], 'La Pobla de Vallbona', 'La Pobla de Vallbona', 'city', 39.5880, -0.5540, 'la Pobla de Vallbona, Valencia, Spain')
place(['canyamelar'], 'El Canyamelar', 'Valencia', 'district', 39.4630, -0.3300, 'el Canyamelar, València')
place(['cabanyal'], 'El Cabanyal', 'Valencia', 'district', 39.4690, -0.3290, 'el Cabanyal, València')
place(['poblats mar'], 'Poblats Marítims', 'Valencia', 'district', 39.4650, -0.3300, 'Poblats Marítims, València')
place(['dénia', 'denia'], 'Dénia', 'Dénia', 'city', 38.8400, 0.1060, 'Dénia, Alicante, Spain')
place(['russafa', 'ruzafa'], 'Russafa', 'Valencia', 'district', 39.4610, -0.3730, 'Russafa, València')
place(['marxalenes'], 'Marxalenes', 'Valencia', 'district', 39.4870, -0.3830, 'Marxalenes, València')
place(['fonteta'], 'La Fonteta de Sant Lluís', 'Valencia', 'district', 39.4520, -0.3570, 'la Fonteta de Sant Lluís, València')
place(['ciutat fallera'], 'Ciutat Fallera', 'Valencia', 'district', 39.4960, -0.3830, 'Ciutat Fallera, València')
place(['na rovella'], 'Na Rovella', 'Valencia', 'district', 39.4480, -0.3630, 'na Rovella, València')
place(['quatre carreres'], 'Quatre Carreres', 'Valencia', 'district', 39.4530, -0.3640, 'Quatre Carreres, València')
place(['el grau'], 'El Grau', 'Valencia', 'district', 39.4600, -0.3330, 'el Grau, València')
place(['morvedre'], 'Morvedre', 'Valencia', 'district', 39.4840, -0.3740, 'Morvedre, València')
place(['algir'], 'Algirós', 'Valencia', 'district', 39.4700, -0.3500, 'Algirós, València')
place(['arrancapins'], 'Arrancapins', 'Valencia', 'district', 39.4650, -0.3880, 'Arrancapins, València')
place(['calvari'], 'El Calvari', 'Valencia', 'district', 39.4820, -0.3970, 'el Calvari, València')
place(['campanar'], 'Campanar', 'Valencia', 'district', 39.4820, -0.3970, 'Campanar, València')
place(['eliana'], "L'Eliana", "L'Eliana", 'city', 39.5660, -0.5280, "l'Eliana, Valencia, Spain")
place(['sierra perenchiza'], 'Sierra Perenchiza', 'Torrent', 'district', 39.4050, -0.5400, 'Sierra Perenchiza, Torrent')
place(['calicanto'], 'Calicanto', 'Torrent', 'district', 39.4080, -0.5480, 'Calicanto, Torrent')
place(['más camarena', 'mas camarena'], 'Mas Camarena', 'Bétera', 'district', 39.5550, -0.4880, 'Mas Camarena, Bétera')
place(['casas verdes'], 'Casas Verdes', 'Paterna', 'district', 39.5180, -0.4600, 'Casas Verdes, Paterna')
place(['camí real', 'cami real'], 'Jesús', 'Valencia', 'district', 39.4560, -0.3850, 'Jesús, València')
place(['jesús', 'jesus'], 'Jesús', 'Valencia', 'district', 39.4560, -0.3850, 'Jesús, València')
place(['la llum'], 'La Llum', 'Valencia', 'district', 39.4680, -0.4000, 'la Llum, València')
place(['olivereta'], "L'Olivereta", 'Valencia', 'district', 39.4680, -0.4000, "l'Olivereta, València")
place(['sant isidre'], 'Sant Isidre', 'Valencia', 'district', 39.4510, -0.3960, 'Sant Isidre, València')
place(['safranar'], 'Safranar', 'Valencia', 'district', 39.4580, -0.3890, 'Safranar, València')
place(['patraix'], 'Patraix', 'Valencia', 'district', 39.4600, -0.3940, 'Patraix, València')
place(['bétera', 'betera'], 'Bétera', 'Bétera', 'city', 39.5920, -0.4620, 'Bétera, Valencia, Spain')
place(['gandia', 'гандии', 'гандия'], 'Gandia', 'Gandia', 'city', 38.9680, -0.1800, 'Gandia, Valencia, Spain')
place(['mestalla'], 'Mestalla', 'Valencia', 'district', 39.4740, -0.3590, 'Mestalla, València')
place(['sant francesc'], 'Sant Francesc', 'Valencia', 'district', 39.4700, -0.3770, 'Sant Francesc, Ciutat Vella, València')
place(['mislata'], 'Mislata', 'Mislata', 'city', 39.4750, -0.4160, 'Mislata, Valencia, Spain')
place(['moncada'], 'Moncada', 'Moncada', 'city', 39.5450, -0.3950, 'Montcada, Valencia, Spain')
place(['burjassot'], 'Burjassot', 'Burjassot', 'city', 39.5090, -0.4140, 'Burjassot, Valencia, Spain')
place(['botànic', 'botanic'], 'El Botànic', 'Valencia', 'district', 39.4760, -0.3870, 'el Botànic, València')
place(['godella'], 'Godella', 'Godella', 'city', 39.5200, -0.4110, 'Godella, Valencia, Spain')
place(['maestro rodrigo'], 'Campanar', 'Valencia', 'district', 39.4830, -0.4020, 'Campanar, València')
place(['carrasca'], 'La Carrasca', 'Valencia', 'district', 39.4800, -0.3420, 'la Carrasca, València')
place(['xirivella'], 'Xirivella', 'Xirivella', 'city', 39.4660, -0.4280, 'Xirivella, Valencia, Spain')
place(['carmen', 'carme'], 'El Carme', 'Valencia', 'district', 39.4790, -0.3800, 'el Carme, València')
place(['malvarrosa', 'malva-rosa'], 'La Malva-rosa', 'Valencia', 'district', 39.4790, -0.3250, 'la Malva-rosa, València')
place(['extramurs'], 'Extramurs', 'Valencia', 'district', 39.4690, -0.3860, 'Extramurs, València')
place(['natzaret'], 'Natzaret', 'Valencia', 'district', 39.4460, -0.3320, 'Natzaret, València')
place(['quart de poblet'], 'Quart de Poblet', 'Quart de Poblet', 'city', 39.4810, -0.4410, 'Quart de Poblet, Valencia, Spain')
place(['roqueta'], 'La Roqueta', 'Valencia', 'district', 39.4660, -0.3790, 'la Roqueta, València')
place(['trinitat'], 'La Trinitat', 'Valencia', 'district', 39.4800, -0.3730, 'la Trinitat, València')
place(['ciutat vella'], 'Ciutat Vella', 'Valencia', 'district', 39.4750, -0.3770, 'Ciutat Vella, València')
place(['eixample'], "L'Eixample", 'Valencia', 'district', 39.4640, -0.3700, "l'Eixample, València")
place(['torrent', 'торрент'], 'Torrent', 'Torrent', 'city', 39.4370, -0.4650, 'Torrent, Valencia, Spain')
place(['manises'], 'Manises', 'Manises', 'city', 39.4930, -0.4630, 'Manises, Valencia, Spain')
place(['paterna'], 'Paterna', 'Paterna', 'city', 39.5030, -0.4400, 'Paterna, Valencia, Spain')
place(['valència', 'valencia'], None, 'Valencia', 'city', 39.4699, -0.3763, 'València, Valencia, Spain')

# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------
def flatten(t, drop_strike=False):
    """Telegram text (str or list of str/entities) -> plain text."""
    if isinstance(t, str):
        return t
    out = []
    for e in t:
        if isinstance(e, str):
            out.append(e)
        elif drop_strike and e.get('type') == 'strikethrough':
            out.append(' ')
        else:
            out.append(e.get('text', ''))
    return ''.join(out)

def entities(m, kind):
    return [e for e in m.get('text_entities', []) if e.get('type') == kind]

def strip_emoji(s):
    return ''.join(ch for ch in s if not unicodedata.category(ch).startswith('S')
                   and ch not in '️‍').strip()

def num(s):
    return int(re.sub(r'[^\d]', '', s)) if s and re.search(r'\d', s) else None

WORDNUM = {'одной': 1, 'одна': 1, 'одну': 1, 'одной': 1, 'двумя': 2, 'две': 2, 'двух': 2, 'тремя': 3, 'три': 3,
           'трёх': 3, 'трех': 3, 'четырьмя': 4, 'четыре': 4, 'четырёх': 4, 'четырех': 4, 'пятью': 5, 'пять': 5,
           'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5}

def count(t, stem):
    for pat in (r'(\d+)\s*(?:просторн\w+\s+|отдельн\w+\s+|полноценн\w+\s+|больш\w+\s+)?' + stem,
                stem + r'\w*\s*:\s*(\d+)'):
        m = re.search(pat, t, re.I)
        if m:
            return int(m.group(1))
    m = re.search(r'(\w+)\s+(?:просторн\w+\s+|отдельн\w+\s+)?' + stem, t, re.I)
    return WORDNUM.get(m.group(1).lower()) if m else None

PRICE_NUM = r'(\d{1,3}(?:[\s.  ,]\d{3})+|\d+)'

def find_price(t):
    """Current price (strikethrough already removed). Returns (price, from, range)."""
    pats = [r'Цена:?\s*(?:от\s*)?(?:€\s*)?' + PRICE_NUM + r'\s*(?:€|eur)?',
            r'€\s*' + PRICE_NUM,
            PRICE_NUM + r'\s*(?:€|eur\b|евро)']
    for p in pats:
        for m in re.finditer(p, t, re.I):
            v = num(m.group(1))
            if v and v >= 300:
                return v
    return None

# ---------------------------------------------------------------------------
# Field extraction
# ---------------------------------------------------------------------------
STATUS_WORDS = re.compile(r'^(сдана|сдан|продана|продан|sold|rented)\b', re.I)
FACT_EMOJI = set('📅📐🏢🏠🛏🛁🚽💶👀')
SKIP_TITLE = re.compile(r'^(локация|📅|#|доступ|заселение|просмотр|цена)', re.I)

TYPE_RULES = [(r'участ|terreno|parcela', 'land', None), (r'вилл|villa', 'villa', None),
              (r'таунхаус|adosad', 'townhouse', None), (r'пентхаус|аттико|ático|atico', 'apartment', 'penthouse'),
              (r'дуплекс|duplex|двухуровнев', 'apartment', 'duplex'), (r'лофт|loft', 'apartment', 'loft'),
              (r'студи', 'studio', None), (r'локал|офис|коммерч|помещени', 'commercial', None),
              (r'квартир|apartamento|piso', 'apartment', None), (r'\bдом(а|е|ов)?\b|\bдомик|casa|chalet', 'house', None)]

FEATURES = [
    ('terrace', r'террас'), ('balcony', r'балкон'), ('pool', r'бассейн|piscina'),
    ('parking', r'паркин|парковк|паркомест|парко мест|гараж|garaje'), ('storage', r'кладов|trastero'),
    ('air_conditioning', r'кондицион'), ('heating', r'отоплен'), ('furnished', r'меблир|с мебел'),
    ('garden', r'\bсад(ом|ик)?\b|собственн\w+ сад'), ('elevator', r'(?<!без )лифт'),
    ('new_build', r'новостро|новая квартира|новой квартир|obra nueva|новый жилой комплекс'),
    ('renovated', r'ремонт'), ('sea_view', r'вид\w* на море|вид\w* на мор'),
    ('near_beach', r'пляж|у моря|рядом с морем|возле моря|до моря'),
    ('concierge', r'консьерж'), ('padel', r'падел'), ('pets_allowed', r'с животными|животные разрешены'),
]

STREET_RE = (r'((?:Calle|Carrer|C/|Avenida|Avinguda|Avda\.?|Av\.|Paseo|Passeig|Plaza|Plaça|Camino)'
                  r"\s+(?:de(?:l| la| les| los| las)?\s+|d['’])?[A-ZÁÉÍÓÚÀÈÒÇÑ][\wÁÉÍÓÚÀÈÒÇÑáéíóúàèòçñ'’.-]*"
                  r"(?:\s+(?:de(?:l| la| les)?\s+)?[A-ZÁÉÍÓÚÀÈÒÇÑ][\wáéíóúàèòçñ'’.-]*){0,3})")

def extract_address(t, location_text):
    """The property's own street: from the 'Локация' line, or 'на улице X' / 'на Carrer X'.
    Streets after 'рядом' (nearby landmarks) are ignored on purpose."""
    m = location_text and re.search(STREET_RE, location_text)
    if m:
        return m.group(1).strip(' .,')
    m = re.search(r'(?<!вид )(?<!видом )(?<!виды )\bна\s+' + STREET_RE, t)
    if m:
        return m.group(1).strip(' .,')
    m = re.search(r'на улице\s+([A-ZÁÉÍÓÚÀÈÒÇÑ][\wáéíóúàèòçñ\'’.-]*(?:\s+[A-ZÁÉÍÓÚÀÈÒÇÑ][\wáéíóúàèòçñ\'’.-]*){0,3})', t)
    return ('Calle ' + m.group(1)).strip(' .,') if m else None

def match_place(*texts):
    for txt in texts:
        if not txt:
            continue
        low = txt.lower()
        for pats, district, city, level, lat, lon, query in P:
            if any(p in low for p in pats):
                return {'district': district, 'city': city, 'level': level, 'lat': lat, 'lon': lon,
                        'query': query, 'match': pats[0]}
    return None

def make_title(text, ptype, subtype, district, deal):
    for line in text.strip().split('\n')[:4]:
        raw = line.strip()
        if raw.startswith('📌') or 'Локация' in raw:
            break  # anything after the location line is body text, not a title
        s = strip_emoji(line).strip(' .')
        if len(s) < 12 or STATUS_WORDS.match(s) or SKIP_TITLE.match(s) or raw[:1] in FACT_EMOJI:
            continue
        return s[:140]
    # generated fallback, English
    kind = (subtype or ptype or 'property').replace('_', ' ')
    verb = {'rent': 'for rent', 'sale': 'for sale'}.get(deal, '')
    return ' '.join(x for x in [kind.capitalize(), verb, f'in {district}' if district else ''] if x)

def parse(text, clean):
    """text: full plain text; clean: text with strikethrough (old prices) removed."""
    low = text.lower()
    r = {}
    loc = re.search(r'Локация:?\s*([^\n]+)', text)
    r['location_text'] = loc.group(1).split('. ')[0].strip(' .') if loc else None

    head = low[:120]
    r['status'] = 'rented' if re.search(r'\bсдана?\b', head) else 'sold' if re.search(r'\bпродана?\b', head) else 'available'

    price = find_price(clean)
    rent = re.search(r'аренд|сда[её]тся|в мес|/мес|контракт|залог', low)
    sale = re.search(r'продаж|прода[её]тся|продается|продажи|инвест', low)
    if price and price >= 20000: deal = 'sale'
    elif price and price < 15000: deal = 'rent'
    elif sale and not re.search(r'аренд', low[:200]): deal = 'sale'
    elif rent: deal = 'rent'
    else: deal = None
    if r['status'] == 'rented': deal = deal or 'rent'
    if r['status'] == 'sold': deal = deal or 'sale'
    # the channel sometimes marks a sold flat as "сдана": keep status consistent with the deal type
    if r['status'] == 'rented' and deal == 'sale': r['status'] = 'sold'
    if r['status'] == 'sold' and deal == 'rent': r['status'] = 'rented'
    r['deal_type'] = deal
    r['price_eur'] = price
    r['price_period'] = ('month' if deal == 'rent' else 'total') if price else None
    r['price_from'] = bool(re.search(r'Цена:?\s*от|по цене\s*€?\s*\d[\d\s.]*\s*-\s*€?\s*\d', clean))
    r['negotiable'] = bool(re.search(r'\bторг', low))

    title_low = ' '.join(text.strip().split('\n')[:3]).lower()
    ptype, sub = 'apartment' if re.search(r'спальн|ванн', low) else 'other', None
    for pat, v, s in TYPE_RULES:
        if re.search(pat, title_low):
            ptype, sub = v, s
            break
    r['property_type'], r['property_subtype'] = ptype, sub

    a = (re.search(r'(?:Площадь:?\s*|📐\s*)(?:около\s*)?(\d[\d\s]*)\s*(?:м|m)', text)
         or re.search(r'(\d{2,4})\s*(?:м²|м2|m²|m2|кв\.?\s*м)', text))
    r['area_m2'] = num(a.group(1)) if a else None
    r['plot_m2'] = None
    two = re.search(r'Площадь:?\s*(\d[\d\s]*)\s*м²?\s*[-–/]\s*(\d[\d\s]*)\s*м', text)
    if two:  # "750 м² - 150 м²": plot and built area
        x, y = sorted([num(two.group(1)), num(two.group(2))])
        r['area_m2'], r['plot_m2'] = x, y
    plot = re.search(r'(?:участ\w*|parcela)\D{0,25}?(\d[\d\s]*)\s*м', text, re.I)
    if plot and not r['plot_m2'] and r['property_type'] != 'land':
        r['plot_m2'] = num(plot.group(1))
    ter = re.search(r'[Тт]ерраса?\w*\s*(?:около\s*|площадью\s*)?(\d+)\s*м|(\d+)\s*м²?\s*террас', text)
    r['terrace_m2'] = num(next(g for g in ter.groups() if g)) if ter else None
    r['bedrooms'] = count(low, r'спал') or count(low, r'bedroom') or count(low, r'habitaci')
    r['bathrooms'] = count(low, r'ванн') or count(low, r'санузл') or count(low, r'bathroom') or count(low, r'baño')
    # "4 этаж" / "на 15-м этаже" = floor; "3 этажа", "четырёхэтажный" = number of storeys (ignored)
    fl = re.search(r'Этаж:?\s*(\d+)|(\d+)[-\s]*(?:й|м)?\s*этаж(?!а|ей|н)', text)
    r['floor'] = num(next(g for g in fl.groups() if g)) if fl else None
    if r['floor'] is None and re.search(r'\bbajo\b|нижний этаж|первый этаж', low):
        r['floor'] = 0

    r['features'] = [f for f, pat in FEATURES if re.search(pat, low)]
    oid = re.search(r'\bID\s*:?\s*(\d{3,5})\b', text, re.I)
    r['sunline_id'] = oid.group(1) if oid else None
    r['address_text'] = extract_address(text, r['location_text'])
    return r

def offset(key, lat, lon, level):
    """Deterministic jitter from id, so markers in one area don't overlap."""
    h = hashlib.md5(key.encode()).digest()
    radius = {'district': 0.0025, 'city': 0.005, 'street': 0.0004}.get(level, 0)
    dx = (h[0] / 255 - 0.5) * 2 * radius
    dy = (h[1] / 255 - 0.5) * 2 * radius
    return round(lat + dy, 6), round(lon + dx * 1.3, 6)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    d = json.load(open(RAW, encoding='utf-8'))
    msgs = [m for m in d['messages'] if m.get('type') == 'message']

    # group albums: a new post starts at a message with text, or after a >30 s gap
    posts, cur = [], None
    for m in msgs:
        text = flatten(m.get('text', ''))
        gap = cur and int(m['date_unixtime']) - int(cur['_last']) > 30
        if text.strip() or cur is None or gap:
            cur = {'msg': m, 'text': text, 'clean': flatten(m.get('text', ''), drop_strike=True),
                   'photos': [], '_last': m['date_unixtime']}
            posts.append(cur)
        if 'photo' in m and not str(m['photo']).startswith('(File'):
            cur['photos'].append('raw/' + m['photo'])
        cur['_last'] = m['date_unixtime']

    listings, skipped = {}, []
    for p in posts:
        if not p['text'].strip():
            skipped.append(p['msg']['id']); continue
        r = parse(p['text'], p['clean'])
        if not (r['location_text'] or r['price_eur'] or r['area_m2']):  # not a listing
            skipped.append(p['msg']['id']); continue
        m = p['msg']
        pid = f"sunline-{m['id']}"
        old_prices = [num(e['text']) for e in entities(m, 'strikethrough') if num(e['text'])]
        pl = match_place(r['location_text'], p['text'][:600], p['text'])
        title = make_title(p['text'], r['property_type'], r['property_subtype'], pl and pl['district'], r['deal_type'])
        hashtags = sorted({e['text'] for e in entities(m, 'hashtag')} | set(re.findall(r'#\w+', p['text'])))
        links = [e['href'] for e in entities(m, 'text_link') if e.get('href')] + \
                [e['text'] for e in entities(m, 'link')]
        lat = lon = None
        prec = 'none'
        if pl:
            lat, lon = offset(r['sunline_id'] or pid, pl['lat'], pl['lon'], pl['level'])
            prec = pl['level']
        item = {
            'id': pid, 'source_message_id': m['id'], 'source_url': f'https://t.me/{CHANNEL}/{m["id"]}',
            'posted_at': m['date'], 'title': title, **r,
            'old_price_eur': max(old_prices) if old_prices and r['price_eur'] and max(old_prices) > r['price_eur'] else None,
            'district': pl['district'] if pl else None, 'city': pl['city'] if pl else None,
            'lat': lat, 'lon': lon, 'geo_precision': prec, 'geo_source': 'table' if pl else None,
            'geo_query': pl['query'] if pl else None, 'geo_match': pl['match'] if pl else None,
            'hashtags': hashtags, 'links': links,
            'description': p['text'].strip(), 'photos': p['photos'],
        }
        key = r['sunline_id'] or (re.sub(r'\W+', '', title.lower())[:60] + str(r['area_m2']))
        prev = listings.get(key)
        if prev:  # same object re-posted or a status update: keep newest, remember earlier posts
            item['earlier_posts'] = prev.get('earlier_posts', []) + [prev['source_url']]
            if not item['photos']:
                item['photos'] = prev['photos']
            if r['status'] != 'available':
                for k in ('price_eur', 'price_period', 'area_m2', 'bedrooms', 'bathrooms', 'floor', 'property_type',
                          'property_subtype', 'terrace_m2', 'deal_type', 'address_text', 'district', 'city',
                          'location_text', 'lat', 'lon', 'geo_precision', 'geo_source', 'geo_query', 'geo_match'):
                    if item.get(k) in (None, 'other') and prev.get(k) is not None:
                        item[k] = prev[k]
                item['features'] = sorted(set(item['features']) | set(prev['features']))
                if STATUS_WORDS.match(strip_emoji(p['text'].strip().split('\n')[0])) and len(p['text']) < 200:
                    item['title'] = prev['title']
                    item['description'] = prev['description'] + '\n\n— ' + p['text'].strip()
        else:
            item['earlier_posts'] = []
        listings[key] = item

    out = sorted(listings.values(), key=lambda x: x['posted_at'], reverse=True)
    json.dump({'source': f'https://t.me/{CHANNEL}', 'exported_at': msgs[-1]['date'], 'count': len(out),
               'note': 'Private sample data, listings and photos belong to SunLine. Do not publish.',
               'listings': out}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'posts: {len(posts)}, listings: {len(out)}, skipped: {len(skipped)}')
    print(' ', Counter(x['deal_type'] for x in out), Counter(x['status'] for x in out))
    print(' ', Counter(x['property_type'] for x in out))
    print('  wrote', OUT)

if __name__ == '__main__':
    main()
