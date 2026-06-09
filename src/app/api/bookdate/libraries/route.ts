/**
 * Component: BookDate Library List API
 * Documentation: documentation/features/bookdate.md
 *
 * Returns the libraries a user can scope BookDate recommendations to. For
 * Audiobookshelf this is the configured shelves (with their ABS display names);
 * for Plex it's the single configured audiobook library.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticatedRequest } from '@/lib/middleware/auth';
import { getConfigService } from '@/lib/services/config.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.BookDate.Libraries');

/** Best-effort map of Audiobookshelf library id -> display name. */
async function fetchAbsLibraryNames(): Promise<Record<string, string>> {
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

async function getLibraries(_req: AuthenticatedRequest) {
  try {
    const config = getConfigService();
    const backendMode = await config.getBackendMode();

    if (backendMode === 'audiobookshelf') {
      const ids = await config.getAudiobookshelfLibraryIds();
      const names = await fetchAbsLibraryNames();
      return NextResponse.json({
        libraries: ids.map((id) => ({ libraryId: id, name: names[id] || id })),
      });
    }

    const plexConfig = await config.getPlexConfig();
    return NextResponse.json({
      libraries: plexConfig.libraryId ? [{ libraryId: plexConfig.libraryId, name: 'Audiobooks' }] : [],
    });
  } catch (error) {
    logger.error('Failed to list BookDate libraries', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ libraries: [] });
  }
}

export async function GET(req: NextRequest) {
  return requireAuth(req, getLibraries);
}
