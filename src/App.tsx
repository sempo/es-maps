import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useDataset } from './lib/useDataset';
import { DEFAULT_FILTERS, filtersFromQuery, filtersToQuery, matches, sortListings, type FilterState, type SortKey } from './lib/filters';
import { buildIndex, search } from './lib/search';
import { FiltersPanel } from './components/FiltersPanel';
import { ListingCard } from './components/ListingCard';
import { MapView, type Bounds } from './components/MapView';
import { DetailModal } from './components/DetailModal';
import type { Listing } from './lib/types';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  area_desc: 'Largest first',
  ppm_asc: 'Price per m²: low to high',
};

function inBounds(l: Listing, b: Bounds | null) {
  if (!b) return true;
  if (l.lat == null || l.lon == null) return true; // no coordinates: always listed
  return l.lat >= b.south && l.lat <= b.north && l.lon >= b.west && l.lon <= b.east;
}

export default function App() {
  const { data, error } = useDataset();
  const [filters, setFilters] = useState<FilterState>(() => filtersFromQuery(window.location.search));
  const [detailId, setDetailId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('id'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const query = useDeferredValue(filters.q);

  // --- URL <-> state
  useEffect(() => {
    const qs = filtersToQuery(filters, detailId);
    if (qs !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${qs}`);
  }, [filters, detailId]);
  useEffect(() => {
    const onPop = () => {
      setFilters(filtersFromQuery(window.location.search));
      setDetailId(new URLSearchParams(window.location.search).get('id'));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const listings = data?.listings ?? [];
  const index = useMemo(() => buildIndex(listings), [listings]);
  const byId = useMemo(() => new Map(listings.map((l) => [l.id, l])), [listings]);

  // filters + search -> results (map shows all of them)
  const results = useMemo(() => {
    const hits = search(index, query);
    const filtered = listings.filter((l) => matches(l, filters));
    if (!hits) return sortListings(filtered, filters.sort);
    const rank = new Map(hits.map((id, i) => [id, i]));
    const found = filtered.filter((l) => rank.has(l.id));
    return filters.sort === 'newest' ? found.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!) : sortListings(found, filters.sort);
  }, [index, query, listings, filters]);

  // list: optionally limited to the visible map area
  const listed = useMemo(
    () => (filters.inView ? results.filter((l) => inBounds(l, bounds)) : results),
    [results, filters.inView, bounds],
  );
  const onMap = results.filter((l) => l.lat != null).length;

  // re-fit the map only when the result set changes because of filters/search, not on pan
  const fitKey = useMemo(() => {
    const { inView: _a, sort: _b, ...rest } = filters;
    void _a; void _b;
    return JSON.stringify({ ...rest, q: query });
  }, [filters, query]);

  const update = useCallback((f: FilterState) => setFilters(f), []);
  const locate = useCallback((id: string) => {
    setDetailId(null);
    setSelectedId(id);
    setMobileView('map');
  }, []);

  const closeDetail = useCallback(() => setDetailId(null), []);
  const detail = detailId ? byId.get(detailId) : undefined;

  if (error) {
    return (
      <div className="fatal">
        <h1>Could not load listings</h1>
        <p>{error}</p>
        <p>Run <code>npm run data</code> to build <code>data/properties.json</code>, then reload.</p>
      </div>
    );
  }

  return (
    <div className={`app view-${mobileView} ${filtersOpen ? 'filters-open' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">◉</span>
          <div>
            <h1>Valencia Real-Estate Map</h1>
            <span className="sub">time2map prototype · listings from SunLine (Telegram)</span>
          </div>
        </div>
        <div className="search">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.5-1.5-5-5Zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z"/></svg>
          <input
            type="search"
            placeholder="Search: Russafa, терраса, бассейн, penthouse…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            aria-label="Search listings"
          />
        </div>
        <button className="btn filters-toggle" onClick={() => setFiltersOpen((o) => !o)}>
          Filters
        </button>
      </header>

      <div className="drawer-backdrop" onClick={() => setFiltersOpen(false)} />
      <aside className="sidebar" aria-label="Filters">
        {data ? <FiltersPanel listings={listings} filters={filters} onChange={update} /> : <div className="loading">Loading…</div>}
        <button className="btn btn-primary close-filters" onClick={() => setFiltersOpen(false)}>
          Show {results.length} results
        </button>
      </aside>

      <section className="results" aria-label="Results">
        <div className="results-head">
          <div className="count">
            <strong>{listed.length}</strong>
            {filters.inView && listed.length !== results.length && <span className="muted"> of {results.length}</span>}{' '}
            {listed.length === 1 && !filters.inView ? 'listing' : 'listings'}
            {filters.inView && listed.length !== results.length && <span className="muted"> in map area</span>}
            {!filters.inView && onMap !== results.length && <span className="muted"> · {results.length - onMap} not on map</span>}
          </div>
          <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortKey })} aria-label="Sort">
            {Object.entries(SORT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <label className="switch inview">
          <input type="checkbox" checked={filters.inView} onChange={(e) => setFilters({ ...filters, inView: e.target.checked })} />
          <span>Only listings in the visible map area</span>
        </label>
        <div className="list">
          {!data && <div className="loading">Loading listings…</div>}
          {data && listed.length === 0 && (
            <div className="empty">
              <p>No listings match.</p>
              <button className="btn" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>Clear search and filters</button>
            </div>
          )}
          {listed.map((l) => (
            <ListingCard key={l.id} listing={l} selected={l.id === selectedId || l.id === hoveredId}
              onHover={setHoveredId} onOpen={setDetailId} onLocate={locate} />
          ))}
        </div>
        {data && (
          <footer className="data-note">
            {data.count} listings in dataset · export {new Date(data.exported_at).toLocaleDateString('en-GB')} · private sample data, © SunLine. Map ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>.
          </footer>
        )}
      </section>

      <main className="map-pane">
        <MapView
          listings={results}
          hoveredId={hoveredId}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpenDetail={setDetailId}
          onBoundsChange={setBounds}
          fitKey={fitKey}
        />
      </main>

      <nav className="mobile-switch">
        <button className={mobileView === 'list' ? 'on' : ''} onClick={() => setMobileView('list')}>List</button>
        <button className={mobileView === 'map' ? 'on' : ''} onClick={() => setMobileView('map')}>Map</button>
      </nav>

      {detail && <DetailModal listing={detail} onClose={closeDetail} onShowOnMap={locate} />}
    </div>
  );
}
