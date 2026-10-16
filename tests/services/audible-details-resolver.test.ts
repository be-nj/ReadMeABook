/**
 * Component: Audible Details Resolver (multi-region)
 * Documentation: documentation/integrations/audible.md
 *
 * Verifies the region fallback chain: preferred → global → distinct shelf regions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Svc = { getAudiobookDetails: ReturnType<typeof vi.fn>; getRegion: () => string; getBaseUrl: () => string };
const services = vi.hoisted(() => new Map<string, Svc>());
const getAudibleServiceMock = vi.hoisted(() => vi.fn());
const getShelvesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/integrations/audible.service', () => ({
  getAudibleService: (region?: string) => getAudibleServiceMock(region),
}));
vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => ({ getShelves: getShelvesMock }),
}));

function makeService(region: string): Svc {
  return {
    getAudiobookDetails: vi.fn().mockResolvedValue(null),
    getRegion: () => region,
    getBaseUrl: () => `https://www.audible.${region}`,
  };
}

describe('resolveAudiobookDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.clear();
    // Global (unpinned) service is configured for 'de'; pinned services per region.
    services.set('global', makeService('de'));
    for (const r of ['us', 'uk', 'de']) services.set(r, makeService(r));
    getAudibleServiceMock.mockImplementation((region?: string) => services.get(region ?? 'global'));
    getShelvesMock.mockResolvedValue([
      { libraryId: 'l1', region: 'de' },
      { libraryId: 'l2', region: 'us' },
      { libraryId: 'l3', region: 'uk' },
      { libraryId: 'l4', region: 'not-a-region' },
    ]);
  });

  it('tries the preferred region first and reports it', async () => {
    services.get('us')!.getAudiobookDetails.mockResolvedValue({ asin: 'A', title: 'US edition' });
    const { resolveAudiobookDetails } = await import('@/lib/services/audible-details-resolver');

    const result = await resolveAudiobookDetails('A', 'us');

    expect(result).toEqual({
      audiobook: { asin: 'A', title: 'US edition' },
      region: 'us',
      audibleBaseUrl: 'https://www.audible.com',
    });
    expect(services.get('global')!.getAudiobookDetails).not.toHaveBeenCalled();
  });

  it('falls back to the global service when no preferred region is given', async () => {
    services.get('global')!.getAudiobookDetails.mockResolvedValue({ asin: 'A', title: 'Global' });
    const { resolveAudiobookDetails } = await import('@/lib/services/audible-details-resolver');

    const result = await resolveAudiobookDetails('A');

    expect(result?.region).toBeUndefined();
    expect(result?.audiobook.title).toBe('Global');
    expect(getShelvesMock).not.toHaveBeenCalled();
  });

  it('walks every distinct shelf region after a global miss, skipping the region already tried', async () => {
    services.get('uk')!.getAudiobookDetails.mockResolvedValue({ asin: 'A', title: 'UK edition' });
    const { resolveAudiobookDetails } = await import('@/lib/services/audible-details-resolver');

    const result = await resolveAudiobookDetails('A');

    expect(result?.region).toBe('uk');
    // Global service answered as 'de', so the pinned 'de' service is never asked again.
    expect(services.get('de')!.getAudiobookDetails).not.toHaveBeenCalled();
    expect(services.get('us')!.getAudiobookDetails).toHaveBeenCalledTimes(1);
  });

  it('returns null when every region misses', async () => {
    const { resolveAudiobookDetails } = await import('@/lib/services/audible-details-resolver');
    expect(await resolveAudiobookDetails('A', 'us')).toBeNull();
    expect(services.get('us')!.getAudiobookDetails).toHaveBeenCalledTimes(1);
    expect(services.get('uk')!.getAudiobookDetails).toHaveBeenCalledTimes(1);
  });

  it('ignores shelf lookup failures', async () => {
    getShelvesMock.mockRejectedValue(new Error('db down'));
    const { resolveAudiobookDetails } = await import('@/lib/services/audible-details-resolver');
    expect(await resolveAudiobookDetails('A')).toBeNull();
  });

  it('parseAudibleRegion narrows only known codes', async () => {
    const { parseAudibleRegion } = await import('@/lib/services/audible-details-resolver');
    expect(parseAudibleRegion('de')).toBe('de');
    expect(parseAudibleRegion('xx')).toBeUndefined();
    expect(parseAudibleRegion(null)).toBeUndefined();
  });
});
