import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filtersFromQuery, filtersToQuery, matches, sortListings, type FilterState } from './filters';
import { buildIndex, search, translit } from './search';
import { formatPrice, orNotSpecified } from './format';
import type { Listing } from './types';

function mk(p: Partial<Listing>): Listing {
  return {
    id: 'x', source_message_id: 1, source_url: '', posted_at: '2026-11-01T10:00:00', title: 'Квартира',
    location_text: null, status: 'available', deal_type: 'rent', price_eur: 1000, price_period: 'month',
    price_from: false, negotiable: false, old_price_eur: null, property_type: 'apartment', property_subtype: null,
    area_m2: 80, plot_m2: null, terrace_m2: null, bedrooms: 2, bathrooms: 1, floor: 2, features: [],
    sunline_id: null, address_text: null, district: 'Russafa', city: 'Valencia', lat: 39.46, lon: -0.37,
    geo_precision: 'district', geo_source: 'nominatim', hashtags: [], links: [], description: '', photos: [],
    earlier_posts: [], ...p,
  };
}
const f = (p: Partial<FilterState>): FilterState => ({ ...DEFAULT_FILTERS, ...p });

describe('filters', () => {
  it('hides rented/sold unless asked', () => {
    expect(matches(mk({ status: 'rented' }), DEFAULT_FILTERS)).toBe(false);
    expect(matches(mk({ status: 'rented' }), f({ showClosed: true }))).toBe(true);
  });
  it('applies rent and sale price ranges separately', () => {
    const rent = mk({ price_eur: 1500 });
    const sale = mk({ deal_type: 'sale', price_eur: 300000, price_period: 'total' });
    const state = f({ rent: { min: null, max: 1200 }, sale: { min: 250000, max: null } });
    expect(matches(rent, state)).toBe(false);
    expect(matches(sale, state)).toBe(true);
  });
  it('excludes unknown values only when that filter is active', () => {
    const l = mk({ bedrooms: null, price_eur: null });
    expect(matches(l, DEFAULT_FILTERS)).toBe(true);
    expect(matches(l, f({ beds: [2] }))).toBe(false);
    expect(matches(l, f({ rent: { min: 500, max: null } }))).toBe(false);
  });
  it('treats 4 as 4+ bedrooms', () => {
    expect(matches(mk({ bedrooms: 5 }), f({ beds: [4] }))).toBe(true);
    expect(matches(mk({ bedrooms: 3 }), f({ beds: [4] }))).toBe(false);
  });
  it('requires all selected features', () => {
    const l = mk({ features: ['pool', 'terrace'] });
    expect(matches(l, f({ features: ['pool'] }))).toBe(true);
    expect(matches(l, f({ features: ['pool', 'parking'] }))).toBe(false);
  });
  it('round-trips through the URL', () => {
    const state = f({
      q: 'терраса', deal: 'sale', types: ['villa'], sale: { min: 200000, max: null }, area: { min: 50, max: 120 },
      beds: [2, 4], districts: ['Russafa', "L'Eixample"], features: ['pool'], showClosed: true, inView: true, sort: 'price_asc',
    });
    const qs = filtersToQuery(state, 'sunline-1');
    expect(filtersFromQuery(qs)).toEqual(state);
    expect(new URLSearchParams(qs).get('id')).toBe('sunline-1');
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe('');
  });
  it('sorts with unknown prices last', () => {
    const out = sortListings([mk({ id: 'a', price_eur: null }), mk({ id: 'b', price_eur: 900 }), mk({ id: 'c', price_eur: 500 })], 'price_asc');
    expect(out.map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('search', () => {
  const data = [
    mk({ id: 'r', title: 'Квартира с террасой в Russafa', district: 'Russafa', features: ['terrace'] }),
    mk({ id: 'c', title: 'Пентхаус у моря', district: 'El Cabanyal', features: ['pool'] }),
  ];
  const idx = buildIndex(data);
  it('finds Cyrillic words', () => expect(search(idx, 'терраса')).toEqual(['r']));
  it('finds Latin district names, accent- and case-insensitive', () => expect(search(idx, 'cabanyal')).toEqual(['c']));
  it('finds a district typed in Cyrillic', () => expect(search(idx, 'руссафа')).toContain('r'));
  it('finds by English feature label', () => expect(search(idx, 'pool')).toEqual(['c']));
  it('ANDs words', () => expect(search(idx, 'russafa pool')).toEqual([]));
  it('returns null for an empty query', () => expect(search(idx, '  ')).toBeNull());
  it('transliterates', () => expect(translit('Руссафа')).toBe('russafa'));
});

describe('format', () => {
  it('never shows null as 0', () => {
    expect(orNotSpecified(null, ' m²')).toBe('not specified');
    expect(formatPrice(mk({ price_eur: null }))).toBe('Price not specified');
    expect(formatPrice(mk({ price_eur: 2100 }))).toBe('€2,100 / month');
  });
});
