/**
 * Component: Audiobooks Fetching Hook
 * Documentation: documentation/frontend/components.md
 */

'use client';

import { useRef, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { authenticatedFetcher } from '@/lib/utils/api';

export interface Audiobook {
  asin: string;
  title: string;
  author: string;
  authorAsin?: string;
  narrator?: string;
  description?: string;
  coverArtUrl?: string;
  durationMinutes?: number;
  releaseDate?: string;
  rating?: number;
  genres?: string[];
  series?: string;         // Series name (e.g., "A Song of Ice and Fire")
  seriesPart?: string;     // Position in series (e.g., "1", "1.5")
  seriesAsin?: string;     // Audible ASIN for the series (links to /series/{asin})
  isAvailable?: boolean;  // Set by real-time matching against plex_library
  plexGuid?: string | null;
  dbId?: string | null;
  isRequested?: boolean;  // Set if ANY user has requested this audiobook
  requestStatus?: string | null;  // Status of request (if any)
  requestId?: string | null;  // ID of request (if any)
  requestedByUserId?: string | null;  // User id who requested (populated by audiobook-matcher; used to gate own-request interactive-search routing)
  requestedByUsername?: string | null;  // Username who requested (only if not current user)
  hasReportedIssue?: boolean;  // True if an open issue exists for this audiobook
  isIgnored?: boolean;  // True if this user has ignored this audiobook from auto-requests
  language?: string;
  formatType?: string;
  publisherName?: string;
  region?: string;  // Audible region the ASIN was found in (ASINs are store-specific)
}

export function useAudiobooks(type: 'popular' | 'new-releases', limit: number = 20, page: number = 1, hideAvailable: boolean = false) {
  const hideParam = hideAvailable ? '&hideAvailable=true' : '';
  const endpoint =
    type === 'popular'
      ? `/api/audiobooks/popular?page=${page}&limit=${limit}${hideParam}`
      : `/api/audiobooks/new-releases?page=${page}&limit=${limit}${hideParam}`;

  const { data, error, isLoading } = useSWR(endpoint, authenticatedFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000, // Cache for 1 minute
  });

  return {
    audiobooks: data?.audiobooks || [],
    totalCount: data?.totalCount || 0,
    totalPages: data?.totalPages || 0,
    currentPage: data?.page || page,
    hasMore: data?.hasMore || false,
    message: data?.message || null,
    isLoading,
    error,
  };
}

function dedupeByAsin<T extends { asin: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.asin)) return false;
    seen.add(item.asin);
    return true;
  });
}

/**
 * Search scope: a shelf (its store set) or one explicit region. Region wins
 * when both are given, mirroring the API.
 */
export interface SearchScope {
  shelf?: string;
  region?: string;
}

export function useSearch(query: string, scope: SearchScope | string = {}) {
  const normalizedScope: SearchScope = typeof scope === 'string' ? { region: scope } : scope;
  const scopeParam = normalizedScope.region
    ? `&region=${encodeURIComponent(normalizedScope.region)}`
    : normalizedScope.shelf
      ? `&shelf=${encodeURIComponent(normalizedScope.shelf)}`
      : '';
  const prevQueryRef = useRef(query);
  const prevRegionRef = useRef(scopeParam);
  const regionParam = scopeParam;

  const { data, error, size, setSize, isLoading, isValidating } = useSWRInfinite(
    (pageIndex, prevPageData) => {
      if (!query || query.length === 0) return null;
      if (pageIndex === 0) return `/api/audiobooks/search?q=${encodeURIComponent(query)}&page=1${regionParam}`;
      if (!prevPageData?.hasMore) return null;
      return `/api/audiobooks/search?q=${encodeURIComponent(query)}&page=${pageIndex + 1}${regionParam}`;
    },
    authenticatedFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
      revalidateFirstPage: false,
    }
  );

  // Reset to page 1 when query or scope changes
  useEffect(() => {
    if (query !== prevQueryRef.current || scopeParam !== prevRegionRef.current) {
      prevQueryRef.current = query;
      prevRegionRef.current = scopeParam;
      setSize(1);
    }
  }, [query, scopeParam, setSize]);

  const results = data ? dedupeByAsin(data.flatMap(page => page?.results || [])) : [];
  const totalResults = data?.[0]?.totalResults || 0;
  const hasMore = !!(data && data.length > 0 && data[data.length - 1]?.hasMore);
  const isLoadingInitial = !data && !error && !!query;
  const isLoadingMore = !!(data && typeof data[size - 1] === 'undefined' && isValidating);

  const loadMore = useCallback(() => {
    setSize(prev => prev + 1);
  }, [setSize]);

  return {
    results,
    totalResults,
    hasMore,
    isLoading: isLoadingInitial,
    isLoadingMore,
    loadMore,
    error,
  };
}

export function useAudiobookDetails(asin: string | null, region?: string) {
  const regionParam = region ? `?region=${encodeURIComponent(region)}` : '';
  const endpoint = asin ? `/api/audiobooks/${asin}${regionParam}` : null;

  const { data, error, isLoading } = useSWR(endpoint, authenticatedFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000, // Cache for 5 minutes
    errorRetryCount: 2, // Transient upstream (Audnexus/Audible) misses: retry briefly, not for 5 min
  });

  return {
    audiobook: data?.audiobook || null,
    audibleBaseUrl: data?.audibleBaseUrl || 'https://www.audible.com',
    isLoading,
    error,
  };
}

export interface ShelfSummary {
  libraryId: string;
  label: string;
  language: string;
  audience: string;
  regions: string[];
  isPrimary: boolean;
}

/** Configured shelves with display labels (GET /api/shelves). */
export function useShelves() {
  const { data, error, isLoading } = useSWR('/api/shelves', authenticatedFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
  });
  return {
    shelves: (data?.shelves || []) as ShelfSummary[],
    isLoading,
    error,
  };
}
