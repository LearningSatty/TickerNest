import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Put,
  Req,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { UpsertHoldingDto } from './holding.dto';
import { HoldingService } from './holding.service';
import { ZodValidationPipe } from '../common/zod.pipe';

@Controller('holdings')
export class HoldingController {
  constructor(private readonly svc: HoldingService) {}

  /** Per-broker holdings list. */
  @Get(':brokerId')
  async listForBroker(
    @Req() req: { user?: { id: string } },
    @Param('brokerId') brokerId: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.listForBroker(req.user.id, brokerId);
  }

  /**
   * Idempotent UPSERT of a single holding. Decreasing qty automatically
   * snapshots a SoldShare row with cost_basis_at_sell = the OLD avg.
   *
   *   PUT /holdings/:brokerId/:ticker
   *   Idempotency-Key: <uuid>
   *   { qty, avgCost, soldPrice?, reason?, mistake? }
   */
  @Put(':brokerId/:ticker')
  @UsePipes(new ZodValidationPipe(UpsertHoldingDto))
  async upsert(
    @Req() req: { user?: { id: string } },
    @Headers('idempotency-key') idem: string | undefined,
    @Param('brokerId') brokerId: string,
    @Param('ticker') ticker: string,
    @Body() dto: UpsertHoldingDto,
  ) {
    if (!req.user) throw new UnauthorizedException();
    if (!idem)
      throw new UnauthorizedException('Idempotency-Key header is required');
    return this.svc.upsertIdempotent(
      req.user.id,
      idem,
      brokerId,
      ticker.toUpperCase(),
      dto,
    );
  }

  /** Explicit delete (== full exit, qty -> 0). Always records a SoldShare. */
  @Delete(':brokerId/:ticker')
  async remove(
    @Req() req: { user?: { id: string } },
    @Headers('idempotency-key') idem: string | undefined,
    @Param('brokerId') brokerId: string,
    @Param('ticker') ticker: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    if (!idem)
      throw new UnauthorizedException('Idempotency-Key header is required');
    return this.svc.fullExit(
      req.user.id,
      idem,
      brokerId,
      ticker.toUpperCase(),
    );
  }
}
