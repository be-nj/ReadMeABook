/**
 * Component: Requests API Route Tests
 * Documentation: documentation/testing.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from '../helpers/prisma';

let authRequest: any;

const requireAuthMock = vi.hoisted(() => vi.fn());
const prismaMock = createPrismaMock();
const jobQueueMock = vi.hoisted(() => ({
  addSearchJob: vi.fn(),
  addNotificationJob: vi.fn(() => Promise.resolve()),
}));
const findPlexMatchMock = vi.hoisted(() => vi.fn());
const getShelvesMock = vi.hoisted(() => vi.fn(() => Promise.resolve([])));

vi.mock('@/lib/middleware/auth', () => ({
  requireAuth: requireAuthMock,
}));

vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => ({ get: vi.fn().mockResolvedValue(null), getShelves: getShelvesMock }),
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/services/job-queue.service', () => ({
  getJobQueueService: () => jobQueueMock,
}));

vi.mock('@/lib/utils/audiobook-matcher', () => ({
  findPlexMatch: findPlexMatchMock,
}));

vi.mock('@/lib/integrations/audible.service', () => ({
  getAudibleService: () => ({
    getAudiobookDetails: vi.fn().mockResolvedValue(null),
  }),
}));

describe('Requests API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRequest = {
      user: { id: 'user-1', role: 'user' },
      nextUrl: new URL('http://localhost/api/requests'),
      json: vi.fn(),
    };
    requireAuthMock.mockImplementation((_req: any, handler: any) => handler(authRequest));
  });

  it('returns 409 when an active request already exists', async () => {
    authRequest.json.mockResolvedValue({
      audiobook: { asin: 'ASIN-1', title: 'Title', author: 'Author' },
    });
    prismaMock.request.findFirst.mockResolvedValueOnce({
      id: 'req-1',
      status: 'downloaded',
      userId: 'user-2',
      user: { plexUsername: 'someone' },
    } as any);

    const { POST } = await import('@/app/api/requests/route');
    const response = await POST({} as any);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('BeingProcessed');
    expect(findPlexMatchMock).not.toHaveBeenCalled();
  });

  it('returns 409 when a Plex match already exists', async () => {
    authRequest.json.mockResolvedValue({
      audiobook: { asin: 'ASIN-2', title: 'Title', author: 'Author' },
    });
    prismaMock.request.findFirst.mockResolvedValueOnce(null);
    findPlexMatchMock.mockResolvedValueOnce({ plexGuid: 'plex-1' });

    const { POST } = await import('@/app/api/requests/route');
    const response = await POST({} as any);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('AlreadyAvailable');
  });

  it('creates a new request and enqueues a search job', async () => {
    authRequest.json.mockResolvedValue({
      audiobook: { asin: 'ASIN-3', title: 'Title', author: 'Author' },
    });
    prismaMock.request.findFirst.mockResolvedValueOnce(null);
    findPlexMatchMock.mockResolvedValueOnce(null);
    prismaMock.audiobook.findFirst.mockResolvedValueOnce(null);
    prismaMock.audiobook.create.mockResolvedValueOnce({
      id: 'ab-1',
      title: 'Title',
      author: 'Author',
      audibleAsin: 'ASIN-3',
    });
    prismaMock.request.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: 'user',
      autoApproveRequests: true,  // Auto-approve enabled for this user
      plexId: 'user-1',
      plexUsername: 'testuser',
      plexEmail: null,
      isSetupAdmin: false,
      avatarUrl: null,
      authToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
      plexHomeUserId: null,
      authProvider: 'plex',
      oidcSubject: null,
      oidcProvider: null,
      registrationStatus: 'approved',
      bookDateLibraryScope: 'full',
      bookDateCustomPrompt: null,
      bookDateOnboardingComplete: false,
      deletedAt: null,
      deletedBy: null,
    } as any);
    prismaMock.request.create.mockResolvedValueOnce({
      id: 'req-2',
      status: 'pending',
      audiobook: { id: 'ab-1', title: 'Title', author: 'Author', audibleAsin: 'ASIN-3' },
      user: { id: 'user-1', plexUsername: 'user' },
    } as any);

    const { POST } = await import('@/app/api/requests/route');
    const response = await POST({} as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(jobQueueMock.addSearchJob).toHaveBeenCalledWith('req-2', {
      id: 'ab-1',
      title: 'Title',
      author: 'Author',
      asin: 'ASIN-3',
    });
  });

  it('skips auto-search when skipAutoSearch=true', async () => {
    authRequest.nextUrl = new URL('http://localhost/api/requests?skipAutoSearch=true');
    authRequest.json.mockResolvedValue({
      audiobook: { asin: 'ASIN-4', title: 'Title', author: 'Author' },
    });
    prismaMock.request.findFirst.mockResolvedValueOnce(null);
    findPlexMatchMock.mockResolvedValueOnce(null);
    prismaMock.audiobook.findFirst.mockResolvedValueOnce(null);
    prismaMock.audiobook.create.mockResolvedValueOnce({
      id: 'ab-2',
      title: 'Title',
      author: 'Author',
      audibleAsin: 'ASIN-4',
    });
    prismaMock.request.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      role: 'user',
      autoApproveRequests: true,  // Auto-approve enabled for this user
      plexId: 'user-1',
      plexUsername: 'testuser',
      plexEmail: null,
      isSetupAdmin: false,
      avatarUrl: null,
      authToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
      plexHomeUserId: null,
      authProvider: 'plex',
      oidcSubject: null,
      oidcProvider: null,
      registrationStatus: 'approved',
      bookDateLibraryScope: 'full',
      bookDateCustomPrompt: null,
      bookDateOnboardingComplete: false,
      deletedAt: null,
      deletedBy: null,
    } as any);
    prismaMock.request.create.mockResolvedValueOnce({
      id: 'req-3',
      audiobook: { id: 'ab-2', title: 'Title', author: 'Author', audibleAsin: 'ASIN-4' },
      user: { id: 'user-1', plexUsername: 'user' },
    });

    const { POST } = await import('@/app/api/requests/route');
    await POST({} as any);

    expect(jobQueueMock.addSearchJob).not.toHaveBeenCalled();
    expect(prismaMock.request.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'awaiting_search' }),
      })
    );
  });

  it('blocks a non-admin audience downgrade override even with force (force is stripped)', async () => {
    getShelvesMock.mockResolvedValueOnce([
      { libraryId: 'kids-lib', language: 'de', audience: 'kids', region: 'de', mediaPath: '/m/kids', isPrimary: false },
      { libraryId: 'de-lib', language: 'de', audience: 'adult', region: 'de', mediaPath: '/m/de', isPrimary: true },
    ]);
    findPlexMatchMock.mockResolvedValueOnce(null);
    prismaMock.request.findFirst.mockResolvedValueOnce(null);
    authRequest.user = { id: 'user-1', role: 'user' };
    authRequest.json.mockResolvedValue({
      audiobook: { asin: 'ASIN-DG', title: 'Adult Book', author: 'Author' },
      shelfLibraryId: 'kids-lib',
      forceShelfOverride: true, // non-admin -> route must strip this
    });

    const { POST } = await import('@/app/api/requests/route');
    const response = await POST({} as any);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('UnsafeAudienceOverride');
    expect(prismaMock.request.create).not.toHaveBeenCalled();
  });

  it('allows an admin to force an audience downgrade override', async () => {
    getShelvesMock.mockResolvedValueOnce([
      { libraryId: 'kids-lib', language: 'de', audience: 'kids', region: 'de', mediaPath: '/m/kids', isPrimary: false },
      { libraryId: 'de-lib', language: 'de', audience: 'adult', region: 'de', mediaPath: '/m/de', isPrimary: true },
    ]);
    findPlexMatchMock.mockResolvedValueOnce(null);
    prismaMock.request.findFirst.mockResolvedValue(null);
    prismaMock.audiobook.findFirst.mockResolvedValueOnce(null);
    prismaMock.audiobook.create.mockResolvedValueOnce({ id: 'ab-dg', title: 'Adult Book', author: 'Author', audibleAsin: 'ASIN-DG2' });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', role: 'admin', autoApproveRequests: true, plexUsername: 'admin' } as any);
    prismaMock.request.create.mockResolvedValueOnce({
      id: 'req-dg', status: 'pending',
      audiobook: { id: 'ab-dg', title: 'Adult Book', author: 'Author', audibleAsin: 'ASIN-DG2' },
      user: { id: 'admin-1', plexUsername: 'admin' },
    } as any);
    authRequest.user = { id: 'admin-1', role: 'admin' };
    authRequest.json.mockResolvedValue({
      audiobook: { asin: 'ASIN-DG2', title: 'Adult Book', author: 'Author' },
      shelfLibraryId: 'kids-lib',
      forceShelfOverride: true,
    });

    const { POST } = await import('@/app/api/requests/route');
    const response = await POST({} as any);

    expect(response.status).toBe(201);
    expect(prismaMock.audiobook.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ shelfLibraryId: 'kids-lib' }) })
    );
  });

  it('filters requests for current user when not admin', async () => {
    authRequest.nextUrl = new URL('http://localhost/api/requests?status=pending&limit=5');
    prismaMock.request.findMany.mockResolvedValueOnce([]);
    prismaMock.request.count.mockResolvedValue(0);

    const { GET } = await import('@/app/api/requests/route');
    const response = await GET({} as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(prismaMock.request.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', status: 'pending' }),
        take: 6, // limit + 1 for cursor pagination next-page detection
      })
    );
  });
});


