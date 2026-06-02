import { Controller, Get } from '@nestjs/common';
import { DbService } from '../common/db.service';
import {
  RedisHealth,
  RedisHealthService,
} from '../common/redis-health.service';

interface HealthzResponse {
  ok: boolean;          // overall — db reachable; redis is best-effort
  db: boolean;
  redis: RedisHealth;
  uptimeSec: number;
  latencyMs: number;
}

@Controller()
export class HealthController {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisHealthService,
  ) {}

  @Get('healthz')
  async healthz(): Promise<HealthzResponse> {
    const t0 = Date.now();
    let dbOk = false;
    try {
      await this.db.query('SELECT 1');
      dbOk = true;
    } catch { /* swallow — surface in response */ }

    // Refresh the Redis ping on demand so /healthz always reflects
    // the current state (lifecycle events can lag a few seconds).
    if (this.redis.getStatus().configured) {
      await this.redis.ping();
    }

    return {
      ok: dbOk,
      db: dbOk,
      redis: this.redis.getStatus(),
      uptimeSec: Math.round(process.uptime()),
      latencyMs: Date.now() - t0,
    };
  }
}
