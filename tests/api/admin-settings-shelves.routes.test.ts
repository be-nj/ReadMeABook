/**
 * Component: Admin Settings — Audiobookshelf shelves roundtrip
 * Documentation: documentation/testing.md
 *
 * Verifies that shelves saved via PUT /api/admin/settings/audiobookshelf are
 * read back identically by GET /api/admin/settings, and that a config without
 * stored shelves derives shelves from the legacy library_ids + media_dir.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from '../helpers/prisma';

const prismaMock = createPrismaMock();
const requireAuthMock = vi.hoisted(() => vi.fn());
const requireAdminMock = vi.hoisted(() => vi.fn());
const setManyMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

vi.mock('@/lib/middleware/auth', () => ({
  requireAuth: requireAuthMock,
  requireAdmin: requireAdminMock,
}));

vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => ({ setMany: setManyMock }),
}));

// Build a request whose .json() resolves to the given body.
function jsonRequest(body: any) {
  return { json: async () => body } as any;
}

// Turn a captured setMany() updates array into the configMap GET will read.
function updatesToConfigRows(updates: Array<{ key: string; value: string }>) {
  return updates.map((u) => ({ key: u.key, value: u.value }));
}

describe('Admin settings — Audiobookshelf shelves roundtrip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockImplementation((_req: any, handler: any) =>
      handler({ user: { id: 'admin-1', role: 'admin' } })
    );
    requireAdminMock.mockImplementation((_req: any, handler: any) => handler());
    setManyMock.mockResolvedValue(undefined);
    prismaMock.user.count.mockResolvedValue(0);
  });

  it('round-trips configured shelves through PUT then GET', async () => {
    const shelves = [
      { libraryId: 'de-lib', language: 'de', audience: 'adult', region: 'de', mediaPath: '/data/media/audio/audiobooks', isPrimary: true },
      { libraryId: 'en-lib', language: 'en', audience: 'adult', region: 'us', mediaPath: '/data/media/audio/audiobooks-english', isPrimary: false },
      { libraryId: 'kids-lib', language: 'de', audience: 'kids', region: 'de', mediaPath: '/data/media/kids/audio/audiobooks', isPrimary: false },
    ];

    // --- PUT ---
    const { PUT } = await import('@/app/api/admin/settings/audiobookshelf/route');
    const putRes = await PUT(jsonRequest({ serverUrl: 'http://abs', shelves, triggerScanAfterImport: true }));
    expect(putRes.status).toBe(200);
    expect(setManyMock).toHaveBeenCalledTimes(1);

    const updates = setManyMock.mock.calls[0][0] as Array<{ key: string; value: string }>;
    const byKey = new Map(updates.map((u) => [u.key, u.value]));
    // Persisted shape: full shelves JSON + legacy mirrors.
    expect(JSON.parse(byKey.get('audiobookshelf.shelves') as string)).toEqual(shelves);
    expect(JSON.parse(byKey.get('audiobookshelf.library_ids') as string)).toEqual(['de-lib', 'en-lib', 'kids-lib']);
    expect(byKey.get('audiobookshelf.library_id')).toBe('de-lib'); // the primary

    // --- GET reads back exactly what PUT wrote ---
    prismaMock.configuration.findMany.mockResolvedValue(updatesToConfigRows(updates));
    const { GET } = await import('@/app/api/admin/settings/route');
    const getRes = await GET({} as any);
    expect(getRes.status).toBe(200);
    const settings = await getRes.json();

    expect(settings.audiobookshelf.shelves).toEqual(shelves);
    expect(settings.audiobookshelf.libraryIds).toEqual(['de-lib', 'en-lib', 'kids-lib']);
    expect(settings.audiobookshelf.libraryId).toBe('de-lib');
  });

  it('forces exactly one primary when none is marked', async () => {
    const shelves = [
      { libraryId: 'a', language: 'de', audience: 'adult', region: 'de', mediaPath: '/m/a', isPrimary: false },
      { libraryId: 'b', language: 'en', audience: 'adult', region: 'us', mediaPath: '/m/b', isPrimary: false },
    ];
    const { PUT } = await import('@/app/api/admin/settings/audiobookshelf/route');
    await PUT(jsonRequest({ serverUrl: 'http://abs', shelves }));

    const updates = setManyMock.mock.calls[0][0] as Array<{ key: string; value: string }>;
    const stored = JSON.parse(updates.find((u) => u.key === 'audiobookshelf.shelves')!.value);
    expect(stored.filter((s: any) => s.isPrimary)).toHaveLength(1);
    expect(stored[0].isPrimary).toBe(true);
  });

  it('GET derives shelves from legacy library_ids + media_dir when none are stored', async () => {
    prismaMock.configuration.findMany.mockResolvedValue([
      { key: 'audiobookshelf.library_ids', value: JSON.stringify(['l1', 'l2']) },
      { key: 'media_dir', value: '/data/media/audio/audiobooks' },
      { key: 'audible.region', value: 'us' },
    ]);

    const { GET } = await import('@/app/api/admin/settings/route');
    const settings = await (await GET({} as any)).json();

    expect(settings.audiobookshelf.shelves).toEqual([
      { libraryId: 'l1', region: 'us', language: '', audience: 'adult', mediaPath: '/data/media/audio/audiobooks', isPrimary: true },
      { libraryId: 'l2', region: 'us', language: '', audience: 'adult', mediaPath: '/data/media/audio/audiobooks', isPrimary: false },
    ]);
  });
});
