/**
 * Audiobookshelf Settings API
 * Documentation: documentation/features/audiobookshelf-integration.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { ConfigUpdate } from '@/lib/services/config.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Admin.Settings.Audiobookshelf');

export async function PUT(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const body = await request.json();
        const { serverUrl, apiToken, shelves, libraryIds, libraryId, triggerScanAfterImport } = body;

        // Normalise shelves. Accept legacy libraryIds/libraryId from older clients
        // by deriving minimal shelves from them.
        type IncomingShelf = {
          libraryId?: unknown;
          language?: unknown;
          audience?: unknown;
          region?: unknown;
          mediaPath?: unknown;
          isPrimary?: unknown;
        };
        let normalizedShelves: Array<{
          libraryId: string;
          language: string;
          audience: 'kids' | 'teen' | 'adult';
          region: string;
          mediaPath: string;
          isPrimary: boolean;
        }>;

        if (Array.isArray(shelves)) {
          normalizedShelves = (shelves as IncomingShelf[])
            .filter((s) => s && typeof s.libraryId === 'string' && s.libraryId.length > 0)
            .map((s) => ({
              libraryId: s.libraryId as string,
              language: typeof s.language === 'string' ? s.language : '',
              audience:
                s.audience === 'kids' || s.audience === 'teen' || s.audience === 'adult'
                  ? s.audience
                  : 'adult',
              // Per-shelf region arrives with multi-region search; default empty for now.
              region: typeof s.region === 'string' ? s.region : '',
              mediaPath: typeof s.mediaPath === 'string' ? s.mediaPath : '',
              isPrimary: s.isPrimary === true,
            }));
        } else {
          const legacyIds: string[] = Array.isArray(libraryIds)
            ? libraryIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
            : (libraryId ? [libraryId] : []);
          normalizedShelves = legacyIds.map((id, i) => ({
            libraryId: id,
            language: '',
            audience: 'adult' as const,
            region: '',
            mediaPath: '',
            isPrimary: i === 0,
          }));
        }

        // Ensure exactly one primary.
        if (normalizedShelves.length > 0 && !normalizedShelves.some((s) => s.isPrimary)) {
          normalizedShelves[0].isPrimary = true;
        }

        const ids = normalizedShelves.map((s) => s.libraryId);
        const primary = normalizedShelves.find((s) => s.isPrimary) || normalizedShelves[0];

        const { getConfigService } = await import('@/lib/services/config.service');
        const configService = getConfigService();

        // Build updates array, skipping masked values
        const updates: ConfigUpdate[] = [
          { key: 'audiobookshelf.server_url', value: serverUrl || '' },
          { key: 'audiobookshelf.shelves', value: JSON.stringify(normalizedShelves) },
          // Mirrors for owned-sync and legacy readers not yet using shelves.
          { key: 'audiobookshelf.library_ids', value: JSON.stringify(ids) },
          { key: 'audiobookshelf.library_id', value: primary?.libraryId || '' },
          { key: 'audiobookshelf.trigger_scan_after_import', value: triggerScanAfterImport === true ? 'true' : 'false' },
        ];

        // Only update API token if it's not the masked placeholder
        if (apiToken && !apiToken.startsWith('••••')) {
          updates.push({
            key: 'audiobookshelf.api_token',
            value: apiToken,
            encrypted: true,
          });
        }

        // Update configuration
        await configService.setMany(updates);

        return NextResponse.json({
          success: true,
          message: 'Audiobookshelf settings saved successfully'
        });
      } catch (error) {
        logger.error('Failed to save Audiobookshelf settings', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json(
          { error: 'Failed to save settings' },
          { status: 500 }
        );
      }
    });
  });
}
