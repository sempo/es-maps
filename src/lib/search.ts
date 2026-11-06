import Fuse from 'fuse.js';
import type { Listing } from './types';
import { FEATURE_LABELS, FEATURE_RU, TYPE_LABELS, SUBTYPE_LABELS } from './format';

// Cyrillic -> Latin, so "руссафа" finds "Russafa" and "кабаньял" finds "Cabanyal".
const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function translit(s: string): string {
  return s.toLowerCase().replace(/[а-яё]/g, (c) => CYR[c] ?? c);
}

/** Lower-case, strip accents: "València" -> "valencia". */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

interface Doc {
  id: string;
  title: string;
  place: string;
  features: string;
  description: string;
}

function toDoc(l: Listing): Doc {
  const place = [l.district, l.city, l.location_text, l.address_text].filter(Boolean).join(' ');
  const features = [
    ...l.features.flatMap((f) => [FEATURE_LABELS[f] ?? f, FEATURE_RU[f] ?? '']),
    TYPE_LABELS[l.property_type], l.property_subtype ? SUBTYPE_LABELS[l.property_subtype] : '',
    l.deal_type === 'rent' ? 'rent аренда' : l.deal_type === 'sale' ? 'sale продажа' : '',
    ...l.hashtags,
  ].join(' ');
  return {
    id: l.id,
    title: fold(l.title),
    place: fold(place),
    features: fold(features),
    description: fold(l.description),
  };
}

export function buildIndex(listings: Listing[]) {
  return new Fuse(listings.map(toDoc), {
    keys: [
      { name: 'title', weight: 3 },
      { name: 'place', weight: 3 },
      { name: 'features', weight: 2 },
      { name: 'description', weight: 1 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });
}

export type SearchIndex = ReturnType<typeof buildIndex>;

/**
 * Every word of the query must match (AND); each word is fuzzy and also tried
 * transliterated to Latin. Returns ids ordered by relevance, or null for an empty query.
 */
export function search(index: SearchIndex, query: string): string[] | null {
  const words = fold(query).split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return null;
  const scores = new Map<string, number>();
  words.forEach((w, i) => {
    const variants = Array.from(new Set([w, translit(w)]));
    const hits = new Map<string, number>();
    for (const v of variants) {
      for (const r of index.search(v)) {
        const s = r.score ?? 1;
        if (!hits.has(r.item.id) || s < hits.get(r.item.id)!) hits.set(r.item.id, s);
      }
    }
    if (i === 0) hits.forEach((s, id) => scores.set(id, s));
    else
      for (const id of Array.from(scores.keys())) {
        if (!hits.has(id)) scores.delete(id);
        else scores.set(id, scores.get(id)! + hits.get(id)!);
      }
  });
  return Array.from(scores.entries()).sort((a, b) => a[1] - b[1]).map(([id]) => id);
}
