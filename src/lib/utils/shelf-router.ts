/**
 * Component: Shelf Router
 * Documentation: documentation/features/multi-library-prd.md
 *
 * Pure routing logic: given a book's metadata and the configured shelves, decide
 * which shelf a request should be filed into. No I/O — easy to unit-test; the
 * caller loads shelves and applies the result.
 *
 * Rules (see ADR-0001 / CONTEXT.md):
 *  - Language must match a shelf. No cross-language fallback — a book whose
 *    language matches no shelf returns null (the caller asks the user to pick).
 *  - Audience falls back *upward* only (kids < teen < adult): a book is never
 *    placed into a shelf for a younger audience than its own tier. If only
 *    younger shelves exist for the language, returns null (unsafe → manual).
 *  - Among equally-good candidates, the primary shelf wins, else the first.
 */

import type { Shelf, ShelfAudience } from '@/lib/services/config.service';
import { AUDIBLE_REGIONS, type AudibleRegion } from '@/lib/types/audible';

const AUDIENCE_ORDER: Record<ShelfAudience, number> = { kids: 0, teen: 1, adult: 2 };

/**
 * The language a shelf routes for. Prefer its explicit language, but fall back
 * to the language implied by its Audible region (region → language is 1:1), so a
 * shelf configured by region alone (e.g. an older config where `language` was
 * never populated) still matches books in that language.
 */
function shelfLanguage(shelf: Shelf): string {
  if (shelf.language) return normalizeLanguage(shelf.language);
  const regionLang = AUDIBLE_REGIONS[shelf.region as AudibleRegion]?.language;
  return regionLang ? normalizeLanguage(regionLang) : '';
}

export interface RoutableBook {
  language?: string | null;
  genres?: string[] | null;
}

/**
 * Normalise a free-form language value (e.g. 'English', 'deutsch', 'de') to a
 * lowercase language code, or '' if unknown.
 */
export function normalizeLanguage(raw?: string | null): string {
  if (!raw) return '';
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'en' || v.startsWith('eng')) return 'en';
  if (v === 'de' || v.startsWith('deu') || v.startsWith('ger')) return 'de';
  if (v === 'es' || v.startsWith('spa') || v.startsWith('esp')) return 'es';
  if (v === 'fr' || v.startsWith('fre') || v.startsWith('fra')) return 'fr';
  // Already a 2-letter code we don't special-case: keep it.
  if (/^[a-z]{2}$/.test(v)) return v;
  return '';
}

const KIDS_PATTERNS = ['children', "children's", 'kids', 'kinder', 'juvenile', 'picture book'];
const TEEN_PATTERNS = ['young adult', 'teen', 'jugend'];

/**
 * Best-guess audience tier from genres. Conservative: only returns a younger
 * tier on a clear signal, otherwise 'adult' — mis-guessing older is safe (the
 * never-younger rule + the request-dialog override catch the rest).
 */
export function guessAudience(genres?: string[] | null): ShelfAudience {
  const hay = (genres || []).join(' | ').toLowerCase();
  if (!hay) return 'adult';
  if (TEEN_PATTERNS.some((p) => hay.includes(p))) return 'teen';
  if (KIDS_PATTERNS.some((p) => hay.includes(p))) return 'kids';
  return 'adult';
}

export interface ShelfRouteResult {
  shelf: Shelf | null;
  language: string;
  audience: ShelfAudience;
  /** Why no shelf was chosen (for UI messaging), when shelf is null. */
  reason?: 'no-language-match' | 'no-safe-audience';
}

/**
 * Choose the target shelf for a book. Returns the chosen shelf plus the derived
 * language/audience (so the caller can pre-fill an overridable dialog), or a null
 * shelf with a reason when no safe automatic choice exists.
 */
export function selectShelf(book: RoutableBook, shelves: Shelf[]): ShelfRouteResult {
  const language = normalizeLanguage(book.language);
  const audience = guessAudience(book.genres);

  const langShelves = shelves.filter((s) => {
    const shelfLang = shelfLanguage(s);
    return shelfLang && language && shelfLang === language;
  });
  if (langShelves.length === 0) {
    return { shelf: null, language, audience, reason: 'no-language-match' };
  }

  const tier = AUDIENCE_ORDER[audience];
  // Never place a book into a shelf for a younger audience than its own tier.
  const eligible = langShelves.filter((s) => AUDIENCE_ORDER[s.audience] >= tier);
  if (eligible.length === 0) {
    return { shelf: null, language, audience, reason: 'no-safe-audience' };
  }

  // Closest upward match wins; tie-break on primary, then declaration order.
  eligible.sort((a, b) => {
    const byTier = AUDIENCE_ORDER[a.audience] - AUDIENCE_ORDER[b.audience];
    if (byTier !== 0) return byTier;
    return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
  });

  return { shelf: eligible[0], language, audience };
}
