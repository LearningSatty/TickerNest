import { Injectable, NotFoundException } from '@nestjs/common';
import { D, toWire, DbService } from '@tickernest/common';
import { UsRepository, type UsHoldingRow } from './us.repository';
import type { CreateUsHoldingInput, UpdateUsHoldingInput } from './us.dto';

export interface UsHoldingView {
  id: string;
  ticker: string;
  name: string | null;
  sector: string | null;
  qty: string;
  avgCostUsd: string;
  lotKind: string;
  brokerName: string | null;
  investedUsd: string;
  investedInr: string | null;
  fxRate: string | null;
}

@Injectable()
export class UsService {
  constructor(
    private readonly repo: UsRepository,
    private readonly db: DbService,
  ) {}

  async list(userId: string): Promise<UsHoldingView[]> {
    const rows = await this.repo.findAllByUser(userId);
    const fxRate = await this.getLatestUsdInr();
    return rows.map((r) => this.toView(r, fxRate));
  }

  async get(userId: string, id: string): Promise<UsHoldingView> {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new NotFoundException('US holding not found');
    const fxRate = await this.getLatestUsdInr();
    return this.toView(row, fxRate);
  }

  async create(userId: string, input: CreateUsHoldingInput): Promise<UsHoldingView> {
    const row = await this.repo.create(userId, input);
    const fxRate = await this.getLatestUsdInr();
    return this.toView(row, fxRate);
  }

  async update(userId: string, id: string, input: UpdateUsHoldingInput): Promise<UsHoldingView> {
    const row = await this.repo.update(userId, id, input);
    if (!row) throw new NotFoundException('US holding not found');
    const fxRate = await this.getLatestUsdInr();
    return this.toView(row, fxRate);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.delete(userId, id);
    if (!deleted) throw new NotFoundException('US holding not found');
  }

  async getLatestUsdInr(): Promise<string | null> {
    const { rows } = await this.db.query<{ rate: string }>(
      `SELECT rate FROM fx_rate WHERE pair = 'USD/INR' ORDER BY date DESC LIMIT 1`,
    );
    return rows[0]?.rate ?? null;
  }

  private toView(row: UsHoldingRow, fxRate: string | null): UsHoldingView {
    const qty = D(row.qty);
    const avgCostUsd = D(row.avg_cost_usd);
    const investedUsd = qty.mul(avgCostUsd);
    const investedInr = fxRate ? investedUsd.mul(D(fxRate)) : null;

    return {
      id: row.id,
      ticker: row.ticker,
      name: row.name,
      sector: row.sector,
      qty: row.qty,
      avgCostUsd: row.avg_cost_usd,
      lotKind: row.lot_kind,
      brokerName: row.broker_name,
      investedUsd: toWire(investedUsd),
      investedInr: investedInr ? toWire(investedInr) : null,
      fxRate,
    };
  }
}
