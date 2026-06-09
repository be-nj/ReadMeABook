/**
 * Component: BookDate Settings Widget Tests
 * Documentation: documentation/features/bookdate.md
 */

// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/bookdate/BookPickerModal', () => ({
  BookPickerModal: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: (ids: string[]) => void }) =>
    isOpen ? (
      <div data-testid="book-picker">
        <button onClick={() => onConfirm(['book-1'])}>Select Book</button>
      </div>
    ) : null,
}));

/**
 * Route fetch by URL so the component's extra GET /api/bookdate/libraries call
 * doesn't disturb order-dependent assertions. `prefsOk: false` simulates a
 * failed preferences load; `libraries` lets a test exercise the library picker.
 */
function routeFetch(
  prefs: any,
  opts?: { prefsOk?: boolean; libraries?: { libraryId: string; name: string }[] }
) {
  return vi.fn((url: string, init?: any) => {
    if (url === '/api/bookdate/libraries') {
      return Promise.resolve({ ok: true, json: async () => ({ libraries: opts?.libraries ?? [] }) });
    }
    if (url === '/api/bookdate/preferences' && init?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    // GET preferences
    return Promise.resolve({ ok: opts?.prefsOk ?? true, json: async () => prefs });
  });
}

const putCall = (fetchMock: any) =>
  fetchMock.mock.calls.find((c: any[]) => c[0] === '/api/bookdate/preferences' && c[1]?.method === 'PUT');

describe('SettingsWidget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads preferences and populates the form', async () => {
    const fetchMock = routeFetch({
      libraryScope: 'rated',
      favoriteBookIds: ['book-1'],
      customPrompt: 'Custom prompt',
      backendCapabilities: { supportsRatings: true },
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('accessToken', 'token-789');
    const { SettingsWidget } = await import('@/components/bookdate/SettingsWidget');

    render(<SettingsWidget isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/bookdate/preferences', {
        headers: { Authorization: 'Bearer token-789' },
      });
    });

    const ratedRadio = await screen.findByRole('radio', { name: /Rated Books Only/ });
    expect(ratedRadio).toBeChecked();
    expect(screen.getByDisplayValue('Custom prompt')).toBeInTheDocument();
  });

  it('requires favorites selection before saving', async () => {
    const fetchMock = routeFetch({
      libraryScope: 'full',
      favoriteBookIds: [],
      customPrompt: '',
      backendCapabilities: { supportsRatings: true },
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('accessToken', 'token-000');
    const { SettingsWidget } = await import('@/components/bookdate/SettingsWidget');

    render(<SettingsWidget isOpen={true} onClose={vi.fn()} />);

    const favoritesRadio = await screen.findByRole('radio', { name: /Pick my favorites/ });
    fireEvent.click(favoritesRadio);
    fireEvent.click(screen.getByRole('button', { name: /Save Preferences/ }));

    expect(await screen.findByText('Please select at least 1 favorite book')).toBeInTheDocument();
  });

  it('shows the library picker and includes the selection when saving', async () => {
    const fetchMock = routeFetch(
      {
        libraryScope: 'full',
        libraryId: '',
        favoriteBookIds: [],
        customPrompt: '',
        backendCapabilities: { supportsRatings: true },
      },
      {
        libraries: [
          { libraryId: 'de-lib', name: 'Hörbücher' },
          { libraryId: 'kids-lib', name: 'Kinder' },
        ],
      }
    );
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('accessToken', 'token-lib');
    const { SettingsWidget } = await import('@/components/bookdate/SettingsWidget');

    render(<SettingsWidget isOpen={true} onClose={vi.fn()} />);

    const select = await screen.findByLabelText('Recommend from');
    fireEvent.change(select, { target: { value: 'kids-lib' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));

    await waitFor(() => expect(putCall(fetchMock)).toBeTruthy());
    const body = JSON.parse(putCall(fetchMock)[1].body as string);
    expect(body.libraryId).toBe('kids-lib');
  });

  it('saves onboarding preferences and calls completion handlers', async () => {
    const fetchMock = routeFetch({
      libraryScope: 'full',
      favoriteBookIds: [],
      customPrompt: '',
      backendCapabilities: { supportsRatings: true },
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('accessToken', 'token-onboarding');
    const onClose = vi.fn();
    const onOnboardingComplete = vi.fn();
    const { SettingsWidget } = await import('@/components/bookdate/SettingsWidget');

    render(
      <SettingsWidget
        isOpen={true}
        onClose={onClose}
        isOnboarding={true}
        onOnboardingComplete={onOnboardingComplete}
      />
    );

    const letsGoButton = await screen.findByRole('button', { name: "Let's Go!" });
    vi.useFakeTimers();
    fireEvent.click(letsGoButton);

    await act(async () => {
      await Promise.resolve();
    });

    const call = putCall(fetchMock);
    expect(call).toBeTruthy();
    const requestBody = JSON.parse(call[1].body as string);
    expect(requestBody.onboardingComplete).toBe(true);
    expect(requestBody.customPrompt).toBeNull();
    expect(requestBody.libraryScope).toBe('full');

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(onOnboardingComplete).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('hides rated scope when backend does not support ratings', async () => {
    const fetchMock = routeFetch({
      libraryScope: 'full',
      favoriteBookIds: [],
      customPrompt: '',
      backendCapabilities: { supportsRatings: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('accessToken', 'token-no-ratings');
    const { SettingsWidget } = await import('@/components/bookdate/SettingsWidget');

    render(<SettingsWidget isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(screen.queryByRole('radio', { name: /Rated Books Only/ })).toBeNull();
  });

  it('shows an error when loading preferences fails', async () => {
    const fetchMock = routeFetch({}, { prefsOk: false });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('accessToken', 'token-fail');
    const { SettingsWidget } = await import('@/components/bookdate/SettingsWidget');

    render(<SettingsWidget isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText('Failed to load preferences')).toBeInTheDocument();
  });

  it('saves preferences and clears success message after delay', async () => {
    const fetchMock = routeFetch({
      libraryScope: 'full',
      favoriteBookIds: [],
      customPrompt: '',
      backendCapabilities: { supportsRatings: true },
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('accessToken', 'token-save');
    const { SettingsWidget } = await import('@/components/bookdate/SettingsWidget');

    render(<SettingsWidget isOpen={true} onClose={vi.fn()} />);

    const promptInput = await screen.findByLabelText(/Special Requests/);
    fireEvent.change(promptInput, { target: { value: '  trimmed  ' } });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));

    await act(async () => {
      await Promise.resolve();
    });

    const call = putCall(fetchMock);
    expect(call).toBeTruthy();
    const requestBody = JSON.parse(call[1].body as string);
    expect(requestBody.customPrompt).toBe('trimmed');
    expect(requestBody.onboardingComplete).toBeUndefined();

    expect(screen.getByText('Preferences saved successfully!')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('Preferences saved successfully!')).toBeNull();
    vi.useRealTimers();
  });
});
