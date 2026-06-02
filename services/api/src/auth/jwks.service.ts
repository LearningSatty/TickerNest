/**
 * JWKS resolver — fetches Supabase's project signing keys from
 *   {SUPABASE_URL}/auth/v1/.well-known/jwks.json
 * and caches them in memory with a TTL. Refreshes on cache miss for an
 * unknown `kid` so key rotation is picked up without a server restart.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Jwk } from './jwt';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const REFRESH_COOLDOWN_MS = 30 * 1000; // don't hammer JWKS on miss-storms

interface CacheEntry {
  fetchedAt: number;
  keys: Map<string, Jwk>;
}

@Injectable()
export class JwksService {
  private readonly log = new Logger(JwksService.name);
  private readonly url: string | null;
  private cache: CacheEntry | null = null;
  private lastRefreshAttempt = 0;

  constructor(cfg: ConfigService) {
    const supaUrl = cfg.get<string>('SUPABASE_URL');
    this.url = supaUrl ? `${supaUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json` : null;
    if (!this.url) {
      this.log.warn('SUPABASE_URL not set; ES256 verification will fail');
    }
  }

  /** Bound resolver suitable for passing to verifyJwtAsync. */
  readonly resolve = async (kid: string): Promise<Jwk | null> => {
    let entry = this.cache;
    const now = Date.now();
    const stale = !entry || now - entry.fetchedAt > CACHE_TTL_MS;
    const missingKid = entry && !entry.keys.has(kid);

    if (stale || missingKid) {
      // Throttle refreshes after a recent attempt.
      if (now - this.lastRefreshAttempt > REFRESH_COOLDOWN_MS) {
        this.lastRefreshAttempt = now;
        try {
          entry = await this.fetchJwks();
          this.cache = entry;
        } catch (e) {
          this.log.warn(`JWKS fetch failed: ${(e as Error).message}`);
        }
      }
    }
    return entry?.keys.get(kid) ?? null;
  };

  private async fetchJwks(): Promise<CacheEntry> {
    if (!this.url) throw new Error('SUPABASE_URL not configured');
    const res = await fetch(this.url);
    if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
    const body = (await res.json()) as { keys: Jwk[] };
    const keys = new Map<string, Jwk>();
    for (const k of body.keys ?? []) {
      if (k.kid) keys.set(k.kid, k);
    }
    this.log.log(`Loaded ${keys.size} signing key(s) from JWKS`);
    return { fetchedAt: Date.now(), keys };
  }
}
