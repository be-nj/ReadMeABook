/**
 * Component: Audiobook Details API Route
 * Documentation: documentation/integrations/audible.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseAudibleRegion, resolveAudiobookDetails } from '@/lib/services/audible-details-resolver';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Audiobooks.Details');

/**
 * GET /api/audiobooks/[asin]?region=de
 * Get detailed information for a specific audiobook. ASINs are store-specific,
 * so the optional `region` (the one the ASIN came from) is tried first; the
 * resolver then falls back to the global region and every shelf region.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asin: string }> }
) {
  try {
    const { asin } = await params;

    if (!asin || asin.length !== 10) {
      return NextResponse.json(
        {
          error: 'ValidationError',
          message: 'Valid ASIN is required',
        },
        { status: 400 }
      );
    }

    const preferredRegion = parseAudibleRegion(request?.nextUrl?.searchParams?.get('region'));
    const resolved = await resolveAudiobookDetails(asin, preferredRegion);

    if (!resolved) {
      return NextResponse.json(
        {
          error: 'NotFound',
          message: 'Audiobook not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      audiobook: resolved.audiobook,
      audibleBaseUrl: resolved.audibleBaseUrl,
      region: resolved.region ?? null,
    });
  } catch (error) {
    logger.error('Failed to get audiobook details', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: 'FetchError',
        message: 'Failed to fetch audiobook details',
      },
      { status: 500 }
    );
  }
}
