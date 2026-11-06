export type DealType = 'rent' | 'sale';
export type PropertyType =
  | 'apartment' | 'house' | 'villa' | 'townhouse' | 'studio' | 'commercial' | 'land' | 'other';
export type GeoPrecision = 'address' | 'street' | 'district' | 'city' | 'none';
export type Status = 'available' | 'rented' | 'sold';

export interface Listing {
  id: string;
  source_message_id: number;
  source_url: string;
  posted_at: string;
  title: string;
  location_text: string | null;
  status: Status;
  deal_type: DealType | null;
  price_eur: number | null;
  price_period: 'month' | 'total' | null;
  price_from: boolean;
  negotiable: boolean;
  old_price_eur: number | null;
  property_type: PropertyType;
  property_subtype: string | null;
  area_m2: number | null;
  plot_m2: number | null;
  terrace_m2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  features: string[];
  sunline_id: string | null;
  address_text: string | null;
  district: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  geo_precision: GeoPrecision;
  geo_source: 'nominatim' | 'table' | null;
  hashtags: string[];
  links: string[];
  description: string;
  photos: string[];
  earlier_posts: string[];
}

export interface Dataset {
  source: string;
  exported_at: string;
  geocoded_at?: string;
  count: number;
  note: string;
  listings: Listing[];
}
