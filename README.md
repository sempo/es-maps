# es-maps: Valencia real-estate map (prototype)

A time2map prototype. It shows listings from the Telegram channel
"Недвижимость Валенсия | SunLine" on a map, with full-text search and filters.
See [data/BRIEF.md](data/BRIEF.md) for the full brief.

> **Private sample data.** The listings and photos belong to SunLine. `data/raw/`,
> `data/properties.json` and `dist/` are git-ignored. Don't deploy or publish them
> without the agency's permission.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (filters, URL state, search, formatting)
npm run build        # static build in dist/ (copies properties.json + listing photos)
```

There is no backend: the app loads `/data/properties.json` and the photos. In dev
a small Vite plugin serves only `data/properties.json` and `data/raw/photos/*`.
Everything else under `data/` (raw export, scripts) returns 404.

## Data pipeline

```bash
npm run data         # = the three steps below
python3 data/scripts/parse_export.py   # data/raw/result.json -> data/properties.json
python3 data/scripts/geocode.py        # Nominatim, cached in data/geocode_cache.json
python3 data/scripts/check_quality.py  # coverage report + schema checks (exit 1 on errors)
```

To import a new Telegram Desktop export, drop it into `data/raw/` (`result.json` +
`photos/`) and run `npm run data`. Geocoding only calls Nominatim for places that
aren't in the cache yet (max 1 request/s, identifying User-Agent). Pass `--offline`
to use the cache only.

**Parser** (`parse_export.py`, regex only):
- Groups album messages into one listing. Skips posts that aren't listings.
- Drops ~~struck-through~~ prices (old prices before a reduction) and keeps them as `old_price_eur`.
- Tells the floor ("4 этаж") apart from the number of storeys ("3 этажа").
- Tells the plot apart from the built area ("750 м² - 150 м²").
- Extracts `district`, `city`, `address_text`, `hashtags` and `links`. Penthouse, duplex and loft go to `property_subtype`, so `property_type` keeps the brief's enum.
- Merges reposts and "сдана/продана" status updates of the same object (by SunLine ID or by title + area) and keeps links to the earlier posts.
- Never invents values: a field that isn't in the post is `null`.

**Geocoding** (`geocode.py`): uses the street from the post if there is one, otherwise the
district, otherwise the town. Queries for Valencia city are bounded to the city.
Nominatim confuses several neighbourhood names with other places of the same name
(Aiora with the town of Ayora, Gran Via with a street in Alicante, Morvedre with Sagunto).
Each result is therefore checked against the hand-made district table, and
the table point is kept if Nominatim's result is too far away. Points that aren't at
street level get a deterministic offset (from the id), so markers don't stack. The UI shows
"approximate location: district / town / street".

Current quality (84 listings: 44 rent, 40 sale):

| field | coverage |
|---|---|
| price | 84/84 |
| area | 84/84 |
| bedrooms | 81/84 |
| bathrooms | 79/84 |
| coordinates | 84/84: 4 street, 65 district, 15 town |

## App

Vite + React + TypeScript, MapLibre GL JS with OpenFreeMap vector tiles (OSM data,
no API key). If those tiles can't be reached, it falls back to OSM raster tiles.
Search uses Fuse.js.

- **Map:** clustered markers, coloured by deal type (rent / sale / rented-sold / mixed cluster). Prices show from zoom 13. Clicking a marker opens a card with photo, price, size, bedrooms, district, a "View in Telegram" link and a Details button.
- **List:** sortable. Hovering a card highlights its marker, even inside a cluster. "Only listings in the visible map area" limits the list to the visible map. Listings without coordinates are listed and marked "not on map".
- **Search:** fuzzy and accent-insensitive. Every word must match. Cyrillic words are also tried transliterated ("руссафа" finds Russafa). Features can be found in English or Russian ("pool", "бассейн").
- **Filters:** deal, price (separate for rent and sale), area, bedrooms (1/2/3/4+), property type, district (with live counts) and features. Rented/sold listings are hidden by default. All state is kept in the URL, including the open listing (`?id=`), so a view can be shared.
- **Detail:** photo gallery (arrow keys), all extracted fields, the original post, links to Telegram, the agency page and earlier posts. Missing values show as "not specified", never as 0.
- **Responsive:** on narrow screens the filters move into a drawer, and you switch between list and map.

```
src/
  App.tsx                 state, URL sync, layout
  components/             MapView, FiltersPanel, ListingCard, DetailModal, Photo
  lib/filters.ts          filter logic, sorting, URL <-> state
  lib/search.ts           Fuse index, transliteration
  lib/format.ts           labels, price/number formatting
data/scripts/             parse_export.py, geocode.py, check_quality.py
```

## Known limitations and next steps

- No LLM pass yet: regex coverage is already high, but ~4% of posts have no bedroom count. A Claude pass for missing fields (brief Step 1) needs `ANTHROPIC_API_KEY`.
- Few posts give a street, so most points are approximate (district centre + offset). "Sierra Perenchiza" uses the hand-made table point because Nominatim returns a school with that name.
- Deduplication is exact (SunLine ID or title + area). Fuzzy matching of the same flat posted with different text is a possible next step.
- Further ideas from the brief: scheduled re-import, and a price-per-m² heatmap by district.
