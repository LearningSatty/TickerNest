import { Injectable, Logger } from '@nestjs/common';
import { D } from '../common/types/money';
import { HoldingRepository } from './holding.repository';
import { UpsertHoldingDto } from './holding.dto';

@Injectable()
export class HoldingService {
  private readonly log = new Logger(HoldingService.name);
  constructor(private readonly repo: HoldingRepository) {}

  async listForBroker(userId: string, brokerId: string) {
    return this.repo.listForBroker(userId, brokerId);
  }

  async upsertIdempotent(
    userId: string,
    idempotencyKey: string,
    brokerId: string,
    ticker: string,
    dto: UpsertHoldingDto,
  ) {
    return this.repo.upsert(
      userId,
      idempotencyKey,
      brokerId,
      ticker,
      { qty: D(dto.qty), avgCost: D(dto.avgCost) },
      {
        ...(dto.soldPrice !== undefined && { soldPrice: D(dto.soldPrice) }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(dto.mistake !== undefined && { mistake: dto.mistake }),
      },
    );
  }

  /**
   * Full-exit endpoint: qty → 0, avg_cost preserved on the row.
   * Always emits a sold_share for the prior qty.
   */
  async fullExit(
    userId: string,
    idempotencyKey: string,
    brokerId: string,
    ticker: string,
  ) {
    return this.repo.upsert(
      userId,
      idempotencyKey,
      brokerId,
      ticker,
      { qty: D(0), avgCost: D(0) }, // avg ignored; planner reads OLD avg from current
    );
  }
}
