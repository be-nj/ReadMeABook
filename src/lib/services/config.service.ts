/**
 * Component: Configuration Service
 * Documentation: documentation/backend/services/config.md
 */

import { prisma } from '@/lib/db';
import { getEncryptionService } from './encryption.service';
import { RMABLogger } from '@/lib/utils/logger';
import { AudibleRegion, DEFAULT_AUDIBLE_REGION } from '@/lib/types/audible';

const logger = RMABLogger.create('Config');

/**
 * Configuration update payload
 */
export interface ConfigUpdate {
  key: string;
  value: string;
  encrypted?: boolean;
  category?: string;
  description?: string;
}

/**
 * Plex configuration structure
 */
export interface PlexConfig {
  serverUrl: string | null;
  authToken: string | null;
  libraryId: string | null;
  machineIdentifier: string | null;
}

/**
 * Age-appropriateness tier for a shelf. Ordered: kids < teen < adult.
 */
export type ShelfAudience = 'kids' | 'teen' | 'adult';

/**
 * A Shelf is a request destination + owned-source: one Audiobookshelf library
 * plus the routing axes (language, audience), the Audible region used to search
 * its language, and the filesystem path (RMAB's view) organised audiobooks are
 * written to.
 */
export interface Shelf {
  libraryId: string;
  language: string;
  audience: ShelfAudience;
  region: string;
  mediaPath: string;
  isPrimary?: boolean;
}

/**
 * Configuration service for reading settings from database
 */
export class ConfigurationService {
  private cache: Map<string, string> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute

