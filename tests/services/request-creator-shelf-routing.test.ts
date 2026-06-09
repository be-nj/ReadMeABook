/**
 * Component: Request Creator Shelf Routing Tests
 * Documentation: documentation/features/multi-library-prd.md
 *
 * Tests that createRequestForUser routes a request into the right shelf —
 * automatically via selectShelf, and via an explicit shelfLibraryId override.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from '../helpers/prisma';

const prismaMock = createPrismaMock();

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/utils/logger', () => ({
  RMABLogger: { create: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock('@/lib/utils/audiobook-matcher', () => ({
  findPlexMatch: vi.fn().mockResolvedValue(null),
}));

const audibleServiceMock = vi.hoisted(() => ({
  getAudiobookDetails: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/integrations/audible.service', () => ({
  getAudibleService: () => audibleServiceMock,
}));

vi.mock('@/lib/services/job-queue.service', () => ({
  getJobQueueService: () => ({
    addSearchJob: vi.fn().mockResolvedValue(undefined),
    addNotificationJob: vi.fn().mockResolvedValue(undefined),
  }),
}));

const configServiceGet = vi.hoisted(() => vi.fn());
const getShelvesMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => ({ get: configServiceGet, getShelves: getShelvesMock }),
}));

const mockGetSiblingAsins = vi.hoisted(() => vi.fn());
const mockSeedAsin = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/works.service', () => ({
  getSiblingAsins: (...args: any[]) => mockGetSiblingAsins(...args),
  seedAsin: (...args: any[]) => mockSeedAsin(...args),
}));

const SHELVES = [
  { libraryId: 'en-lib', language: 'en', audience: 'adult', region: 'us', mediaPath: '/data/media/audio/audiobooks-english', isPrimary: true },
  { libraryId: 'de-lib', language: 'de', audience: 'adult', region: 'de', mediaPath: '/data/media/audio/audiobooks', isPrimary: false },
  { libraryId: 'kids-lib', language: 'de', audience: 'kids', region: 'de', mediaPath: '/data/media/kids/audio/audiobooks', isPrimary: false },
];

const TEST_AUDIOBOOK = { asin: 'B00TEST001', title: 'Test Book', author: 'Test Author' };
const USER = 'user-123';

// The data passed to audiobook.create (where shelf routing is persisted).
function createdAudiobookData() {
  return prismaMock.audiobook.create.mock.calls.at(-1)?.[0]?.data ?? {};
}

describe('createRequestForUser — shelf routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.request.findFirst.mockResolvedValue(null);
    prismaMock.audiobook.findFirst.mockResolvedValue(null);
    prismaMock.audiobook.create.mockResolvedValue({ id: 'audiobook-1', audibleAsin: TEST_AUDIOBOOK.asin, title: TEST_AUDIOBOOK.title, author: TEST_AUDIOBOOK.author, narrator: null });
    prismaMock.request.create.mockResolvedValue({
      id: 'request-1', userId: USER, audiobookId: 'audiobook-1', status: 'pending',
      audiobook: { id: 'audiobook-1', title: 'Test Book' }, user: { id: USER, plexUsername: 'testuser' },
    });
    prismaMock.user.findUnique.mockResolvedValue({ role: 'user', autoApproveRequests: true, plexUsername: 'testuser' });
    prismaMock.ignoredAudiobook.findUnique.mockResolvedValue(null);
    prismaMock.ignoredAudiobook.findFirst.mockResolvedValue(null);
    configServiceGet.mockResolvedValue(null);
    getShelvesMock.mockResolvedValue(SHELVES);
    mockGetSiblingAsins.mockResolvedValue(new Map());
    mockSeedAsin.mockResolvedValue(undefined);
  });

  it('auto-routes a German book to the German shelf', async () => {
    audibleServiceMock.getAudiobookDetails.mockResolvedValue({ language: 'German', genres: ['Roman'] });
    const { createRequestForUser } = await import('@/lib/services/request-creator.service');
    await createRequestForUser(USER, TEST_AUDIOBOOK, { bypassIgnore: true });

    const data = createdAudiobookData();
    expect(data.shelfLibraryId).toBe('de-lib');
    expect(data.shelfMediaPath).toBe('/data/media/audio/audiobooks');
  });

  it('honours an explicit shelf override over automatic routing', async () => {
    // A German kids book auto-routes to kids-lib, but the user picks the German
    // adult shelf instead (an upward, allowed override).
    audibleServiceMock.getAudiobookDetails.mockResolvedValue({ language: 'German', genres: ["Children's"] });
    const { createRequestForUser } = await import('@/lib/services/request-creator.service');
    await createRequestForUser(USER, TEST_AUDIOBOOK, { bypassIgnore: true, shelfLibraryId: 'de-lib' });

    const data = createdAudiobookData();
    expect(data.shelfLibraryId).toBe('de-lib');
    expect(data.shelfMediaPath).toBe('/data/media/audio/audiobooks');
  });

  it('falls back to auto-routing when the override matches no shelf', async () => {
    audibleServiceMock.getAudiobookDetails.mockResolvedValue({ language: 'German', genres: ['Roman'] });
    const { createRequestForUser } = await import('@/lib/services/request-creator.service');
    await createRequestForUser(USER, TEST_AUDIOBOOK, { bypassIgnore: true, shelfLibraryId: 'does-not-exist' });

    const data = createdAudiobookData();
    expect(data.shelfLibraryId).toBe('de-lib'); // auto-routed, override ignored
  });

  it('blocks an override that downgrades audience (adult book -> kids shelf)', async () => {
    audibleServiceMock.getAudiobookDetails.mockResolvedValue({ language: 'German', genres: ['Roman'] });
    const { createRequestForUser } = await import('@/lib/services/request-creator.service');
    const result = await createRequestForUser(USER, TEST_AUDIOBOOK, { bypassIgnore: true, shelfLibraryId: 'kids-lib' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('unsafe_audience_override');
    expect(prismaMock.request.create).not.toHaveBeenCalled();
  });

  it('allows the downgrade override when forced (admin)', async () => {
    audibleServiceMock.getAudiobookDetails.mockResolvedValue({ language: 'German', genres: ['Roman'] });
    const { createRequestForUser } = await import('@/lib/services/request-creator.service');
    const result = await createRequestForUser(USER, TEST_AUDIOBOOK, {
      bypassIgnore: true, shelfLibraryId: 'kids-lib', forceShelfOverride: true,
    });

    expect(result.success).toBe(true);
    expect(createdAudiobookData().shelfLibraryId).toBe('kids-lib');
  });

  it('leaves shelf fields unset when no shelf matches the language', async () => {
    audibleServiceMock.getAudiobookDetails.mockResolvedValue({ language: 'French', genres: [] });
    const { createRequestForUser } = await import('@/lib/services/request-creator.service');
    await createRequestForUser(USER, TEST_AUDIOBOOK, { bypassIgnore: true });

    const data = createdAudiobookData();
    expect(data.shelfLibraryId ?? null).toBeNull();
    expect(data.shelfMediaPath ?? null).toBeNull();
  });
});
