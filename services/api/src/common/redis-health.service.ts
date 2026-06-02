/**
 * RedisHealthService — single source of truth for Redis connectivity.
 *
 *   ✓ Validates REDIS_URL at boot.
 *   ✓ PINGs the server, logs the result with latency.
 *   ✓ Subscribes to ioredis lifecycle events so transient drops show up
 *     in the API logs instead of failing silently.
 *   ✓ Exposes a `status` snapshot for /healthz.
 *
 * Other services keep their own Redis clients (BullMQ + cache pipelines need
 * separate connections per ioredis docs) — this one is purely a health probe.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RedisHealth {
  configured: boolean;        // REDIS_URL is set
  ok: boolean;                // last PING succeeded
  pingMs: number | null;      // round-trip time of last PING
  state: 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'error' | 'end';
  lastError: string | null;
  endpoint: string | null;    // host:port (no credentials)
}

@Injectable()
export class RedisHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RedisHealthService.name);
  private client: Redis | null = null;
  private health: RedisHealth = {
    configured: false,
    ok: false,
    pingMs: null,
    state: 'idle',
    lastError: null,
    endpoint: null,
  };

  constructor(private readonly cfg: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.cfg.get<string>('REDIS_URL');
    if (!url) {
      this.log.warn(
        '─── Redis NOT configured ───────────────────────────────────',
      );
      this.log.warn(
        'REDIS_URL is unset — quote cache, poller, daily enricher,',
      );
      this.log.warn(
        'search/news/chart caches are ALL disabled.',
      );
      this.log.warn(
        'See README/DEPLOY for setup (Upstash free tier, Docker, brew).',
      );
      this.log.warn(
        '────────────────────────────────────────────────────────────',
      );
      return;
    }

    // Strip credentials before storing the endpoint for /healthz.
    let endpoint: string | null = null;
    try {
      const u = new URL(url);
      endpoint = `${u.hostname}:${u.port || '6379'}`;
    } catch {
      endpoint = '<invalid REDIS_URL>';
    }
    this.health.configured = true;
    this.health.endpoint = endpoint;
    this.health.state = 'connecting';

    this.log.log(`Connecting to Redis at ${endpoint}…`);

    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        connectTimeout: 5_000,
        lazyConnect: false,
      });
    } catch (e) {
      this.health.state = 'error';
      this.health.lastError = (e as Error).message;
      this.log.error(`Redis client construction failed: ${this.health.lastError}`);
      return;
    }

    this.client.on('ready', () => {
      this.health.state = 'ready';
      this.health.lastError = null;
    });
    this.client.on('reconnecting', () => {
      this.health.state = 'reconnecting';
      this.log.warn(`Redis ${endpoint}: reconnecting…`);
    });
    this.client.on('error', (e) => {
      this.health.state = 'error';
      this.health.lastError = e.message;
      // Avoid log spam — only log once per distinct error message.
      if (e.message !== this.lastLoggedError) {
        this.log.error(`Redis error: ${e.message}`);
        this.lastLoggedError = e.message;
      }
    });
    this.client.on('end', () => {
      this.health.state = 'end';
    });

    // Initial ping with timeout protection — don't block boot indefinitely
    // if Upstash/EC2 is unreachable.
    const pingResult = await this.ping();
    if (pingResult.ok) {
      this.log.log(
        `✓ Redis ready  (endpoint=${endpoint}, ping=${pingResult.ms}ms)`,
      );
    } else {
      this.log.error(
        `✗ Redis PING failed  (endpoint=${endpoint}, error=${pingResult.error})`,
      );
      this.log.warn(
        'Verify REDIS_URL credentials, network reachability, and that the',
      );
      this.log.warn(
        'service is running. The app will continue but caches stay cold.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client?.disconnect();
  }

  private lastLoggedError: string | null = null;

  /** PING with a 3s hard timeout. Updates `health` in-place. */
  async ping(): Promise<{ ok: boolean; ms: number | null; error?: string }> {
    if (!this.client) {
      return { ok: false, ms: null, error: 'not configured' };
    }
    const t0 = Date.now();
    try {
      const result = await Promise.race<string | null>([
        this.client.ping(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (result !== 'PONG') {
        const err = result === null ? 'timeout (3s)' : `unexpected: ${result}`;
        this.health.ok = false;
        this.health.pingMs = null;
        this.health.lastError = err;
        return { ok: false, ms: null, error: err };
      }
      const ms = Date.now() - t0;
      this.health.ok = true;
      this.health.pingMs = ms;
      this.health.lastError = null;
      return { ok: true, ms };
    } catch (e) {
      const err = (e as Error).message;
      this.health.ok = false;
      this.health.pingMs = null;
      this.health.lastError = err;
      return { ok: false, ms: null, error: err };
    }
  }

  /** Snapshot for /healthz. Cheap — no I/O. */
  getStatus(): RedisHealth {
    return { ...this.health };
  }
}
