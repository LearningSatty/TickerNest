import { Injectable, NotFoundException } from '@nestjs/common';
import { D, toWire } from '@tickernest/common';
import { AssetsRepository, type AssetRow, type EventRow } from './assets.repository';
import type { CreateAssetInput, UpdateAssetInput, CreateEventInput } from './assets.dto';

export interface AssetView {
  id: string;
  type: string;
  name: string;
  institution: string | null;
  invested: string;
  currentValue: string;
  interestRate: string | null;
  maturityDate: string | null;
  nominee: string | null;
  notes: string | null;
}

export interface EventView {
  id: string;
  assetId: string;
  type: string;
  amount: string;
  eventDate: string;
  notes: string | null;
}

@Injectable()
export class AssetsService {
  constructor(private readonly repo: AssetsRepository) {}

  async list(userId: string): Promise<AssetView[]> {
    const rows = await this.repo.findAllByUser(userId);
    return rows.map((r) => this.toView(r));
  }

  async get(userId: string, id: string): Promise<AssetView> {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new NotFoundException('Asset not found');
    return this.toView(row);
  }

  async create(userId: string, input: CreateAssetInput): Promise<AssetView> {
    const row = await this.repo.create(userId, input);
    return this.toView(row);
  }

  async update(userId: string, id: string, input: UpdateAssetInput): Promise<AssetView> {
    const row = await this.repo.update(userId, id, input);
    if (!row) throw new NotFoundException('Asset not found');
    return this.toView(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.delete(userId, id);
    if (!deleted) throw new NotFoundException('Asset not found');
  }

  async addEvent(userId: string, assetId: string, input: CreateEventInput): Promise<EventView> {
    const asset = await this.repo.findById(userId, assetId);
    if (!asset) throw new NotFoundException('Asset not found');

    const event = await this.repo.createEvent(userId, assetId, input);

    const amount = D(input.amount);
    let invested = D(asset.invested);
    let currentValue = D(asset.current_value);

    switch (input.type) {
      case 'DEPOSIT':
        currentValue = currentValue.add(amount);
        break;
      case 'WITHDRAWAL':
        currentValue = currentValue.sub(amount);
        break;
      case 'INTEREST':
        currentValue = currentValue.add(amount);
        break;
      case 'PREMIUM':
        invested = invested.add(amount);
        break;
      case 'MATURITY':
        // Informational only, no auto-update
        break;
    }

    await this.repo.updateValues(userId, assetId, toWire(invested), toWire(currentValue));

    return this.toEventView(event);
  }

  async listEvents(userId: string, assetId: string): Promise<EventView[]> {
    const asset = await this.repo.findById(userId, assetId);
    if (!asset) throw new NotFoundException('Asset not found');

    const events = await this.repo.findEventsByAsset(userId, assetId);
    return events.map((e) => this.toEventView(e));
  }

  private toView(row: AssetRow): AssetView {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      institution: row.institution,
      invested: row.invested,
      currentValue: row.current_value,
      interestRate: row.interest_rate,
      maturityDate: row.maturity_date,
      nominee: row.nominee,
      notes: row.notes,
    };
  }

  private toEventView(row: EventRow): EventView {
    return {
      id: row.id,
      assetId: row.asset_id,
      type: row.type,
      amount: row.amount,
      eventDate: row.event_date,
      notes: row.notes,
    };
  }
}
