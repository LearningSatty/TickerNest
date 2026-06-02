/**
 * LISTEN portfolio_changed → debounce per user → REFRESH MV CONCURRENTLY
 *                                              → emit ws portfolio.changed.
 *
 * Lifecycle:
 *   onModuleInit  → checkout dedicated client, LISTEN, attach handler.
 *   onModuleDestroy → cancel all debouncers, UNLISTEN, release.
 *
 * Important: this client is OWNED by the listener and never returned to the
 * pool — Postgres notifications only arrive on the connection that LISTENed.
 */
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Notification } from 'pg';
import { PerKeyDebouncer } from './debouncer';
import { RealtimeGateway } from './realtime.gateway';

interface NotifyPayload {
  userId: string;
  ticker: string;
  brokerId: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
}

@Injectable()
export class PortfolioListener implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PortfolioListener.name);
  private client: Client | null = null;
  private readonly debouncer = new PerKeyDebouncer<string>({ delayMs: 250 });

  constructor(
    private readonly cfg: ConfigService,
    private readonly gateway: RealtimeGateway,
  ) {}

  async onModuleInit() {
    if (process.env['DISABLE_PG_LISTENER'] === '1') {
      this.log.warn('portfolio listener disabled via env');
      return;
    }
    this.client = new Client({
      connectionString: this.cfg.get<string>('DATABASE_URL'),
    });
    await this.client.connect();
    this.client.on('notification', (n: Notification) => this.handle(n));
    this.client.on('error', (e: Error) =>
      this.log.error('listener error', e.stack),
    );
    await this.client.query('LISTEN portfolio_changed');
    this.log.log('LISTEN portfolio_changed');
  }

  async onModuleDestroy() {
    this.debouncer.cancelAll();
    if (this.client) {
      try {
        await this.client.query('UNLISTEN portfolio_changed');
        await this.client.end();
      } catch (e) {
        this.log.warn(`unlisten failed: ${(e as Error).message}`);
      }
      this.client = null;
    }
  }

  private handle(n: Notification) {
    if (n.channel !== 'portfolio_changed' || !n.payload) return;
    let payload: NotifyPayload;
    try {
      payload = JSON.parse(n.payload) as NotifyPayload;
    } catch {
      this.log.warn(`bad payload: ${n.payload}`);
      return;
    }
    const userId = payload.userId;
    this.debouncer.schedule(userId, async () => {
      await this.refreshAndEmit(userId, payload);
    });
  }

  private async refreshAndEmit(userId: string, p: NotifyPayload) {
    if (!this.client) return;
    try {
      // CONCURRENT requires a UNIQUE index on the MV (we have idx_vhc_user_ticker).
      await this.client.query(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY v_holding_consolidated',
      );
    } catch (e) {
      this.log.error(`MV refresh failed: ${(e as Error).message}`);
      return;
    }
    this.gateway.emitToUser(userId, 'portfolio.changed', {
      tickers: [p.ticker],
      brokerIds: [p.brokerId],
    });
  }
}
