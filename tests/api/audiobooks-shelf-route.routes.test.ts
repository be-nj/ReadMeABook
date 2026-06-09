/**
 * Component: Shelf Route Preview API Tests
 * Documentation: documentation/features/multi-library-prd.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getShelvesMock = vi.hoisted(() => vi.fn());
const getConfigMock = vi.hoisted(() => vi.fn());
const getDetailsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => ({ getShelves: getShelvesMock, get: getConfigMock }),
}));
vi.mock('@/lib/integrations/audible.service', () => ({
  getAudibleService: () => ({ getAudiobookDetails: getDetailsMock }),
}));

const SHELVES = [
  { libraryId: 'en-lib', language: 'en', audience: 'adult', region: 'us', mediaPath: '/m/en', isPrimary: true },
  { libraryId: 'de-lib', language: 'de', audience: 'adult', region: 'de', mediaPath: '/m/de', isPrimary: false },
];

async function callRoute(asin: string) {
  const { GET } = await import('@/app/api/audiobooks/[asin]/shelf-route/route');
  return GET({} as any, { params: Promise.resolve({ asin }) });
}

describe('GET /api/audiobooks/[asin]/shelf-route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getShelvesMock.mockResolvedValue(SHELVES);
    getDetailsMock.mockResolvedValue({ language: 'German', genres: ['Roman'] });
    // ABS library-name fetch: no server configured -> labels fall back to ids.
    getConfigMock.mockResolvedValue(null);
  });

  it('resolves a German book to the German shelf and lists all shelves', async () => {
    const res = await callRoute('B00TEST001');
    const data = await res.json();

    expect(data.resolved.libraryId).toBe('de-lib');
    expect(data.language).toBe('de');
    expect(data.shelves).toHaveLength(2);
    expect(data.shelves.map((s: any) => s.libraryId)).toEqual(['en-lib', 'de-lib']);
    // No ABS server configured -> label falls back to libraryId.
    expect(data.shelves[0].label).toBe('en-lib');
  });

  it('returns labels from Audiobookshelf when reachable', async () => {
    getConfigMock.mockImplementation(async (key: string) => {
      if (key === 'audiobookshelf.server_url') return 'http://abs';
      if (key === 'audiobookshelf.api_token') return 'token';
      return null;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ libraries: [{ id: 'en-lib', name: 'Audiobooks' }, { id: 'de-lib', name: 'Hörbücher' }] }),
    }));

    const data = await (await callRoute('B00TEST001')).json();
    expect(data.shelves.find((s: any) => s.libraryId === 'de-lib').label).toBe('Hörbücher');
    vi.unstubAllGlobals();
  });

  it('reports a reason and null resolved when no shelf matches the language', async () => {
    getDetailsMock.mockResolvedValue({ language: 'French', genres: [] });
    const data = await (await callRoute('B00TEST001')).json();
    expect(data.resolved).toBeNull();
    expect(data.reason).toBe('no-language-match');
  });

  it('returns empty shelves when none are configured', async () => {
    getShelvesMock.mockResolvedValue([]);
    const data = await (await callRoute('B00TEST001')).json();
    expect(data.shelves).toEqual([]);
    expect(data.resolved).toBeNull();
  });

  it('still resolves when Audnexus lookup fails (no language -> no match)', async () => {
    getDetailsMock.mockRejectedValue(new Error('audnexus down'));
    const data = await (await callRoute('B00TEST001')).json();
    // No language derived -> no language match, but the call succeeds.
    expect(data.resolved).toBeNull();
    expect(data.shelves).toHaveLength(2);
  });
});
