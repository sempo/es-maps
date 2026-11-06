import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LngLatBoundsLike, StyleSpecification } from 'maplibre-gl';
// MapLibre 6 looks for its worker next to its own module, which Vite's bundling moves;
// point it at the (self-contained) worker file explicitly.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Listing } from '../lib/types';
import { formatPrice, formatShortPrice, placeLabel, PRECISION_LABELS, typeLabel } from '../lib/format';
import { Photo } from './Photo';

maplibregl.setWorkerUrl(workerUrl);

export const COLORS = { rent: '#0e7c86', sale: '#c2410c', closed: '#9ca3af', mixed: '#475569' };

const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const RASTER_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
const FONT = ['Noto Sans Bold'];
const VALENCIA: [number, number] = [-0.376, 39.47];

export type Bounds = { west: number; south: number; east: number; north: number };

interface Props {
  listings: Listing[]; // already filtered; those without coordinates are skipped here
  hoveredId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenDetail: (id: string) => void;
  onBoundsChange: (b: Bounds) => void;
  fitKey: string; // when this changes, zoom to fit the current results
}

function toGeoJSON(listings: Listing[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: listings
      .filter((l) => l.lat != null && l.lon != null)
      .map((l) => ({
        type: 'Feature',
        id: l.source_message_id,
        geometry: { type: 'Point', coordinates: [l.lon!, l.lat!] },
        properties: {
          id: l.id,
          deal: l.status !== 'available' ? 'closed' : l.deal_type ?? 'closed',
          label: formatShortPrice(l),
        },
      })),
  };
}

function point(l: Listing | undefined): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: l && l.lat != null ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [l.lon!, l.lat!] }, properties: {} }] : [],
  };
}

function addLayers(map: maplibregl.Map) {
  if (map.getSource('listings')) return;
  map.addSource('listings', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterRadius: 42,
    clusterMaxZoom: 15,
    clusterProperties: {
      rent: ['+', ['case', ['==', ['get', 'deal'], 'rent'], 1, 0]],
      sale: ['+', ['case', ['==', ['get', 'deal'], 'sale'], 1, 0]],
    },
  });
  map.addSource('highlight', { type: 'geojson', data: point(undefined) });

  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'listings',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'case',
        ['==', ['get', 'sale'], 0], COLORS.rent,
        ['==', ['get', 'rent'], 0], COLORS.sale,
        COLORS.mixed,
      ],
      'circle-radius': ['step', ['get', 'point_count'], 15, 5, 19, 15, 24, 40, 30],
      'circle-stroke-width': 3,
      'circle-stroke-color': 'rgba(255,255,255,0.85)',
    },
  });
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'listings',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': FONT, 'text-size': 13, 'text-allow-overlap': true },
    paint: { 'text-color': '#fff' },
  });
  map.addLayer({
    id: 'highlight',
    type: 'circle',
    source: 'highlight',
    paint: { 'circle-radius': 16, 'circle-color': 'rgba(250, 204, 21, 0.35)', 'circle-stroke-color': '#ca8a04', 'circle-stroke-width': 2.5 },
  });
  map.addLayer({
    id: 'points',
    type: 'circle',
    source: 'listings',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['match', ['get', 'deal'], 'rent', COLORS.rent, 'sale', COLORS.sale, COLORS.closed],
      'circle-radius': 8,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  });
  map.addLayer({
    id: 'point-labels',
    type: 'symbol',
    source: 'listings',
    filter: ['!', ['has', 'point_count']],
    minzoom: 13,
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
    paint: { 'text-color': '#111827', 'text-halo-color': '#fff', 'text-halo-width': 1.6 },
  });
}

