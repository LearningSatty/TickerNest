import { Injectable, NotFoundException } from '@nestjs/common';
import { D, toWire } from '@tickernest/common';
import { GoldRepository, type GoldRow } from './gold.repository';
import { SgbRepository, type SgbRow } from './sgb.repository';
import type { CreateGoldInput, UpdateGoldInput, CreateSgbInput, UpdateSgbInput } from './gold.dto';

export interface GoldView {
  id: string;
  type: string;
  weightGrams: string;
  purity: number;
  purchasePricePerGram: string;
  purchaseDate: string | null;
  storageLocation: string | null;
  notes: string | null;
  invested: string;
  currentValue: string | null;
}

export interface SgbView {
  id: string;
  seriesName: string;
  units: string;
  purchaseNav: string;
  purchaseDate: string;
  maturityDate: string;
  couponRate: string;
  broker: string | null;
  invested: string;
}

@Injectable()
export class GoldService {
  private currentRate24k: string | null = null;

  constructor(
    private readonly goldRepo: GoldRepository,
    private readonly sgbRepo: SgbRepository,
  ) {}

  setCurrentRate(rate24k: string) {
    this.currentRate24k = rate24k;
  }

  // --- Gold Holdings ---

  async listGold(userId: string): Promise<GoldView[]> {
    const rows = await this.goldRepo.findAllByUser(userId);
    return rows.map((r) => this.toGoldView(r));
  }

  async getGold(userId: string, id: string): Promise<GoldView> {
    const row = await this.goldRepo.findById(userId, id);
    if (!row) throw new NotFoundException('Gold holding not found');
    return this.toGoldView(row);
  }

  async createGold(userId: string, input: CreateGoldInput): Promise<GoldView> {
    const row = await this.goldRepo.create(userId, input);
    return this.toGoldView(row);
  }

  async updateGold(userId: string, id: string, input: UpdateGoldInput): Promise<GoldView> {
    const row = await this.goldRepo.update(userId, id, input);
    if (!row) throw new NotFoundException('Gold holding not found');
    return this.toGoldView(row);
  }

  async removeGold(userId: string, id: string): Promise<void> {
    const deleted = await this.goldRepo.delete(userId, id);
    if (!deleted) throw new NotFoundException('Gold holding not found');
  }

  private toGoldView(row: GoldRow): GoldView {
    const weight = D(row.weight_grams);
    const pricePerGram = D(row.purchase_price_per_gram);
    const invested = weight.mul(pricePerGram);

    let currentValue: string | null = null;
    if (this.currentRate24k) {
      const rate = D(this.currentRate24k);
      const purityFactor = D(row.purity).div(D(999));
      currentValue = toWire(weight.mul(rate).mul(purityFactor));
    }

    return {
      id: row.id,
      type: row.type,
      weightGrams: row.weight_grams,
      purity: row.purity,
      purchasePricePerGram: row.purchase_price_per_gram,
      purchaseDate: row.purchase_date,
      storageLocation: row.storage_location,
      notes: row.notes,
      invested: toWire(invested),
      currentValue,
    };
  }

  // --- SGB Holdings ---

  async listSgb(userId: string): Promise<SgbView[]> {
    const rows = await this.sgbRepo.findAllByUser(userId);
    return rows.map((r) => this.toSgbView(r));
  }

  async getSgb(userId: string, id: string): Promise<SgbView> {
    const row = await this.sgbRepo.findById(userId, id);
    if (!row) throw new NotFoundException('SGB holding not found');
    return this.toSgbView(row);
  }

  async createSgb(userId: string, input: CreateSgbInput): Promise<SgbView> {
    const row = await this.sgbRepo.create(userId, input);
    return this.toSgbView(row);
  }

  async updateSgb(userId: string, id: string, input: UpdateSgbInput): Promise<SgbView> {
    const row = await this.sgbRepo.update(userId, id, input);
    if (!row) throw new NotFoundException('SGB holding not found');
    return this.toSgbView(row);
  }

  async removeSgb(userId: string, id: string): Promise<void> {
    const deleted = await this.sgbRepo.delete(userId, id);
    if (!deleted) throw new NotFoundException('SGB holding not found');
  }

  private toSgbView(row: SgbRow): SgbView {
    const units = D(row.units);
    const nav = D(row.purchase_nav);
    const invested = units.mul(nav);

    return {
      id: row.id,
      seriesName: row.series_name,
      units: row.units,
      purchaseNav: row.purchase_nav,
      purchaseDate: row.purchase_date,
      maturityDate: row.maturity_date,
      couponRate: row.coupon_rate,
      broker: row.broker,
      invested: toWire(invested),
    };
  }
}
