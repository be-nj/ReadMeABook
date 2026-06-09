/**
 * Component: Admin Settings — AudiobookshelfSection (shelves UI)
 * Documentation: documentation/settings-pages.md
 *
 * Verifies the per-library shelf rows: enabling a library adds a shelf, the
 * region/audience/media-path fields edit that shelf, region selection derives
 * the routing language, and the primary radio keeps exactly one primary.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AudiobookshelfSection } from '@/app/admin/settings/tabs/LibraryTab/AudiobookshelfSection';
import type { Settings, Shelf, ABSLibrary } from '@/app/admin/settings/lib/types';

const LIBRARIES: ABSLibrary[] = [
  { id: 'de-lib', name: 'Hörbücher', type: 'book', itemCount: 100 },
  { id: 'en-lib', name: 'Audiobooks', type: 'book', itemCount: 50 },
  { id: 'kids-lib', name: 'Kinder', type: 'book', itemCount: 20 },
];

// Minimal Settings — the component only reads settings.audiobookshelf + audibleRegion.
function makeSettings(shelves: Shelf[]): Settings {
  return {
    audibleRegion: 'us',
    audiobookshelf: {
      serverUrl: 'http://abs',
      apiToken: 'token',
      shelves,
      libraryIds: shelves.map((s) => s.libraryId),
      libraryId: shelves.find((s) => s.isPrimary)?.libraryId || shelves[0]?.libraryId || '',
      triggerScanAfterImport: false,
    },
  } as unknown as Settings;
}

function renderSection(shelves: Shelf[]) {
  const onChange = vi.fn();
  const onValidationChange = vi.fn();
  render(
    <AudiobookshelfSection
      settings={makeSettings(shelves)}
      onChange={onChange}
      onValidationChange={onValidationChange}
      libraries={LIBRARIES}
      testing={false}
      testResult={null}
      onTestConnection={vi.fn()}
    />
  );
  // The shelves that onChange was last called with.
  const lastShelves = (): Shelf[] => {
    const last = onChange.mock.calls.at(-1)?.[0] as Settings | undefined;
    return last?.audiobookshelf.shelves ?? [];
  };
  return { onChange, onValidationChange, lastShelves };
}

// The row container for a given library, located by its name.
function rowFor(libName: string): HTMLElement {
  const label = screen.getByText(libName);
  return label.closest('div.rounded-lg') as HTMLElement;
}

describe('AudiobookshelfSection — shelves', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a row per library and only enabled shelves expand their fields', () => {
    renderSection([
      { libraryId: 'de-lib', region: 'de', language: 'de', audience: 'adult', mediaPath: '/m/de', isPrimary: true },
    ]);

    // Three library checkboxes, one checked.
    const checkboxes = screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).type === 'checkbox');
    // 3 library checkboxes + 1 "trigger scan" checkbox
    expect(checkboxes).toHaveLength(4);

    // The enabled de-lib row shows its fields; en-lib (disabled) does not.
    const deRow = rowFor('Hörbücher');
    expect(within(deRow).getByText('Media output path')).toBeInTheDocument();
    expect((within(deRow).getByDisplayValue('/m/de') as HTMLInputElement)).toBeInTheDocument();

    const enRow = rowFor('Audiobooks');
    expect(within(enRow).queryByText('Media output path')).not.toBeInTheDocument();
  });

  it('enabling a library adds a shelf defaulted to the global audible region', () => {
    const { onChange, lastShelves } = renderSection([]);

    const enRow = rowFor('Audiobooks');
    const checkbox = within(enRow).getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalled();
    const shelves = lastShelves();
    expect(shelves).toHaveLength(1);
    expect(shelves[0]).toMatchObject({
      libraryId: 'en-lib',
      region: 'us', // global audibleRegion
      language: 'en', // derived from region
      audience: 'adult',
      isPrimary: true, // first shelf becomes primary
    });
  });

  it('changing the region derives the routing language', () => {
    const { lastShelves } = renderSection([
      { libraryId: 'de-lib', region: 'us', language: 'en', audience: 'adult', mediaPath: '/m', isPrimary: true },
    ]);

    const deRow = rowFor('Hörbücher');
    const regionSelect = within(deRow).getByDisplayValue('United States') as HTMLSelectElement;
    fireEvent.change(regionSelect, { target: { value: 'de' } });

    const shelf = lastShelves().find((s) => s.libraryId === 'de-lib')!;
    expect(shelf.region).toBe('de');
    expect(shelf.language).toBe('de');
  });

  it('editing the media path updates only that shelf', () => {
    const { lastShelves } = renderSection([
      { libraryId: 'de-lib', region: 'de', language: 'de', audience: 'adult', mediaPath: '', isPrimary: true },
    ]);

    const deRow = rowFor('Hörbücher');
    const pathInput = within(deRow).getByPlaceholderText('/data/media/audio/audiobooks') as HTMLInputElement;
    fireEvent.change(pathInput, { target: { value: '/data/media/audio/audiobooks' } });

    expect(lastShelves().find((s) => s.libraryId === 'de-lib')!.mediaPath).toBe('/data/media/audio/audiobooks');
  });

  it('selecting primary on one shelf clears it on the others', () => {
    const { lastShelves } = renderSection([
      { libraryId: 'de-lib', region: 'de', language: 'de', audience: 'adult', mediaPath: '/m/de', isPrimary: true },
      { libraryId: 'en-lib', region: 'us', language: 'en', audience: 'adult', mediaPath: '/m/en', isPrimary: false },
    ]);

    const enRow = rowFor('Audiobooks');
    const radio = within(enRow).getByRole('radio') as HTMLInputElement;
    fireEvent.click(radio);

    const shelves = lastShelves();
    expect(shelves.filter((s) => s.isPrimary)).toHaveLength(1);
    expect(shelves.find((s) => s.libraryId === 'en-lib')!.isPrimary).toBe(true);
    expect(shelves.find((s) => s.libraryId === 'de-lib')!.isPrimary).toBe(false);
  });

  it('marks the section valid only when every shelf has language and mediaPath', () => {
    // A shelf missing its media path is invalid.
    const { onValidationChange } = renderSection([
      { libraryId: 'de-lib', region: 'de', language: 'de', audience: 'adult', mediaPath: '', isPrimary: true },
    ]);

    // Trigger an applyShelves call (toggle audience) so validity is recomputed.
    const deRow = rowFor('Hörbücher');
    const audienceSelect = within(deRow).getByDisplayValue('Adult') as HTMLSelectElement;
    fireEvent.change(audienceSelect, { target: { value: 'kids' } });

    const lastValid = onValidationChange.mock.calls.at(-1);
    expect(lastValid?.[0]).toBe('audiobookshelf');
    expect(lastValid?.[1]).toBe(false);
  });
});
