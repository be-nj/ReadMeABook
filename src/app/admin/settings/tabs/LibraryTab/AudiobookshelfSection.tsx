/**
 * Component: Audiobookshelf Library Settings Section
 * Documentation: documentation/settings-pages.md
 */

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Settings, ABSLibrary, Shelf, ShelfAudience } from '../../lib/types';
import { AUDIBLE_REGIONS } from '@/lib/types/audible';
import { languageForRegions, normalizeShelfRegions } from '@/lib/utils/shelf-regions';

interface AudiobookshelfSectionProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onValidationChange: (section: string, isValid: boolean) => void;
  libraries: ABSLibrary[];
  testing: boolean;
  testResult: { success: boolean; message: string } | null;
  onTestConnection: () => void;
}

const SHELF_AUDIENCES: { value: ShelfAudience; label: string }[] = [
  { value: 'adult', label: 'Adult' },
  { value: 'teen', label: 'Teen' },
  { value: 'kids', label: 'Kids' },
];

export function AudiobookshelfSection({
  settings,
  onChange,
  onValidationChange,
  libraries,
  testing,
  testResult,
  onTestConnection,
}: AudiobookshelfSectionProps) {
  const shelves = settings.audiobookshelf.shelves || [];

  // A shelf searches a set of Audible stores; its home store (the first one)
  // implies the routing language (1:1), so the store set also sets the language.
  const withRegions = (shelf: Shelf, regions: string[]): Shelf => {
    const normalized = normalizeShelfRegions(regions);
    return { ...shelf, regions: normalized, region: normalized[0] ?? '', language: languageForRegions(normalized) };
  };

  const handleServerUrlChange = (serverUrl: string) => {
    onChange({
      ...settings,
      audiobookshelf: { ...settings.audiobookshelf, serverUrl },
    });
    onValidationChange('audiobookshelf', false);
  };

  const handleApiTokenChange = (apiToken: string) => {
    onChange({
      ...settings,
      audiobookshelf: { ...settings.audiobookshelf, apiToken },
    });
    onValidationChange('audiobookshelf', false);
  };

  // Persist a new shelf set, keeping exactly one primary and the legacy mirrors in
  // sync. The library list is only shown after a successful connection test, so
  // shelf edits never require re-testing — validity tracks whether every shelf has
  // a language and a media path (and there is at least one shelf).
  const applyShelves = (next: Shelf[]) => {
    let primarySeen = false;
    const normalized = next.map((s) => {
      const isPrimary = !!s.isPrimary && !primarySeen;
      if (isPrimary) primarySeen = true;
      return { ...s, isPrimary };
    });
    if (!primarySeen && normalized.length > 0) normalized[0].isPrimary = true;

    const primary = normalized.find((s) => s.isPrimary) || normalized[0];
    onChange({
      ...settings,
      audiobookshelf: {
        ...settings.audiobookshelf,
        shelves: normalized,
        libraryIds: normalized.map((s) => s.libraryId),
        libraryId: primary?.libraryId || '',
      },
    });

    const valid = normalized.length > 0 && normalized.every((s) => !!s.language && !!s.mediaPath);
    onValidationChange('audiobookshelf', valid);
  };

  const handleLibraryToggle = (libraryId: string, checked: boolean) => {
    if (checked) {
      if (shelves.some((s) => s.libraryId === libraryId)) return;
      const region = settings.audibleRegion || 'us';
      applyShelves([
        ...shelves,
        withRegions(
          { libraryId, region, regions: [], language: '', audience: 'adult', mediaPath: '', isPrimary: shelves.length === 0 },
          [region],
        ),
      ]);
    } else {
      applyShelves(shelves.filter((s) => s.libraryId !== libraryId));
    }
  };

  const handleShelfField = (libraryId: string, patch: Partial<Shelf>) => {
    applyShelves(shelves.map((s) => (s.libraryId === libraryId ? { ...s, ...patch } : s)));
  };

  // Toggle one store in a shelf's set. Order follows AUDIBLE_REGIONS, so the
  // home store is the first enabled one in that list.
  const handleRegionToggle = (libraryId: string, region: string, enabled: boolean) => {
    applyShelves(
      shelves.map((s) => {
        if (s.libraryId !== libraryId) return s;
        const current = normalizeShelfRegions(s.regions, s.region);
        const next = enabled ? [...current, region] : current.filter((r) => r !== region);
        const ordered = Object.keys(AUDIBLE_REGIONS).filter((code) => next.includes(code));
        return withRegions(s, ordered);
      }),
    );
  };

  const handleSetPrimary = (libraryId: string) => {
    applyShelves(shelves.map((s) => ({ ...s, isPrimary: s.libraryId === libraryId })));
  };

  const handleTriggerScanChange = (triggerScanAfterImport: boolean) => {
    onChange({
      ...settings,
      audiobookshelf: { ...settings.audiobookshelf, triggerScanAfterImport },
    });
  };

  const handleAudibleRegionChange = (audibleRegion: string) => {
    onChange({ ...settings, audibleRegion });
  };

  const fieldClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const subLabelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Audiobookshelf Server
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Configure your Audiobookshelf server connection and audiobook libraries.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Server URL
        </label>
        <Input
          type="url"
          value={settings.audiobookshelf.serverUrl}
          onChange={(e) => handleServerUrlChange(e.target.value)}
          placeholder="http://localhost:13378"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          API Token
        </label>
        <Input
          type="password"
          value={settings.audiobookshelf.apiToken}
          onChange={(e) => handleApiTokenChange(e.target.value)}
          placeholder="Enter your Audiobookshelf API token"
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Generate in Audiobookshelf: Settings → API Keys → Add API Key
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Audiobook Libraries (Shelves)
        </label>
        {libraries.length > 0 ? (
          <div className="space-y-3">
            {libraries.map((lib) => {
              const shelf = shelves.find((s) => s.libraryId === lib.id);
              return (
                <div
                  key={lib.id}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-3"
                >
                  <label className="flex items-center gap-2 cursor-pointer text-gray-900 dark:text-gray-100">
                    <input
                      type="checkbox"
                      checked={!!shelf}
                      onChange={(e) => handleLibraryToggle(lib.id, e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="font-medium">{lib.name}</span>
                  </label>

                  {shelf && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                      <div className="sm:col-span-2">
                        <span className={subLabelClass}>Audible stores (first enabled = home store, sets the language)</span>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {Object.values(AUDIBLE_REGIONS).map((r) => {
                            const regions = normalizeShelfRegions(shelf.regions, shelf.region);
                            const checked = regions.includes(r.code);
                            const foreign = !!shelf.language && r.language !== shelf.language && !checked;
                            return (
                              <label
                                key={r.code}
                                className={`flex items-center gap-1 text-sm cursor-pointer ${foreign ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}
                                title={foreign ? `Different language (${r.language}) than this shelf (${shelf.language})` : undefined}
                              >
                                <input
                                  type="checkbox"
                                  aria-label={`${r.name} store`}
                                  checked={checked}
                                  onChange={(e) => handleRegionToggle(lib.id, r.code, e.target.checked)}
                                  className="rounded border-gray-300 dark:border-gray-600"
                                />
                                <span>{r.name}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Language: <span className="font-medium">{shelf.language || '—'}</span>
                          {shelf.language && normalizeShelfRegions(shelf.regions, shelf.region).some((c) => AUDIBLE_REGIONS[c].language !== shelf.language)
                            ? ' · mixed languages: search results from other-language stores will not route here'
                            : ''}
                        </p>
                      </div>
                      <div>
                        <label className={subLabelClass}>Audience</label>
                        <select
                          value={shelf.audience}
                          onChange={(e) =>
                            handleShelfField(lib.id, { audience: e.target.value as ShelfAudience })
                          }
                          className={fieldClass}
                        >
                          {SHELF_AUDIENCES.map((a) => (
                            <option key={a.value} value={a.value}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={subLabelClass}>Media output path</label>
                        <Input
                          type="text"
                          value={shelf.mediaPath}
                          onChange={(e) => handleShelfField(lib.id, { mediaPath: e.target.value })}
                          placeholder="/data/media/audio/audiobooks"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
                          <input
                            type="radio"
                            name="abs-primary-shelf"
                            checked={!!shelf.isPrimary}
                            onChange={() => handleSetPrimary(lib.id)}
                          />
                          <span>Primary (routing fallback &amp; search default until a shelf is picked)</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-2">
            Test your connection to load libraries.
          </div>
        )}
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Enable each library you use and set its language, audience, and where downloads are filed.
          Ownership is detected across all enabled libraries.
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.audiobookshelf.triggerScanAfterImport}
            onChange={(e) => handleTriggerScanChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
          />
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Trigger library scan after import
            </span>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Automatically triggers Audiobookshelf to scan its filesystem after organizing downloaded files.
              Only enable this if you have Audiobookshelf&apos;s filesystem watcher (automatic scanning) disabled.
              Most users should leave this disabled and rely on Audiobookshelf&apos;s built-in automatic detection.
            </p>
          </div>
        </label>
      </div>

      {/* Audible Region Selection */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-2">
        <label
          htmlFor="audible-region-abs"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Audible Region
        </label>
        <select
          id="audible-region-abs"
          value={settings.audibleRegion || 'us'}
          onChange={(e) => handleAudibleRegionChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.values(AUDIBLE_REGIONS).map((region) => (
            <option key={region.code} value={region.code}>
              {region.name}{region.language !== 'en' ? ' *' : ''}
            </option>
          ))}
        </select>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Fallback Audible region for metadata lookups and for new shelves. Searching uses each shelf&apos;s own stores.
        </p>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <Button
          onClick={onTestConnection}
          loading={testing}
          disabled={!settings.audiobookshelf.serverUrl || !settings.audiobookshelf.apiToken}
          variant="outline"
          className="w-full"
        >
          Test Connection
        </Button>
        {testResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${
            testResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}>
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
}
