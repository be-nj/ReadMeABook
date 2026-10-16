/**
 * Component: Shelves API
 * Documentation: documentation/features/multi-library-prd.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuthMock = vi.hoisted(() => vi.fn());
const getShelvesMock = vi.hoisted(() => vi.fn());
const fetchLibraryNamesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/middleware/auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/lib/services/config.service', () => ({ getConfigService: () => ({ getShelves: getShelvesMock }) }));
vi.mock('@/lib/services/shelf-labels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/shelf-labels')>();
  return { ...actual, fetchLibraryNames: fetchLibraryNamesMock };
});

describe('GET /api/shelves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockImplementation((_req: any, handler: any) => handler({ user: { id: 'u1', role: 'user' } }));
  });

  it('lists shelves with labels and their region sets', async () => {
    getShelvesMock.mockResolvedValue([
      { libraryId: 'en-lib', language: 'en', audience: 'adult', region: 'us', regions: ['us', 'uk'], mediaPath: '/m', isPrimary: true },
      { libraryId: 'de-lib', language: 'de', audience: 'kids', region: 'de', regions: ['de'], mediaPath: '/m', isPrimary: false },
    ]);
    fetchLibraryNamesMock.mockResolvedValue({ 'en-lib': 'Audiobooks 🇬🇧' });

    const { GET } = await import('@/app/api/shelves/route');
    const payload = await (await GET({} as any)).json();

    expect(payload.shelves).toEqual([
      { libraryId: 'en-lib', label: 'Audiobooks 🇬🇧', language: 'en', audience: 'adult', regions: ['us', 'uk'], isPrimary: true },
      { libraryId: 'de-lib', label: 'de-lib', language: 'de', audience: 'kids', regions: ['de'], isPrimary: false },
    ]);
  });

  it('returns an empty list without calling Audiobookshelf when no shelves exist', async () => {
    getShelvesMock.mockResolvedValue([]);
    const { GET } = await import('@/app/api/shelves/route');
    const payload = await (await GET({} as any)).json();
    expect(payload.shelves).toEqual([]);
    expect(fetchLibraryNamesMock).not.toHaveBeenCalled();
  });
});
