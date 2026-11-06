import type { DealType, Listing, PropertyType } from './types';
import { pricePerM2 } from './format';

export type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'area_desc' | 'ppm_asc';

export interface Range {
  min: number | null;
  max: number | null;
}

export interface FilterState {
  q: string;
  deal: 'all' | DealType;
  types: PropertyType[];
  rent: Range;
  sale: Range;
  area: Range;
  /** 1, 2, 3, 4 (= 4 or more) */
  beds: number[];
  districts: string[];
  features: string[];
  /** include rented / sold listings */
  showClosed: boolean;
  /** limit the list to the visible map area */
  inView: boolean;
  sort: SortKey;
}

export const EMPTY_RANGE: Range = { min: null, max: null };

export const DEFAULT_FILTERS: FilterState = {
  q: '',
  deal: 'all',
  types: [],
  rent: EMPTY_RANGE,
  sale: EMPTY_RANGE,
  area: EMPTY_RANGE,
  beds: [],
  districts: [],
  features: [],
  showClosed: false,
  inView: false,
  sort: 'newest',
};

const SORTS: SortKey[] = ['newest', 'price_asc', 'price_desc', 'area_desc', 'ppm_asc'];

const isActive = (r: Range) => r.min != null || r.max != null;

function inRange(v: number | null, r: Range): boolean {
  if (!isActive(r)) return true;
  if (v == null) return false; // unknown value can't satisfy an explicit range
  return (r.min == null || v >= r.min) && (r.max == null || v <= r.max);
}

/** Every filter except text search, map area and (optionally) one facet to leave out. */
export function matches(l: Listing, f: FilterState, skip?: 'districts'): boolean {
  if (!f.showClosed && l.status !== 'available') return false;
  if (f.deal !== 'all' && l.deal_type !== f.deal) return false;
  if (f.types.length && !f.types.includes(l.property_type)) return false;
  if (l.deal_type === 'rent' && !inRange(l.price_eur, f.rent)) return false;
  if (l.deal_type === 'sale' && !inRange(l.price_eur, f.sale)) return false;
  if (l.deal_type == null && (isActive(f.rent) || isActive(f.sale))) return false;
  if (!inRange(l.area_m2, f.area)) return false;
  if (f.beds.length) {
    if (l.bedrooms == null) return false;
    if (!f.beds.some((b) => (b >= 4 ? l.bedrooms! >= 4 : l.bedrooms === b))) return false;
  }
  if (skip !== 'districts' && f.districts.length && !f.districts.includes(l.district ?? '')) return false;
  if (f.features.length && !f.features.every((x) => l.features.includes(x))) return false;
  return true;
}

export function sortListings(list: Listing[], sort: SortKey): Listing[] {
  const nullsLast = (a: number | null, b: number | null, dir: 1 | -1) =>
    a == null ? (b == null ? 0 : 1) : b == null ? -1 : (a - b) * dir;
  const out = [...list];
  switch (sort) {
    case 'price_asc': return out.sort((a, b) => nullsLast(a.price_eur, b.price_eur, 1));
    case 'price_desc': return out.sort((a, b) => nullsLast(a.price_eur, b.price_eur, -1));
    case 'area_desc': return out.sort((a, b) => nullsLast(a.area_m2, b.area_m2, -1));
    case 'ppm_asc': return out.sort((a, b) => nullsLast(pricePerM2(a), pricePerM2(b), 1));
    default: return out.sort((a, b) => b.posted_at.localeCompare(a.posted_at));
  }
}

export function activeFilterCount(f: FilterState): number {
  return [
    f.deal !== 'all', f.types.length > 0, isActive(f.rent), isActive(f.sale), isActive(f.area),
    f.beds.length > 0, f.districts.length > 0, f.features.length > 0, f.showClosed,
  ].filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// URL query <-> state.  e.g. ?deal=rent&rent=800-1500&beds=2&beds=3&district=Russafa&feat=terrace
// ---------------------------------------------------------------------------
function parseNum(s: string | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseRange(s: string | null): Range {
  if (!s) return EMPTY_RANGE;
  const [a, b] = s.split('-');
  return { min: parseNum(a), max: parseNum(b) };
}

function rangeParam(r: Range): string | null {
  return isActive(r) ? `${r.min ?? ''}-${r.max ?? ''}` : null;
}

export function filtersFromQuery(search: string): FilterState {
  const p = new URLSearchParams(search);
  const deal = p.get('deal');
  const sort = p.get('sort') as SortKey | null;
  return {
    q: p.get('q') ?? '',
    deal: deal === 'rent' || deal === 'sale' ? deal : 'all',
    types: p.getAll('type') as PropertyType[],
    rent: parseRange(p.get('rent')),
    sale: parseRange(p.get('sale')),
    area: parseRange(p.get('area')),
    beds: p.getAll('beds').map(Number).filter((n) => n >= 1 && n <= 4),
    districts: p.getAll('district'),
    features: p.getAll('feat'),
    showClosed: p.get('closed') === '1',
    inView: p.get('inview') === '1',
    sort: sort && SORTS.includes(sort) ? sort : 'newest',
  };
}

export function filtersToQuery(f: FilterState, selectedId?: string | null): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.deal !== 'all') p.set('deal', f.deal);
  f.types.forEach((t) => p.append('type', t));
  const ranges: [string, Range][] = [['rent', f.rent], ['sale', f.sale], ['area', f.area]];
  for (const [k, r] of ranges) {
    const v = rangeParam(r);
    if (v) p.set(k, v);
  }
  f.beds.forEach((b) => p.append('beds', String(b)));
  f.districts.forEach((d) => p.append('district', d));
  f.features.forEach((x) => p.append('feat', x));
  if (f.showClosed) p.set('closed', '1');
  if (f.inView) p.set('inview', '1');
  if (f.sort !== 'newest') p.set('sort', f.sort);
  if (selectedId) p.set('id', selectedId);
  const s = p.toString();
  return s ? `?${s}` : '';
}
