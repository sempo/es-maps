import type { Listing } from './types';

export const NOT_SPECIFIED = 'not specified';

const eur = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('en-GB');

export function formatEur(v: number | null | undefined): string {
  return v == null ? NOT_SPECIFIED : eur.format(v);
}

export function formatPrice(l: Listing): string {
  if (l.price_eur == null) return 'Price not specified';
  const base = (l.price_from ? 'from ' : '') + eur.format(l.price_eur);
  return l.price_period === 'month' ? `${base} / month` : base;
}

export function formatShortPrice(l: Listing): string {
  const v = l.price_eur;
  if (v == null) return '—';
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v % 1_000_000 ? 2 : 0)}M`;
  if (v >= 10_000) return `€${Math.round(v / 1000)}k`;
  return `€${int.format(v)}`;
}

export function pricePerM2(l: Listing): number | null {
  if (l.price_eur == null || !l.area_m2) return null;
  return Math.round(l.price_eur / l.area_m2);
}

export function orNotSpecified(v: number | string | null | undefined, unit = ''): string {
  if (v == null || v === '') return NOT_SPECIFIED;
  return typeof v === 'number' ? `${int.format(v)}${unit}` : `${v}${unit}`;
}

export function formatFloor(f: number | null): string {
  if (f == null) return NOT_SPECIFIED;
  return f === 0 ? 'ground floor' : `${f}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const FEATURE_LABELS: Record<string, string> = {
  terrace: 'Terrace',
  balcony: 'Balcony',
  pool: 'Pool',
  parking: 'Parking',
  storage: 'Storage room',
  air_conditioning: 'Air conditioning',
  heating: 'Heating',
  furnished: 'Furnished',
  garden: 'Garden',
  elevator: 'Elevator',
  new_build: 'New build',
  renovated: 'Renovated',
  sea_view: 'Sea view',
  near_beach: 'Near the beach',
  concierge: 'Concierge',
  padel: 'Padel court',
  pets_allowed: 'Pets allowed',
};

/** Russian words for features, so a Cyrillic search like "бассейн" finds them too. */
export const FEATURE_RU: Record<string, string> = {
  terrace: 'терраса', balcony: 'балкон', pool: 'бассейн', parking: 'парковка гараж', storage: 'кладовая',
  air_conditioning: 'кондиционер', heating: 'отопление', furnished: 'мебель меблирована', garden: 'сад',
  elevator: 'лифт', new_build: 'новостройка', renovated: 'ремонт', sea_view: 'вид на море', near_beach: 'пляж море',
  concierge: 'консьерж', padel: 'падел', pets_allowed: 'животные',
};

export const TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment', house: 'House', villa: 'Villa', townhouse: 'Townhouse', studio: 'Studio',
  commercial: 'Commercial', land: 'Land', other: 'Other',
};

export const SUBTYPE_LABELS: Record<string, string> = { penthouse: 'Penthouse', duplex: 'Duplex', loft: 'Loft' };

export function typeLabel(l: Listing): string {
  return (l.property_subtype && SUBTYPE_LABELS[l.property_subtype]) || TYPE_LABELS[l.property_type] || 'Property';
}

export const PRECISION_LABELS: Record<string, string> = {
  address: 'exact address',
  street: 'approximate location: street',
  district: 'approximate location: district',
  city: 'approximate location: town',
  none: 'location unknown',
};

export function photoUrl(p: string): string {
  return encodeURI(`/data/${p}`); // keep '@' literal: some static servers don't decode %40
}

export function placeLabel(l: Listing): string {
  if (l.district && l.city && l.district !== l.city) return `${l.district}, ${l.city}`;
  return l.district || l.city || l.location_text || 'Location not specified';
}
