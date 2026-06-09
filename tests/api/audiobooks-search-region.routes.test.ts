/**
 * Component: Audiobook Search API Route — region resolution
 * Documentation: documentation/integrations/audible.md
 *
 * Verifies that GET /api/audiobooks/search resolves the Audible region in the
 * order: explicit `region` param > primary shelf's region > global default,
 * and forwards the resolved region to getAudibleService(region).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const audibleServiceMock = vi.hoisted(() => ({
  search: vi.fn(),
}));
// Captures the region argument the route passes in.
const getAudibleServiceMock = vi.hoisted(() => vi.fn(() => audibleServiceMock));
const getShelvesMock = vi.hoisted(() => vi.fn());
const currentUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/integrations/audible.service', () => ({
  getAudibleService: (region?: string) => getAudibleServiceMock(region),
}));

vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => ({ getShelves: getShelvesMock }),
}));

// Pass-through dedup/works so the route reaches the response.
vi.mock('@/lib/utils/deduplicate-audiobooks', () => ({
  deduplicateAndCollectGroups: (books: any[]) => ({ books, groups: [] }),
}));
vi.mock('@/lib/services/works.service', () => ({
  persistDedupGroups: vi.fn().mockResolvedValue(undefined),
  collapseByExistingWorks: vi.fn(async (books: any[]) => books),
}));
vi.mock('@/lib/utils/audiobook-matcher', () => ({
  enrichAudiobooksWithMatches: vi.fn(async (books: any[]) => books),
}));
vi.mock('@/lib/utils/ignored-audiobooks', () => ({
  annotateWithIgnoreStatus: vi.fn(async (books: any[]) => books),
}));
vi.mock('@/lib/middleware/auth', () => ({
  getCurrentUserAsync: currentUserMock,
}));

async function callSearch(url: string) {
  const { GET } = await import('@/app/api/audiobooks/search/route');
  return GET({ nextUrl: new URL(url) } as any);
}

describe('Audiobooks search route — region resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue(null);
    getShelvesMock.mockResolvedValue([]);
    audibleServiceMock.search.mockResolvedValue({
      query: 'q',
      results: [],
      totalResults: 0,
      page: 1,
      hasMore: false,
    });
  });

  it('uses an explicit, valid region param', async () => {
    await callSearch('http://app/api/audiobooks/search?q=test&region=de');
    expect(getAudibleServiceMock).toHaveBeenCalledWith('de');
  });

  it('falls back to the primary shelf region when no param is given', async () => {
    getShelvesMock.mockResolvedValue([
      { libraryId: 'l1', region: 'us', isPrimary: false },
      { libraryId: 'l2', region: 'uk', isPrimary: true },
    ]);
    await callSearch('http://app/api/audiobooks/search?q=test');
    expect(getAudibleServiceMock).toHaveBeenCalledWith('uk');
  });

  it('falls back to the first shelf when none is primary', async () => {
    getShelvesMock.mockResolvedValue([
      { libraryId: 'l1', region: 'de', isPrimary: false },
    ]);
    await callSearch('http://app/api/audiobooks/search?q=test');
    expect(getAudibleServiceMock).toHaveBeenCalledWith('de');
  });

  it('ignores an invalid region param and falls back to the shelf region', async () => {
    getShelvesMock.mockResolvedValue([
      { libraryId: 'l1', region: 'us', isPrimary: true },
    ]);
    await callSearch('http://app/api/audiobooks/search?q=test&region=not-a-region');
    expect(getAudibleServiceMock).toHaveBeenCalledWith('us');
  });

  it('uses the global default (undefined) when there are no shelves and no param', async () => {
    getShelvesMock.mockResolvedValue([]);
    await callSearch('http://app/api/audiobooks/search?q=test');
    expect(getAudibleServiceMock).toHaveBeenCalledWith(undefined);
  });

  it('uses the global default (undefined) when getShelves throws', async () => {
    getShelvesMock.mockRejectedValue(new Error('no config'));
    await callSearch('http://app/api/audiobooks/search?q=test');
    expect(getAudibleServiceMock).toHaveBeenCalledWith(undefined);
  });
});
