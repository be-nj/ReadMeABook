/**
 * Component: Shelves API
 * Documentation: documentation/features/multi-library-prd.md
 *
 * GET /api/shelves — the configured shelves with display labels, for the
 * search scope picker and request dialogs. Any authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { getConfigService } from '@/lib/services/config.service';
import { fetchLibraryNames, summarizeShelves } from '@/lib/services/shelf-labels';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Shelves');

export async function GET(request: NextRequest) {
  return requireAuth(request, async () => {
    try {
      const shelves = await getConfigService().getShelves();
      const names = shelves.length > 0 ? await fetchLibraryNames() : {};
      return NextResponse.json({ shelves: summarizeShelves(shelves, names) });
    } catch (error) {
      logger.error('Failed to list shelves', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: 'ShelvesError', message: 'Failed to list shelves' }, { status: 500 });
    }
  });
}
