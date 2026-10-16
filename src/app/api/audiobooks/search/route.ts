/**
 * Component: Audiobook Search API Route
 * Documentation: documentation/integrations/audible.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAudibleService } from '@/lib/integrations/audible.service';
import { enrichAudiobooksWithMatches } from '@/lib/utils/audiobook-matcher';
import { deduplicateAndCollectGroups } from '@/lib/utils/deduplicate-audiobooks';
import { persistDedupGroups, collapseByExistingWorks } from '@/lib/services/works.service';
import { getCurrentUserAsync } from '@/lib/middleware/auth';
import { RMABLogger } from '@/lib/utils/logger';
import { annotateWithIgnoreStatus } from '@/lib/utils/ignored-audiobooks';
import { getConfigService } from '@/lib/services/config.service';
import { AUDIBLE_REGIONS, type AudibleRegion } from '@/lib/types/audible';
import { shelfRegions } from '@/lib/utils/shelf-regions';

const logger = RMABLogger.create('API.Audiobooks.Search');

/**
 * Resolve the Audible regions a search fans out over (ADR-0002, amended):
 *  - explicit `region` param → that one store (API clients, power users);
 *  - `shelf=<libraryId>` → that shelf's store set (the UI's scope picker);
 *  - otherwise the primary shelf's stores (else the first shelf's);
 *  - no shelves at all → [undefined] = the global default service.
 */
async function resolveSearchRegions(
  regionParam: string | null,
  shelfParam: string | null,
): Promise<{ regions: Array<AudibleRegion | undefined>; shelf: string | null }> {
  if (regionParam && regionParam in AUDIBLE_REGIONS) {
    return { regions: [regionParam as AudibleRegion], shelf: null };
  }
  try {
    const shelves = await getConfigService().getShelves();
    const chosen =
      (shelfParam && shelves.find((s) => s.libraryId === shelfParam)) ||
      shelves.find((s) => s.isPrimary) ||
      shelves[0];
    if (chosen) {
      const regions = shelfRegions(chosen);
      if (regions.length > 0) return { regions, shelf: chosen.libraryId };
    }
  } catch {
    // Fall back to the global region.
  }
  return { regions: [undefined], shelf: null };
}

/**
 * GET /api/audiobooks/search?q=query&page=1[&shelf=<libraryId>|&region=de]
 * Search Audible. A shelf's stores are searched in parallel and merged; every
 * result carries the `region` it came from (ASINs are store-specific).
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || searchParams.get('query');
    const page = parseInt(searchParams.get('page') || '1', 10);

    if (!query) {
      return NextResponse.json(
        {
          error: 'ValidationError',
          message: 'Search query is required',
        },
        { status: 400 }
      );
    }

    const { regions, shelf } = await resolveSearchRegions(searchParams.get('region'), searchParams.get('shelf'));

    const perRegion = await Promise.all(
      regions.map(async (region) => {
        const audibleService = getAudibleService(region);
        const result = await audibleService.search(query, page);
        const searchedRegion = region ?? audibleService.getRegion();
        for (const book of result.results) {
          (book as { region?: string }).region = searchedRegion;
        }
        return { ...result, region: searchedRegion };
      }),
    );

    // Merge store by store (home store first); dedup below collapses the same
    // book's editions across stores and the works table remembers the siblings.
    const results = {
      query,
      page,
      results: perRegion.flatMap((r) => r.results),
      totalResults: perRegion.reduce((sum, r) => sum + (r.totalResults || 0), 0),
      hasMore: perRegion.some((r) => r.hasMore),
    };

    // Get current user (optional — JWT or API token — for request-status enrichment)
    const currentUser = await getCurrentUserAsync(request);
    const userId = currentUser?.sub || undefined;

    // Two-pass dedup: local title/narrator/duration matching first, then collapse
    // any remaining duplicates that the works table already knows are the same book
    // (handles cases where source metadata diverges across paths or pages).
    const { books: dedupedResults, groups } = deduplicateAndCollectGroups(results.results);

    if (groups.length > 0) {
      persistDedupGroups(groups).catch(() => {});
    }

    const collapsedResults = await collapseByExistingWorks(dedupedResults);

    // Enrich search results with availability and request status information
    const enrichedResults = await enrichAudiobooksWithMatches(collapsedResults, userId);

    // Annotate with per-user ignore status
    const annotatedResults = await annotateWithIgnoreStatus(enrichedResults, userId);

    return NextResponse.json({
      success: true,
      query: results.query,
      results: annotatedResults,
      totalResults: enrichedResults.length,
      page: results.page,
      hasMore: results.hasMore,
      regions: perRegion.map((r) => r.region),
      shelf,
    });
  } catch (error) {
    logger.error('Failed to search audiobooks', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: 'SearchError',
        message: 'Failed to search audiobooks',
      },
      { status: 500 }
    );
  }
}
