import { Injectable, NotFoundException } from '@nestjs/common';
import { D, toWire } from '@tickernest/common';
import { FundRepository, type FundRow } from './fund.repository';
import type { CreateFundInput, UpdateFundInput } from './fund.dto';

export interface FundView {
  id: string;
  schemeCode: string;
  fundName: string;
  amc: string | null;
  category: string | null;
  goal: string | null;
  units: string;
  avgNav: string;
  currentNav: string | null;
  invested: string;
  currentValue: string | null;
  pl: string | null;
  plPct: number | null;
}

@Injectable()
export class FundService {
  constructor(private readonly repo: FundRepository) {}

  async list(userId: string): Promise<FundView[]> {
    const rows = await this.repo.findAllByUser(userId);
    return rows.map((r) => this.toView(r));
  }

  async get(userId: string, id: string): Promise<FundView> {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new NotFoundException('Fund not found');
    return this.toView(row);
  }

  async create(userId: string, input: CreateFundInput): Promise<FundView> {
    const row = await this.repo.upsert(userId, input);
    return this.toView(row);
  }

  async update(userId: string, id: string, input: UpdateFundInput): Promise<FundView> {
    const row = await this.repo.update(userId, id, input);
    if (!row) throw new NotFoundException('Fund not found');
    return this.toView(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.delete(userId, id);
    if (!deleted) throw new NotFoundException('Fund not found');
  }

  private toView(row: FundRow): FundView {
    const units = D(row.units);
    const avgNav = D(row.avg_nav);
    const invested = units.mul(avgNav);
    const currentNav = row.current_nav ? D(row.current_nav) : null;
    const currentValue = currentNav ? units.mul(currentNav) : null;
    const pl = currentValue ? currentValue.sub(invested) : null;
    const plPct = pl && !invested.isZero() ? pl.div(invested).mul(100).toNumber() : null;

    return {
      id: row.id,
      schemeCode: row.scheme_code,
      fundName: row.fund_name,
      amc: row.amc,
      category: row.category,
      goal: row.goal,
      units: row.units,
      avgNav: row.avg_nav,
      currentNav: row.current_nav,
      invested: toWire(invested),
      currentValue: currentValue ? toWire(currentValue) : null,
      pl: pl ? toWire(pl) : null,
      plPct: plPct !== null ? Math.round(plPct * 100) / 100 : null,
    };
  }
}
