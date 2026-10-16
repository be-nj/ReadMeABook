/**
 * Component: Audible Details Resolver (multi-region)
 * Documentation: documentation/integrations/audible.md
 *
 * Resolves per-ASIN details across Audible regions. ASINs are store-specific:
 * a search run in one region (per shelf language) yields ASINs that the
 * global-region service cannot resolve (Audnexus 404, catalog API stub). This
 * helper tries the preferred region first, then the global region, then every
 * distinct shelf region, and reports which region answered.
 */

import { getAudibleService, type AudibleAudiobook } from '@/lib/integrations/audible.service';
import { getConfigService } from '@/lib/services/config.service';
import { AUDIBLE_REGIONS, DEFAULT_AUDIBLE_REGION, type AudibleRegion } from '@/lib/types/audible';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('AudibleDetailsResolver');

export interface ResolvedAudiobookDetails {
  audiobook: AudibleAudiobook;
  /** Region that answered; undefined when the global (unpinned) service did. */
  region: AudibleRegion | undefined;
  /** HTML base URL of the answering region (for outbound links). */
  audibleBaseUrl: string;
}

/** Narrow an untrusted string to a known Audible region code. */
export function parseAudibleRegion(value: string | null | undefined): AudibleRegion | undefined {
  return value && value in AUDIBLE_REGIONS ? (value as AudibleRegion) : undefined;
}

/** Distinct, valid regions across all configured shelves (best-effort). */
async function getShelfRegions(): Promise<AudibleRegion[]> {
  try {
    const shelves = await getConfigService().getShelves();
    const regions = new Set<AudibleRegion>();
    for (const shelf of shelves) {
      const region = parseAudibleRegion(shelf.region);
      if (region) regions.add(region);
    }
    return [...regions];
  } catch {
    return [];
  }
}

/**
 * Fetch details for an ASIN, trying regions in order:
 * preferred (if given) → global service → each distinct shelf region.
 * Returns null only when every candidate region fails.
 */
export async function resolveAudiobookDetails(
  asin: string,
  preferredRegion?: AudibleRegion,
): Promise<ResolvedAudiobookDetails | null> {
  const tried = new Set<string>();

  const attempt = async (region: AudibleRegion | undefined): Promise<ResolvedAudiobookDetails | null> => {
    if (region && tried.has(region)) return null;
    const service = getAudibleService(region);
    const audiobook = await service.getAudiobookDetails(asin);
    // The global service only knows its region after its first call initialized it.
    // Region bookkeeping must never fail a successful fetch.
    let answered: AudibleRegion | undefined = region;
    if (!answered) {
      try {
        answered = service.getRegion();
      } catch {
        answered = undefined;
      }
    }
    if (answered) tried.add(answered);
    if (!audiobook) return null;
    const audibleBaseUrl = (answered && AUDIBLE_REGIONS[answered]?.baseUrl) || AUDIBLE_REGIONS[DEFAULT_AUDIBLE_REGION].baseUrl;
    return { audiobook, region, audibleBaseUrl };
  };

  if (preferredRegion) {
    const hit = await attempt(preferredRegion);
    if (hit) return hit;
  }

  const globalHit = await attempt(undefined);
  if (globalHit) return globalHit;

  for (const region of await getShelfRegions()) {
    const hit = await attempt(region);
    if (hit) {
      logger.info(`Resolved ${asin} via shelf region ${region} after global miss`);
      return hit;
    }
  }

  return null;
}
