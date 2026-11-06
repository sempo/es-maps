import { useEffect, useRef, useState } from 'react';
import type { Listing } from '../lib/types';
import {
  FEATURE_LABELS, NOT_SPECIFIED, PRECISION_LABELS, formatDate, formatEur, formatFloor, formatPrice,
  orNotSpecified, placeLabel, pricePerM2, typeLabel,
} from '../lib/format';
import { Photo } from './Photo';
import { DealBadge } from './ListingCard';

interface Props {
  listing: Listing;
  onClose: () => void;
  onShowOnMap: (id: string) => void;
}

export function DetailModal({ listing: l, onClose, onShowOnMap }: Props) {
  const [idx, setIdx] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const n = l.photos.length;

  useEffect(() => setIdx(0), [l.id]);
  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && n > 1) setIdx((i) => (i + 1) % n);
      if (e.key === 'ArrowLeft' && n > 1) setIdx((i) => (i - 1 + n) % n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, onClose]);

  const ppm = pricePerM2(l);
  const siteLink = l.links.find((u) => /sunlinespain\.com/.test(u));
  const rows: [string, string][] = [
    ['Deal', l.deal_type === 'rent' ? 'Rent' : l.deal_type === 'sale' ? 'Sale' : NOT_SPECIFIED],
    ['Status', l.status === 'available' ? 'Available' : l.status === 'rented' ? 'Rented' : 'Sold'],
    ['Price', formatPrice(l) + (l.negotiable ? ' (negotiable)' : '')],
    ...(l.old_price_eur ? [['Previous price', formatEur(l.old_price_eur)] as [string, string]] : []),
    ...(l.deal_type === 'sale' ? [['Price per m²', ppm != null ? `${formatEur(ppm)} / m²` : NOT_SPECIFIED] as [string, string]] : []),
    ['Property type', typeLabel(l)],
    ['Area', orNotSpecified(l.area_m2, ' m²')],
    ...(l.plot_m2 ? [['Plot', orNotSpecified(l.plot_m2, ' m²')] as [string, string]] : []),
    ['Terrace', orNotSpecified(l.terrace_m2, ' m²')],
    ['Bedrooms', orNotSpecified(l.bedrooms)],
    ['Bathrooms', orNotSpecified(l.bathrooms)],
    ['Floor', formatFloor(l.floor)],
    ['District', l.district ?? NOT_SPECIFIED],
    ['Town', l.city ?? NOT_SPECIFIED],
    ['Address', l.address_text ?? NOT_SPECIFIED],
    ['Location in post', l.location_text ?? NOT_SPECIFIED],
    ['Map precision', PRECISION_LABELS[l.geo_precision] + (l.geo_source === 'table' ? ' (district table)' : '')],
    ['SunLine ID', l.sunline_id ?? NOT_SPECIFIED],
    ['Posted', formatDate(l.posted_at)],
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={l.title} tabIndex={-1} ref={dialog}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        <div className="gallery">
          <div className="gallery-main">
            <Photo src={l.photos[idx]} alt={`${l.title}, photo ${idx + 1}`} />
            {n > 1 && (
              <>
                <button className="gallery-nav prev" aria-label="Previous photo" onClick={() => setIdx((idx - 1 + n) % n)}>‹</button>
                <button className="gallery-nav next" aria-label="Next photo" onClick={() => setIdx((idx + 1) % n)}>›</button>
                <span className="gallery-counter">{idx + 1} / {n}</span>
              </>
            )}
          </div>
          {n > 1 && (
            <div className="thumbs">
              {l.photos.map((p, i) => (
                <button key={p} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} aria-label={`Photo ${i + 1}`}>
                  <Photo src={p} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="detail">
          <div className="detail-head">
            <DealBadge l={l} />
            <h2 lang="ru">{l.title}</h2>
            <div className="detail-price">
              {formatPrice(l)} {l.old_price_eur && <s className="old-price">{formatEur(l.old_price_eur)}</s>}
            </div>
            <div className="detail-place">
              {placeLabel(l)}
              {l.geo_precision !== 'address' && l.geo_precision !== 'none' && (
                <span className="precision-note"> · {PRECISION_LABELS[l.geo_precision]}</span>
              )}
            </div>
            <div className="detail-actions">
              <a className="btn btn-primary" href={l.source_url} target="_blank" rel="noreferrer">View in Telegram ↗</a>
              {siteLink && <a className="btn" href={siteLink} target="_blank" rel="noreferrer">Agency page ↗</a>}
              {l.lat != null && <button className="btn" onClick={() => onShowOnMap(l.id)}>Show on map</button>}
            </div>
          </div>

          <div className="detail-cols">
            <dl className="fields">
              {rows.map(([k, v]) => (
                <div key={k} className={v === NOT_SPECIFIED ? 'unknown' : ''}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h3>Features</h3>
              {l.features.length ? (
                <ul className="feature-list">
                  {l.features.map((f) => <li key={f}>{FEATURE_LABELS[f] ?? f}</li>)}
                </ul>
              ) : (
                <p className="muted">{NOT_SPECIFIED}</p>
              )}
              {l.hashtags.length > 0 && <p className="hashtags">{l.hashtags.join(' ')}</p>}
              {l.earlier_posts.length > 0 && (
                <>
                  <h3>Earlier posts of this object</h3>
                  <ul className="links">
                    {l.earlier_posts.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{u.replace('https://', '')}</a></li>)}
                  </ul>
                </>
              )}
            </div>
          </div>

          <h3>Original post</h3>
          <pre className="original" lang="ru">{l.description}</pre>
          <p className="source-note">Source: Telegram channel “Недвижимость Валенсия | SunLine”. Fields above were extracted automatically; check the original post.</p>
        </div>
      </div>
    </div>
  );
}
