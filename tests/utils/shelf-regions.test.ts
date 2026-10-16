/**
 * Component: Shelf Regions
 * Documentation: documentation/features/multi-library-prd.md
 */

import { describe, expect, it } from 'vitest';
import { allShelfRegions, languageForRegions, normalizeShelfRegions, shelfRegions } from '@/lib/utils/shelf-regions';

describe('shelf-regions', () => {
  it('keeps only known region codes, deduplicated and in order', () => {
    expect(normalizeShelfRegions(['uk', 'us', 'uk', 'mars', 42])).toEqual(['uk', 'us']);
  });

  it('falls back to the singular region when the set is empty or missing', () => {
    expect(normalizeShelfRegions(undefined, 'de')).toEqual(['de']);
    expect(normalizeShelfRegions([], 'de')).toEqual(['de']);
    expect(normalizeShelfRegions(['bogus'], 'de')).toEqual(['de']);
    expect(normalizeShelfRegions(undefined, '')).toEqual([]);
  });

  it('derives the language from the home store', () => {
    expect(languageForRegions(['us', 'uk'])).toBe('en');
    expect(languageForRegions(['de'])).toBe('de');
    expect(languageForRegions([])).toBe('');
  });

  it('reads a shelf with either regions or region', () => {
    expect(shelfRegions({ regions: ['us', 'uk'], region: 'us' })).toEqual(['us', 'uk']);
    expect(shelfRegions({ region: 'fr' })).toEqual(['fr']);
  });

  it('collects distinct regions across shelves in shelf order', () => {
    expect(allShelfRegions([{ regions: ['de'] }, { regions: ['us', 'uk'] }, { region: 'us' }])).toEqual(['de', 'us', 'uk']);
  });
});
