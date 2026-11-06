import type { Listing } from '../lib/types';
import { formatPrice, placeLabel, typeLabel, formatEur } from '../lib/format';
import { Photo } from './Photo';

interface Props {
  listing: Listing;
  selected: boolean;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  onLocate: (id: string) => void;
}

export function DealBadge({ l }: { l: Listing }) {
  if (l.status !== 'available') {
    return <span className="badge badge-closed">{l.status === 'rented' ? 'Rented' : 'Sold'}</span>;
  }
  if (!l.deal_type) return null;
  return <span className={`badge badge-${l.deal_type}`}>{l.deal_type === 'rent' ? 'Rent' : 'Sale'}</span>;
}

export function ListingCard({ listing: l, selected, onHover, onOpen, onLocate }: Props) {
  return (
    <article
      className={`card ${selected ? 'card-selected' : ''} ${l.status !== 'available' ? 'card-closed' : ''}`}
      onMouseEnter={() => onHover(l.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onOpen(l.id)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(l.id)}
      aria-label={l.title}
    >
      <div className="card-photo">
        <Photo src={l.photos[0]} alt={l.title} />
        <DealBadge l={l} />
        {l.photos.length > 1 && <span className="photo-count">{l.photos.length} photos</span>}
      </div>
      <div className="card-body">
        <div className="card-price">
          {formatPrice(l)}
          {l.old_price_eur && <s className="old-price">{formatEur(l.old_price_eur)}</s>}
        </div>
        <div className="card-facts">
          <span>{typeLabel(l)}</span>
          <span>{l.area_m2 != null ? `${l.area_m2} m²` : 'area not specified'}</span>
          {l.property_type !== 'land' && <span>{l.bedrooms != null ? `${l.bedrooms} bd` : 'bedrooms not specified'}</span>}
          {l.bathrooms != null && <span>{l.bathrooms} ba</span>}
        </div>
        <div className="card-title" lang="ru">{l.title}</div>
        <div className="card-place">
          {placeLabel(l)}
          {l.lat == null && <span className="no-geo" title="This listing has no coordinates and is not on the map"> · not on map</span>}
        </div>
        {l.lat != null && (
          <button className="locate" title="Show on map" aria-label="Show on map"
            onClick={(e) => { e.stopPropagation(); onLocate(l.id); }}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>
          </button>
        )}
      </div>
    </article>
  );
}

