/**
 * Component: Shelf Route Preview API
 * Documentation: documentation/features/multi-library-prd.md
 *
 * Given an ASIN, previews which shelf a request would be routed into (so the
 * request dialog can show the destination and offer an override). Returns the
 * configured shelves with display labels, the auto-resolved shelf, and the
 * derived language/audience.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAudibleService } from '@/lib/integrations/audible.service';
import { getConfigService } from '@/lib/services/config.service';
import { selectShelf } from '@/lib/utils/shelf-router';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Audiobooks.ShelfRoute');

/**
 * Fetch a map of Audiobookshelf library id -> display name. Best-effort: on any
 * failure returns an empty map and callers fall back to the library id.
 */
async function fetchLibraryNames(): Promise<Record<string, string>> {
  try {
    const config = getConfigService();
    const serverUrl = await config.get('audiobookshelf.server_url');
    const apiToken = await config.get('audiobookshelf.api_token');
    if (!serverUrl || !apiToken) return {};
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/libraries`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, string> = {};
    for (const lib of data.libraries || []) {
      if (lib?.id) map[lib.id] = lib.name || lib.id;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * GET /api/audiobooks/[asin]/shelf-route
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asin: string }> }
) {
  try {
    const { asin } = await params;
    if (!asin) {
      return NextResponse.json(
        { error: 'ValidationError', message: 'ASIN is required' },
        { status: 400 }
      );
    }

    const shelves = await getConfigService().getShelves();

    // No multi-library config: nothing to preview/override.
    if (shelves.length === 0) {
      return NextResponse.json({ shelves: [], resolved: null, language: '', audience: 'adult' });
    }

    // Derive the book's language/genres from Audnexus (same source the request
    // creator uses), then run the pure router.
    let language: string | null = null;
    let genres: string[] | null = null;
    try {
      const details = await getAudibleService().getAudiobookDetails(asin);
      language = details?.language ?? null;
      genres = details?.genres ?? null;
    } catch (error) {
      logger.warn(`Failed to fetch details for ${asin}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const route = selectShelf({ language, genres }, shelves);
    const names = await fetchLibraryNames();

    return NextResponse.json({
      shelves: shelves.map((s) => ({
        libraryId: s.libraryId,
        label: names[s.libraryId] || s.libraryId,
        region: s.region,
        audience: s.audience,
        mediaPath: s.mediaPath,
        isPrimary: s.isPrimary === true,
      })),
      resolved: route.shelf
        ? { libraryId: route.shelf.libraryId, mediaPath: route.shelf.mediaPath }
        : null,
      reason: route.reason ?? null,
      language: route.language,
      audience: route.audience,
    });
  } catch (error) {
    logger.error('Failed to preview shelf route', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'ShelfRouteError', message: 'Failed to preview shelf route' },
      { status: 500 }
    );
  }
}
