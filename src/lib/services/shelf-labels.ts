/**
 * Component: Shelf Labels
 * Documentation: documentation/features/multi-library-prd.md
 *
 * Display names for shelves: the Audiobookshelf library name behind each
 * shelf's libraryId. Best-effort — on any failure the id is the label.
 */

import { getConfigService, type Shelf } from '@/lib/services/config.service';
import { shelfRegions } from '@/lib/utils/shelf-regions';

/** Map of Audiobookshelf library id → display name (empty on failure). */
export async function fetchLibraryNames(): Promise<Record<string, string>> {
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

/** Public (non-admin) view of a shelf: what the search/request UI needs. */
export interface ShelfSummary {
  libraryId: string;
  label: string;
  language: string;
  audience: string;
  regions: string[];
  isPrimary: boolean;
}

export function summarizeShelves(shelves: Shelf[], names: Record<string, string>): ShelfSummary[] {
  return shelves.map((s) => ({
    libraryId: s.libraryId,
    label: names[s.libraryId] || s.libraryId,
    language: s.language,
    audience: s.audience,
    regions: shelfRegions(s),
    isPrimary: s.isPrimary === true,
  }));
}
