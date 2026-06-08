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
        const { serverUrl, apiToken, libraryIds, libraryId, triggerScanAfterImport } = body;

        // Normalise to a list of library ids. Accept the legacy single libraryId
        // for back-compat with older clients.
        const ids: string[] = Array.isArray(libraryIds)
          ? libraryIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
          : (libraryId ? [libraryId] : []);

        const { getConfigService } = await import('@/lib/services/config.service');
        const configService = getConfigService();

        // Build updates array, skipping masked values
        const updates: ConfigUpdate[] = [
          { key: 'audiobookshelf.server_url', value: serverUrl || '' },
          { key: 'audiobookshelf.library_ids', value: JSON.stringify(ids) },
          // Legacy mirror of the first selection for not-yet-migrated readers.
          { key: 'audiobookshelf.library_id', value: ids[0] || '' },
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
