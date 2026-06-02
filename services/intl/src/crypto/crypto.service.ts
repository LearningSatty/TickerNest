import { Injectable, NotFoundException } from '@nestjs/common';
import { D, toWire } from '@tickernest/common';
import { CryptoRepository, type CryptoHoldingRow } from './crypto.repository';
import type { CreateCryptoInput, UpdateCryptoInput } from './crypto.dto';

export interface CryptoHoldingView {
  id: string;
  coin: string;
  name: string | null;
  qty: string;
  avgCostInr: string;
  platform: string | null;
  investedInr: string;
}

@Injectable()
export class CryptoService {
  constructor(private readonly repo: CryptoRepository) {}

  async list(userId: string): Promise<CryptoHoldingView[]> {
    const rows = await this.repo.findAllByUser(userId);
    return rows.map((r) => this.toView(r));
  }

  async get(userId: string, id: string): Promise<CryptoHoldingView> {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new NotFoundException('Crypto holding not found');
    return this.toView(row);
  }

  async create(userId: string, input: CreateCryptoInput): Promise<CryptoHoldingView> {
    const row = await this.repo.create(userId, input);
    return this.toView(row);
  }

  async update(userId: string, id: string, input: UpdateCryptoInput): Promise<CryptoHoldingView> {
    const row = await this.repo.update(userId, id, input);
    if (!row) throw new NotFoundException('Crypto holding not found');
    return this.toView(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.delete(userId, id);
    if (!deleted) throw new NotFoundException('Crypto holding not found');
  }

  private toView(row: CryptoHoldingRow): CryptoHoldingView {
    const qty = D(row.qty);
    const avgCostInr = D(row.avg_cost_inr);
    const investedInr = qty.mul(avgCostInr);

    return {
      id: row.id,
      coin: row.coin,
      name: row.name,
      qty: row.qty,
      avgCostInr: row.avg_cost_inr,
      platform: row.platform,
      investedInr: toWire(investedInr),
    };
  }
}
