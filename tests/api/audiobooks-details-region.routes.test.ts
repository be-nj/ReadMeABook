/**
 * Component: Audiobook Details API Route — region pass-through
 * Documentation: documentation/integrations/audible.md
 *
 * GET /api/audiobooks/[asin]?region=xx forwards a valid region to the
 * multi-region resolver and echoes the answering region.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/audible-details-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/audible-details-resolver')>();
  return { ...actual, resolveAudiobookDetails: resolveMock };
});

async function callDetails(url: string, asin = 'B0TESTASN1') {
  const { GET } = await import('@/app/api/audiobooks/[asin]/route');
  return GET({ nextUrl: new URL(url) } as any, { params: Promise.resolve({ asin }) });
}

describe('Audiobook details route — region', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveMock.mockResolvedValue({
      audiobook: { asin: 'B0TESTASN1', title: 'Some Title' },
      region: 'us',
      audibleBaseUrl: 'https://www.audible.com',
    });
  });

  it('forwards a valid region param as the preferred region', async () => {
    const response = await callDetails('http://app/api/audiobooks/B0TESTASN1?region=us');
    const payload = await response.json();

    expect(resolveMock).toHaveBeenCalledWith('B0TESTASN1', 'us');
    expect(payload).toEqual(expect.objectContaining({ success: true, region: 'us', audibleBaseUrl: 'https://www.audible.com' }));
  });

  it('drops an unknown region param', async () => {
    await callDetails('http://app/api/audiobooks/B0TESTASN1?region=mars');
    expect(resolveMock).toHaveBeenCalledWith('B0TESTASN1', undefined);
  });

  it('returns 404 when no region resolves the ASIN', async () => {
    resolveMock.mockResolvedValue(null);
    const response = await callDetails('http://app/api/audiobooks/B0TESTASN1');
    expect(response.status).toBe(404);
  });
});
