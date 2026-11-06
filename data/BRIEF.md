# Brief: Valencia Real-Estate Map (prototype)

## Goal

Build a small web app that shows real-estate listings from the Telegram channel
"Недвижимость Валенсия | SunLine" (t.me/sunlinespain) on an interactive map.
A user can find a property **on the map**, **by text search**, or **by filtering**
on common attributes (deal type, price, size, bedrooms, district).

This is a prototype for a time2map product idea: turning unstructured listing
posts into a searchable, map-based catalogue. Keep it simple, fast and local.

## Current state (6 Nov 2026)

Sample data is ready, so start with Step 3 and come back to Steps 1–2 later:

- `data/raw/`: the Telegram export, with 935 messages from 27 Oct to 6 Nov 2026 and 812 photos.
- `data/properties.json`: **85 unique listings** (45 rent, 40 sale), built by
  `data/scripts/parse_export.py`. It has the schema below plus a few extra fields:
  `status` (available / rented / sold), `price_from`, `negotiable`, `sunline_id`
  (the agency's own object ID), `location_text`, `geo_match` and `earlier_posts`
  (links to earlier posts of the same object).
- Coverage: price 81/85, area 85/85, bedrooms 74/85, coordinates 84/85.
- **Coordinates are approximate:** district centres from a hand-made table, with a
  small offset (`geo_precision: "district_approx"`). Replace them with real
  geocoding (Step 2) before showing the map to anyone.
- Photo paths in `properties.json` are relative to `data/`
  (e.g. `raw/photos/photo_29095@06-11-2026_15-51-41.jpg`).
- Known quirks: about 15% of posts have no explicit bedroom count; a few
  "сдана/продана" posts are status updates for the same object.

## Input data

`data/raw/` holds a Telegram Desktop export of the channel (JSON + photos):

- `result.json`: the export. Each item in `messages[]` is one Telegram message.
- `photos/`: images referenced by `messages[].photo` (relative paths).

Important details of the export format:

- **One listing = one album.** Telegram stores every photo of an album as a
  separate message. The listing text sits on one of them (usually the first).
  Group consecutive photo messages whose `date_unixtime` values are within a
  few seconds of each other into one listing; the message with non-empty text
  carries the description.
- `text` can be a string **or** an array of strings and entity objects
  (`{"type": "bold", "text": "..."}`, links, hashtags). Flatten it to plain
  text; keep links and hashtags separately.
- Skip service messages (`type != "message"`) and posts that are clearly not
  listings (news, ads, polls).
- Post language: mostly Russian, sometimes English or Spanish.

## Step 1: build `data/properties.json`

A first regex-based parser already exists (`data/scripts/parse_export.py`).
Improve it rather than starting over. Target schema per item:

```json
{
  "id": "sunline-12345",
  "source_url": "https://t.me/sunlinespain/12345",
  "posted_at": "2026-11-06T15:51:00",
  "deal_type": "rent | sale",
  "property_type": "apartment | house | villa | townhouse | studio | commercial | land | other",
  "price_eur": 1800,
  "price_period": "month | total",
  "area_m2": 90,
  "terrace_m2": 18,
  "bedrooms": 2,
  "bathrooms": 2,
  "floor": 3,
  "district": "Ruzafa",
  "city": "Valencia",
  "address_text": "as written in the post, if any",
  "lat": 39.462,
  "lon": -0.376,
  "geo_precision": "address | street | district | city | none",
  "features": ["terrace", "pool", "parking", "furnished", "air_conditioning", "elevator", "new_build", "sea_view"],
  "title": "short title generated from the post",
  "description": "full plain text of the post",
  "photos": ["photos/photo_1@06-11-2026_15-51-00.jpg"],
  "hashtags": ["#аренда", "#валенсия"]
}
```

Extraction rules:

- Use regexes first (prices with €, "м²/m²", "спальн", "bedroom", "ванн"),
  then an LLM pass (Claude API) for the fields regex misses. Store the LLM
  output as structured JSON, validated against the schema.
- Never invent values: if a field isn't in the post, set it to `null`.
- Keep `description` and `photos` untouched, so the parser can be re-run.

## Step 2: geocoding

Posts usually name a district or a street, not an exact address.

- Geocode with Nominatim (OpenStreetMap) at the most precise level available,
  and record it in `geo_precision`. Respect Nominatim's usage policy (1 request
  per second, a real User-Agent) and cache the results in `data/geocode_cache.json`.
- For district-level points, add a small deterministic offset (based on `id`)
  so markers in the same district don't sit on top of each other, and show the
  precision in the UI ("approximate location: district").
- Listings outside the Valencia region (e.g. Costa Blanca) stay in the data
  with their own coordinates.

## Step 3: the app

Stack (suggested, keep it light): Vite + React + TypeScript, MapLibre GL JS
with an OpenStreetMap-based tile style, all data loaded from the static
`properties.json`. No backend needed for the prototype.

Features:

1. **Map:** clustered markers; the marker colour shows the deal type (rent vs
   sale); clicking one opens a card with the first photo, price, size,
   bedrooms, district and a "View in Telegram" link.
2. **List panel:** results next to the map, synced with it (hovering a card
   highlights its marker; moving the map can filter the list to the visible area).
3. **Search:** full-text search over title, description, district and
   features (e.g. Fuse.js). Must work with Russian and Latin text.
4. **Filters:** deal type, property type, price range (separate for rent and
   sale), area range, bedrooms (1, 2, 3, 4+), district (multi-select) and
   features (checkboxes). Show the result count, and keep filters in the URL query.
5. **Detail view:** photo gallery, all extracted fields, original text, link
   to the source post.

## Quality bar

- Show `null` fields as "not specified", never as 0.
- Handle missing photos and listings without coordinates (list them, but not on the map).
- Write a quick check that reports how many listings were parsed, and how many
  have a price, an area and coordinates, so extraction quality is visible.

## Out of scope for now

Authentication, a database, automatic scraping of new posts, price analytics.
Possible next steps: a scheduled re-import, deduplicating the same property
posted twice, and price per m² heatmaps by district (a link to the
livability.time2map.com methodology).

## Legal note

The listings and photos belong to SunLine. Use them only as private sample
data for the prototype. Don't publish them without the agency's permission.
