import { useMemo, useState } from 'react';
import type { Listing, PropertyType } from '../lib/types';
import { DEFAULT_FILTERS, activeFilterCount, matches, type FilterState, type Range } from '../lib/filters';
import { FEATURE_LABELS, TYPE_LABELS } from '../lib/format';

interface Props {
  listings: Listing[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function RangeInput({ label, unit, value, onChange, step, placeholder }: {
  label: string; unit: string; value: Range; onChange: (r: Range) => void; step: number; placeholder: [string, string];
}) {
  const parse = (s: string) => (s === '' ? null : Math.max(0, Number(s)));
  return (
    <fieldset className="range">
      <legend>{label}</legend>
      <div className="range-row">
        <input type="number" inputMode="numeric" min={0} step={step} placeholder={placeholder[0]}
          aria-label={`${label} minimum`} value={value.min ?? ''} onChange={(e) => onChange({ ...value, min: parse(e.target.value) })} />
        <span>–</span>
        <input type="number" inputMode="numeric" min={0} step={step} placeholder={placeholder[1]}
          aria-label={`${label} maximum`} value={value.max ?? ''} onChange={(e) => onChange({ ...value, max: parse(e.target.value) })} />
        <span className="unit">{unit}</span>
      </div>
    </fieldset>
  );
}

export function FiltersPanel({ listings, filters: f, onChange }: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...f, ...patch });
  const [districtQuery, setDistrictQuery] = useState('');

  const presentTypes = useMemo(
    () => (Object.keys(TYPE_LABELS) as PropertyType[]).filter((t) => listings.some((l) => l.property_type === t)),
    [listings],
  );
  const presentFeatures = useMemo(
    () => Object.keys(FEATURE_LABELS).filter((k) => listings.some((l) => l.features.includes(k))),
    [listings],
  );
  // district facet: counts under all other filters
  const districts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of listings) if (l.district) counts.set(l.district, 0);
    for (const l of listings) if (l.district && matches(l, f, 'districts')) counts.set(l.district, counts.get(l.district)! + 1);
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [listings, f]);
  // selected first, then districts that still have results, then empty ones (greyed)
  const rank = ([d, n]: [string, number]) => (f.districts.includes(d) ? 0 : n > 0 ? 1 : 2);
  const shownDistricts = districts
    .filter(([d]) => f.districts.includes(d) || d.toLowerCase().includes(districtQuery.toLowerCase()))
    .sort((a, b) => rank(a) - rank(b) || a[0].localeCompare(b[0]));

  const nActive = activeFilterCount(f);

  return (
    <div className="filters">
      <div className="filters-head">
        <h2>Filters {nActive > 0 && <span className="pill">{nActive}</span>}</h2>
        {nActive > 0 && (
          <button className="link" onClick={() => onChange({ ...DEFAULT_FILTERS, q: f.q, inView: f.inView, sort: f.sort })}>
            Reset
          </button>
        )}
      </div>

      <fieldset>
        <legend>Deal</legend>
        <div className="segmented" role="radiogroup">
          {(['all', 'rent', 'sale'] as const).map((d) => (
            <button key={d} role="radio" aria-checked={f.deal === d} className={f.deal === d ? 'on' : ''}
              onClick={() => set({ deal: d })}>
              {d === 'all' ? 'All' : d === 'rent' ? 'Rent' : 'Buy'}
            </button>
          ))}
        </div>
      </fieldset>

      {f.deal !== 'sale' && (
        <RangeInput label="Rent per month" unit="€" step={100} placeholder={['min', 'max']} value={f.rent}
          onChange={(rent) => set({ rent })} />
      )}
      {f.deal !== 'rent' && (
        <RangeInput label="Sale price" unit="€" step={10000} placeholder={['min', 'max']} value={f.sale}
          onChange={(sale) => set({ sale })} />
      )}
      <RangeInput label="Area" unit="m²" step={10} placeholder={['min', 'max']} value={f.area} onChange={(area) => set({ area })} />

      <fieldset>
        <legend>Bedrooms</legend>
        <div className="chips">
          {[1, 2, 3, 4].map((b) => (
            <button key={b} className={`chip ${f.beds.includes(b) ? 'on' : ''}`} aria-pressed={f.beds.includes(b)}
              onClick={() => set({ beds: toggle(f.beds, b) })}>
              {b === 4 ? '4+' : b}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Property type</legend>
        <div className="chips">
          {presentTypes.map((t) => (
            <button key={t} className={`chip ${f.types.includes(t) ? 'on' : ''}`} aria-pressed={f.types.includes(t)}
              onClick={() => set({ types: toggle(f.types, t) })}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>
          District / town
          {f.districts.length > 0 && (
            <button className="link small" onClick={() => set({ districts: [] })}>clear</button>
          )}
        </legend>
        <input className="district-search" type="search" placeholder="Find a district…" value={districtQuery}
          onChange={(e) => setDistrictQuery(e.target.value)} />
        <div className="checklist">
          {shownDistricts.map(([d, n]) => (
            <label key={d} className={n === 0 && !f.districts.includes(d) ? 'muted' : ''}>
              <input type="checkbox" checked={f.districts.includes(d)} onChange={() => set({ districts: toggle(f.districts, d) })} />
              <span>{d}</span>
              <span className="count">{n}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Features</legend>
        <div className="checklist two-col">
          {presentFeatures.map((k) => (
            <label key={k}>
              <input type="checkbox" checked={f.features.includes(k)} onChange={() => set({ features: toggle(f.features, k) })} />
              <span>{FEATURE_LABELS[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <label className="switch">
          <input type="checkbox" checked={f.showClosed} onChange={(e) => set({ showClosed: e.target.checked })} />
          <span>Show rented / sold</span>
        </label>
      </fieldset>
    </div>
  );
}

