import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';
import { UpsertHoldingDto } from './holding.dto';
import { HoldingService } from './holding.service';
import { ZodValidationPipe } from '../common/zod.pipe';

const UpdateHoldingDto = z.object({
  oldTicker: z.string().min(1),
  ticker: z.string().min(1),
  qty: z.string().min(1),
  avgCost: z.string().min(1),
  sectorId: z.string().uuid().nullable().optional(),
  sectorDomainId: z.string().uuid().nullable().optional(),
});

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

  /** Edit a holding's ticker, qty, or avg_cost. */
  @Post(':brokerId/update')
  @HttpCode(200)
  async updateHolding(
    @Req() req: { user?: { id: string } },
    @Param('brokerId') brokerId: string,
    @Body() body: unknown,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const parsed = UpdateHoldingDto.safeParse(body);
    if (!parsed.success) throw new UnauthorizedException(parsed.error.message);
    return this.svc.updateHolding(req.user.id, brokerId, parsed.data);
  }

  /** Add a new holding to a broker. */
  @Post(':brokerId/add')
  @HttpCode(201)
  async addHolding(
    @Req() req: { user?: { id: string } },
    @Param('brokerId') brokerId: string,
    @Body() body: unknown,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const dto = z.object({
      ticker: z.string().min(1),
      qty: z.string().min(1),
      avgCost: z.string().min(1),
      sectorId: z.string().uuid().optional(),
      sectorDomainId: z.string().uuid().optional(),
    }).safeParse(body);
    if (!dto.success) throw new UnauthorizedException(dto.error.message);
    return this.svc.addHolding(req.user.id, brokerId, dto.data);
  }

  /** Delete a holding from a broker. */
  @Post(':brokerId/delete')
  @HttpCode(200)
  async deleteHolding(
    @Req() req: { user?: { id: string } },
    @Param('brokerId') brokerId: string,
    @Body() body: unknown,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const dto = z.object({ ticker: z.string().min(1) }).safeParse(body);
    if (!dto.success) throw new UnauthorizedException(dto.error.message);
    return this.svc.deleteHolding(req.user.id, brokerId, dto.data.ticker);
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
