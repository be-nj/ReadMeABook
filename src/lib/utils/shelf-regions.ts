/**
 * Component: Shelf Regions
 * Documentation: documentation/features/multi-library-prd.md
 *
 * A Shelf owns an ordered *set* of Audible regions (stores) — e.g. an English
 * shelf searches `us` and `uk`, a German shelf `de`. The first region is the
 * shelf's home store: it implies the routing language and is the preferred
 * region for metadata. `region` (singular) is kept on the Shelf as a mirror of
 * `regions[0]` for readers that predate region sets.
 */

import { AUDIBLE_REGIONS, type AudibleRegion } from '@/lib/types/audible';

/** Narrow an untrusted value to a known Audible region code. */
export function asAudibleRegion(value: unknown): AudibleRegion | undefined {
  return typeof value === 'string' && value in AUDIBLE_REGIONS ? (value as AudibleRegion) : undefined;
}

/**
 * Normalise a raw `regions` value (plus a legacy singular `region` fallback)
 * into a deduplicated list of valid region codes, order preserved.
 */
export function normalizeShelfRegions(rawRegions: unknown, rawRegion?: unknown): AudibleRegion[] {
  const out: AudibleRegion[] = [];
  const push = (v: unknown) => {
    const r = asAudibleRegion(v);
    if (r && !out.includes(r)) out.push(r);
  };
  if (Array.isArray(rawRegions)) rawRegions.forEach(push);
  if (out.length === 0) push(rawRegion);
  return out;
}

/** The regions a shelf searches, tolerating shelves that only carry `region`. */
export function shelfRegions(shelf: { regions?: readonly string[]; region?: string }): AudibleRegion[] {
  return normalizeShelfRegions(shelf.regions, shelf.region);
}

/** Language implied by a shelf's home store (regions[0]), or '' when unknown. */
export function languageForRegions(regions: readonly string[]): string {
  const home = asAudibleRegion(regions[0]);
  return home ? AUDIBLE_REGIONS[home].language : '';
}

/** Distinct regions across all shelves, in shelf order. */
export function allShelfRegions(shelves: ReadonlyArray<{ regions?: readonly string[]; region?: string }>): AudibleRegion[] {
  const out: AudibleRegion[] = [];
  for (const shelf of shelves) {
    for (const r of shelfRegions(shelf)) if (!out.includes(r)) out.push(r);
  }
  return out;
}