  /**
   * Get a configuration value by key (decrypted if encrypted)
   */
  async get(key: string): Promise<string | null> {
    // Check cache first
    const cached = this.cache.get(key);
    const expiry = this.cacheExpiry.get(key);

    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    // Fetch from database
    try {
      const config = await prisma.configuration.findUnique({
        where: { key },
      });

      if (config && config.value) {
        let value = config.value;

        // Decrypt if encrypted
        if (config.encrypted) {
          const encryptionService = getEncryptionService();
          value = encryptionService.decrypt(config.value);
        }

        // Cache the decrypted value
        this.cache.set(key, value);
        this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
        return value;
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get config key "${key}"`, { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Get multiple configuration values
   */
  async getMany(keys: string[]): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};

    await Promise.all(
      keys.map(async (key) => {
        result[key] = await this.get(key);
      })
    );

    return result;
  }

  /**
   * Get all configuration items for a specific category
   */
  async getCategory(category: string): Promise<Record<string, any>> {
    try {
      const configs = await prisma.configuration.findMany({
        where: { category },
      });

      const result: Record<string, any> = {};

      for (const config of configs) {
        let value = config.value;

        // Decrypt if encrypted
        if (config.encrypted && value) {
          const encryptionService = getEncryptionService();
          value = encryptionService.decrypt(value);
        }

        result[config.key] = {
          value,
          encrypted: config.encrypted,
          description: config.description,
        };
      }

      return result;
    } catch (error) {
      logger.error(`Failed to get category "${category}"`, { error: error instanceof Error ? error.message : String(error) });
      return {};
    }
  }

  /**
   * Get all configuration items (with masked sensitive values)
   */
  async getAll(): Promise<Record<string, any>> {
    try {
      const configs = await prisma.configuration.findMany();

      const result: Record<string, any> = {};

      for (const config of configs) {
        result[config.key] = {
          value: config.encrypted ? '***ENCRYPTED***' : config.value,
          encrypted: config.encrypted,
          category: config.category,
          description: config.description,
        };
      }

      return result;
    } catch (error) {
      logger.error('Failed to get all configuration', { error: error instanceof Error ? error.message : String(error) });
      return {};
    }
  }

  /**
   * Set multiple configuration values (encrypts if needed)
   */
  async setMany(updates: ConfigUpdate[]): Promise<void> {
    try {
      const encryptionService = getEncryptionService();

      for (const update of updates) {
        let value = update.value;

        // Encrypt if needed
        if (update.encrypted) {
          value = encryptionService.encrypt(value);
        }

        // Upsert configuration
        await prisma.configuration.upsert({
          where: { key: update.key },
          create: {
            key: update.key,
            value,
            encrypted: update.encrypted || false,
            category: update.category,
            description: update.description,
          },
          update: {
            value,
            encrypted: update.encrypted || false,
            category: update.category,
            description: update.description,
          },
        });

        // Clear cache for this key
        this.clearCache(update.key);
      }
    } catch (error) {
      logger.error('Failed to set configuration', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get Plex-specific configuration
   */
  async getPlexConfig(): Promise<PlexConfig> {
    const config = await this.getMany([
      'plex_url',
      'plex_token',
      'plex_audiobook_library_id',
      'plex_machine_identifier',
    ]);

    return {
      serverUrl: config.plex_url,
      authToken: config.plex_token,
      libraryId: config.plex_audiobook_library_id,
      machineIdentifier: config.plex_machine_identifier || null,
    };
  }

  /**
   * Get backend mode (Plex or Audiobookshelf)
   */
  async getBackendMode(): Promise<'plex' | 'audiobookshelf'> {
    const mode = await this.get('system.backend_mode');
    return (mode as 'plex' | 'audiobookshelf') || 'plex';
  }

  /**
   * Check if Audiobookshelf mode is enabled
   */
  async isAudiobookshelfMode(): Promise<boolean> {
    return (await this.getBackendMode()) === 'audiobookshelf';
  }

  /**
   * Get the configured shelves — the multi-library destinations RMAB syncs/owns
   * and routes requests into.
   *
   * Prefers `audiobookshelf.shelves` (JSON array). Falls back to the legacy
   * single-library config (library_ids / library_id, each inheriting the global
   * Audible region and media_dir) as one shelf per library, so existing installs
   * keep working with no migration. Returns [] if nothing is configured.
   */
  async getShelves(): Promise<Shelf[]> {
    const shelvesRaw = await this.get('audiobookshelf.shelves');
    if (shelvesRaw) {
      try {
        const parsed = JSON.parse(shelvesRaw);
        if (Array.isArray(parsed)) {
          const shelves = parsed
            .map((s) => this.normalizeShelf(s))
            .filter((s): s is Shelf => s !== null);
          if (shelves.length > 0) return shelves;
        }
      } catch {
        // Malformed value — fall back to legacy derivation below.
      }
    }

    // Back-compat: one shelf per legacy library id, inheriting the global region
    // and media_dir. Language/audience are unknown for legacy single-library
    // installs (audience defaults to adult); routing over a single shelf is trivial.
    const legacyIds = await this.getLegacyLibraryIds();
    if (legacyIds.length === 0) return [];
    const region = await this.getAudibleRegion();
    const mediaPath = (await this.get('media_dir')) || '';
    return legacyIds.map((libraryId, i) => ({
      libraryId,
      language: '',
      audience: 'adult' as ShelfAudience,
      region,
      mediaPath,
      isPrimary: i === 0,
    }));
  }

  private normalizeShelf(raw: unknown): Shelf | null {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    const libraryId = typeof s.libraryId === 'string' ? s.libraryId : '';
    if (!libraryId) return null;
    const aud = s.audience;
    const audience: ShelfAudience = aud === 'kids' || aud === 'teen' || aud === 'adult' ? aud : 'adult';
    return {
      libraryId,
      language: typeof s.language === 'string' ? s.language : '',
      audience,
      region: typeof s.region === 'string' ? s.region : '',
      mediaPath: typeof s.mediaPath === 'string' ? s.mediaPath : '',
      isPrimary: s.isPrimary === true,
    };
  }

  /** Raw legacy library id list: `library_ids` (JSON), falling back to `library_id`. */
  private async getLegacyLibraryIds(): Promise<string[]> {
    const listRaw = await this.get('audiobookshelf.library_ids');
    if (listRaw) {
      try {
        const parsed = JSON.parse(listRaw);
        if (Array.isArray(parsed)) {
          const ids = parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
          if (ids.length > 0) return ids;
        }
      } catch {
        // Malformed list value — fall back to the legacy single id below.
      }
    }
    const legacy = await this.get('audiobookshelf.library_id');
    return legacy ? [legacy] : [];
  }

  /**
   * Get the configured Audiobookshelf library IDs (the libraries to sync/own),
   * derived from the configured shelves.
   */
  async getAudiobookshelfLibraryIds(): Promise<string[]> {
    return (await this.getShelves()).map((s) => s.libraryId);
  }

  /**
   * Get configured Audible region
   */
  async getAudibleRegion(): Promise<AudibleRegion> {
    const region = await this.get('audible.region');
    return (region as AudibleRegion) || DEFAULT_AUDIBLE_REGION;
  }

  /**
   * Clear the cache for a specific key or all keys
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
    }
  }
}

// Singleton instance
let configService: ConfigurationService | null = null;

export function getConfigService(): ConfigurationService {
  if (!configService) {
    configService = new ConfigurationService();
  }
  return configService;
}
