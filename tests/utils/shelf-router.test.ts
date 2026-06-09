/**
 * Component: Shelf Router Tests
 * Documentation: documentation/features/multi-library-prd.md
 */

import { describe, it, expect } from 'vitest';
import { selectShelf, normalizeLanguage, guessAudience } from '@/lib/utils/shelf-router';
import type { Shelf, ShelfAudience } from '@/lib/services/config.service';

const shelf = (
  libraryId: string,
  language: string,
  audience: ShelfAudience,
  isPrimary = false
): Shelf => ({ libraryId, language, audience, region: '', mediaPath: `/data/${libraryId}`, isPrimary });

describe('shelf-router', () => {
  describe('normalizeLanguage', () => {
    it.each([
      ['English', 'en'],
      ['english', 'en'],
      ['en', 'en'],
      ['Deutsch', 'de'],
      ['German', 'de'],
      ['de', 'de'],
      ['Español', 'es'],
      ['français', 'fr'],
      ['', ''],
      ['Klingon', ''],
      [null, ''],
    ])('normalises %s -> %s', (input, expected) => {
      expect(normalizeLanguage(input as string)).toBe(expected);
    });
  });

  describe('guessAudience', () => {
    it('detects kids from a children genre', () => {
      expect(guessAudience(["Children's Audiobooks"])).toBe('kids');
    });
    it('detects teen from young adult', () => {
      expect(guessAudience(['Young Adult', 'Fantasy'])).toBe('teen');
    });
    it('defaults to adult for other genres', () => {
      expect(guessAudience(['Thriller'])).toBe('adult');
    });
    it('defaults to adult when no genres', () => {
      expect(guessAudience([])).toBe('adult');
      expect(guessAudience(null)).toBe('adult');
    });
  });

  describe('selectShelf', () => {
    const deAdult = shelf('de', 'de', 'adult');
    const deKids = shelf('de-kids', 'de', 'kids');
    const enAdult = shelf('en', 'en', 'adult', true);

    it('routes to the exact language + audience shelf', () => {
      const r = selectShelf({ language: 'Deutsch', genres: ['Roman'] }, [deAdult, deKids, enAdult]);
      expect(r.shelf).toBe(deAdult);
      expect(r.language).toBe('de');
      expect(r.audience).toBe('adult');
    });

    it('routes a kids book to the kids shelf of its language', () => {
      const r = selectShelf({ language: 'de', genres: ["Children's"] }, [deAdult, deKids, enAdult]);
      expect(r.shelf).toBe(deKids);
    });

    it('falls back upward when the exact audience tier has no shelf', () => {
      // kids book, but only a de/adult shelf exists -> de/adult (never younger)
      const r = selectShelf({ language: 'de', genres: ["Children's"] }, [deAdult, enAdult]);
      expect(r.shelf).toBe(deAdult);
    });

    it('returns null (manual) when only a younger shelf exists for the language', () => {
      // adult book, only a de/kids shelf -> unsafe to place -> null
      const r = selectShelf({ language: 'de', genres: ['Roman'] }, [deKids]);
      expect(r.shelf).toBeNull();
      expect(r.reason).toBe('no-safe-audience');
    });

    it('returns null (manual) when the language has no shelf', () => {
      const r = selectShelf({ language: 'fr', genres: [] }, [deAdult, enAdult]);
      expect(r.shelf).toBeNull();
      expect(r.reason).toBe('no-language-match');
    });

    it('prefers the primary shelf among equal candidates', () => {
      const a = shelf('a', 'en', 'adult');
      const b = shelf('b', 'en', 'adult', true);
      const r = selectShelf({ language: 'en', genres: [] }, [a, b]);
      expect(r.shelf).toBe(b);
    });
  });

  describe('selectShelf — language derived from region', () => {
    // A shelf configured by region only (language left empty, e.g. an older
    // config) must still route books of that region's language.
    const regionShelf = (
      libraryId: string,
      region: string,
      audience: ShelfAudience,
      isPrimary = false
    ): Shelf => ({ libraryId, language: '', audience, region, mediaPath: `/data/${libraryId}`, isPrimary });

    it('routes a German book to a de-region shelf with empty language (the Känguru bug)', () => {
      const deAdult = regionShelf('de-lib', 'de', 'adult');
      const enPrimary = regionShelf('en-lib', 'us', 'adult', true);
      const kids = regionShelf('kids-lib', 'de', 'kids');
      const r = selectShelf({ language: 'German', genres: ['Roman'] }, [enPrimary, deAdult, kids]);
      expect(r.shelf).toBe(deAdult);
      expect(r.shelf?.mediaPath).toBe('/data/de-lib');
    });

    it('routes an English book to the us-region primary shelf', () => {
      const deAdult = regionShelf('de-lib', 'de', 'adult');
      const enPrimary = regionShelf('en-lib', 'us', 'adult', true);
      const r = selectShelf({ language: 'en', genres: [] }, [deAdult, enPrimary]);
      expect(r.shelf).toBe(enPrimary);
    });

    it('prefers an explicit language over the region-derived one', () => {
      // Explicit language 'en' on a 'de'-region shelf wins (explicit beats derived).
      const weird: Shelf = { libraryId: 'x', language: 'en', audience: 'adult', region: 'de', mediaPath: '/data/x', isPrimary: true };
      const r = selectShelf({ language: 'en', genres: [] }, [weird]);
      expect(r.shelf).toBe(weird);
      const r2 = selectShelf({ language: 'de', genres: [] }, [weird]);
      expect(r2.shelf).toBeNull(); // explicit 'en' shelf does not match a German book
    });
  });
});