export function MapView({ listings, hoveredId, selectedId, onSelect, onOpenDetail, onBoundsChange, fitKey }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [popupNode] = useState(() => document.createElement('div'));
  const [ready, setReady] = useState(0); // bumps on every style load
  const cb = useRef({ onSelect, onBoundsChange });
  cb.current = { onSelect, onBoundsChange };

  const byId = new Map(listings.map((l) => [l.id, l]));
  const selected = selectedId ? byId.get(selectedId) : undefined;

  // --- init once
  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: VECTOR_STYLE,
      center: VALENCIA,
      zoom: 11.3,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    let loaded = false;
    map.on('error', (e) => {
      // vector tiles unreachable before first load: fall back to plain OSM raster tiles
      if (!loaded && /style|tiles\.openfreemap/i.test(String(e.error?.message ?? ''))) {
        loaded = true;
        map.setStyle(RASTER_STYLE);
      }
    });
    map.on('style.load', () => {
      loaded = true;
      addLayers(map);
      setReady((v) => v + 1);
    });

    const emitBounds = () => {
      const b = map.getBounds();
      cb.current.onBoundsChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    };
    map.on('moveend', emitBounds);
    map.once('load', emitBounds);

    map.on('click', 'clusters', async (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const src = map.getSource('listings') as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.3 });
    });
    map.on('click', 'points', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) cb.current.onSelect(id);
    });
    for (const layer of ['clusters', 'points']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }
    // the pane can be hidden/resized by the layout (mobile list/map switch), not only the window
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current!);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- data
  useEffect(() => {
    const src = mapRef.current?.getSource('listings') as GeoJSONSource | undefined;
    src?.setData(toGeoJSON(listings));
  }, [listings, ready]);

  // --- fit to results when the filter set changes (not on every pan)
  const firstFit = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || ready === 0) return;
    const pts = listings.filter((l) => l.lat != null);
    if (!pts.length) return;
    if (firstFit.current) {
      firstFit.current = false;
      // first view: Valencia city, not the whole province (outliers like Dénia would zoom us out)
      const city = pts.filter((l) => Math.abs(l.lat! - VALENCIA[1]) < 0.12 && Math.abs(l.lon! - VALENCIA[0]) < 0.15);
      fit(map, city.length ? city : pts, false);
      return;
    }
    fit(map, pts, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  // --- hover / selection highlight
  useEffect(() => {
    const src = mapRef.current?.getSource('highlight') as GeoJSONSource | undefined;
    src?.setData(point(byId.get(hoveredId ?? '') ?? selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId, selectedId, ready, listings]);

  // --- popup for the selected listing
  useEffect(() => {
    const map = mapRef.current;
    popupRef.current?.remove();
    popupRef.current = null;
    if (!map || !selected || selected.lat == null) return;
    const lngLat: [number, number] = [selected.lon!, selected.lat!];
    if (!map.getBounds().contains(lngLat)) {
      map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 14) });
    }
    const popup = new maplibregl.Popup({ offset: 14, maxWidth: '300px', closeOnClick: true, focusAfterOpen: false })
      .setLngLat(lngLat)
      .setDOMContent(popupNode)
      .addTo(map);
    popup.on('close', () => {
      if (popupRef.current === popup) cb.current.onSelect(null);
    });
    popupRef.current = popup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ready]);

  return (
    <div className="map-wrap">
      <div ref={container} className="map" />
      <div className="map-legend" aria-label="Legend">
        <span><i style={{ background: COLORS.rent }} /> Rent</span>
        <span><i style={{ background: COLORS.sale }} /> Sale</span>
        <span><i style={{ background: COLORS.closed }} /> Rented / sold</span>
        <span><i style={{ background: COLORS.mixed }} /> Mixed cluster</span>
      </div>
      {selected &&
        createPortal(
          <div className="popup-card">
            <Photo src={selected.photos[0]} alt={selected.title} className="popup-photo" />
            <div className="popup-body">
              <div className="popup-price">{formatPrice(selected)}</div>
              <div className="popup-facts">
                {typeLabel(selected)} · {selected.area_m2 != null ? `${selected.area_m2} m²` : 'area not specified'} ·{' '}
                {selected.bedrooms != null ? `${selected.bedrooms} bedrooms` : 'bedrooms not specified'}
              </div>
              <div className="popup-place">{placeLabel(selected)}</div>
              {selected.geo_precision !== 'address' && (
                <div className="popup-precision">{PRECISION_LABELS[selected.geo_precision]}</div>
              )}
              <div className="popup-actions">
                <button className="btn btn-primary btn-sm" onClick={() => onOpenDetail(selected.id)}>
                  Details
                </button>
                <a className="btn btn-sm" href={selected.source_url} target="_blank" rel="noreferrer">
                  View in Telegram ↗
                </a>
              </div>
            </div>
          </div>,
          popupNode,
        )}
    </div>
  );
}

function fit(map: maplibregl.Map, pts: Listing[], animate: boolean) {
  if (pts.length === 1) {
    map.easeTo({ center: [pts[0].lon!, pts[0].lat!], zoom: 14, animate });
    return;
  }
  const lons = pts.map((l) => l.lon!);
  const lats = pts.map((l) => l.lat!);
  const b: LngLatBoundsLike = [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
  map.fitBounds(b, { padding: 50, maxZoom: 15, animate, duration: animate ? 600 : 0 });
}
