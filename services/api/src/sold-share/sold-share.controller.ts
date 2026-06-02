import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe';
import { DbService } from '../common/db.service';

const NumStr = z.string().regex(/^-?\d+(\.\d+)?$/);
const PatchDto = z.object({
  soldPrice: NumStr.optional(),
  reason: z.string().max(500).optional(),
  mistake: z.string().max(500).optional(),
});

interface SoldShareRow {
  id: string;
  broker_id: string;
  ticker: string;
  qty: string;
  cost_basis_at_sell: string;
  sold_price: string | null;
  reason: string | null;
  mistake: string | null;
  sold_at: Date;
}

@Controller('sold-shares')
export class SoldShareController {
  constructor(private readonly db: DbService) {}

  @Get()
  async list(@Req() req: { user?: { id: string } }) {
    if (!req.user) throw new UnauthorizedException();
    return this.db.withUserTx(req.user.id, async (tx) => {
      const r = await tx.query<SoldShareRow>(
        `SELECT id, broker_id, ticker,
                qty::text AS qty,
                cost_basis_at_sell::text AS cost_basis_at_sell,
                sold_price::text AS sold_price,
                reason, mistake, sold_at
           FROM sold_share
          WHERE user_id = $1
          ORDER BY sold_at DESC`,
        [req.user!.id],
      );
      return r.rows.map(toApi);
    });
  }

  @Patch(':id')
  async update(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PatchDto)) dto: z.infer<typeof PatchDto>,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.db.withUserTx(req.user.id, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [req.user!.id, id];
      let i = 3;
      if (dto.soldPrice !== undefined) { fields.push(`sold_price = $${i++}`); params.push(dto.soldPrice); }
      if (dto.reason !== undefined)    { fields.push(`reason = $${i++}`); params.push(dto.reason); }
      if (dto.mistake !== undefined)   { fields.push(`mistake = $${i++}`); params.push(dto.mistake); }
      if (fields.length === 0) {
        const r = await tx.query<SoldShareRow>(
          `SELECT id, broker_id, ticker,
                  qty::text AS qty,
                  cost_basis_at_sell::text AS cost_basis_at_sell,
                  sold_price::text AS sold_price,
                  reason, mistake, sold_at
             FROM sold_share WHERE user_id = $1 AND id = $2`,
          [req.user!.id, id],
        );
        if (r.rowCount === 0) throw new NotFoundException();
        return toApi(r.rows[0]!);
      }
      const r = await tx.query<SoldShareRow>(
        `UPDATE sold_share SET ${fields.join(', ')}
          WHERE user_id = $1 AND id = $2
       RETURNING id, broker_id, ticker,
                 qty::text AS qty,
                 cost_basis_at_sell::text AS cost_basis_at_sell,
                 sold_price::text AS sold_price,
                 reason, mistake, sold_at`,
        params,
      );
      if (r.rowCount === 0) throw new NotFoundException();
      return toApi(r.rows[0]!);
    });
  }
}

function toApi(r: SoldShareRow) {
  return {
    id: r.id,
    brokerId: r.broker_id,
    ticker: r.ticker,
    qty: r.qty,
    costBasisAtSell: r.cost_basis_at_sell,
    soldPrice: r.sold_price,
    reason: r.reason,
    mistake: r.mistake,
    soldAt: r.sold_at.toISOString(),
  };
}
