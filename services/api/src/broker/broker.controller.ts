import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe';
import { BrokerRepository } from './broker.repository';

const CreateBrokerDto = z.object({
  name: z.string().min(1).max(40),
  displayName: z.string().min(1).max(80),
  currency: z.enum(['INR', 'USD']).default('INR'),
  exchangeDefault: z.enum(['NSE', 'BSE', 'NASDAQ', 'NYSE']).default('NSE'),
});
const UpdateBrokerDto = z.object({
  displayName: z.string().min(1).max(80).optional(),
  currency: z.enum(['INR', 'USD']).optional(),
  exchangeDefault: z.enum(['NSE', 'BSE', 'NASDAQ', 'NYSE']).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

@Controller('brokers')
export class BrokerController {
  constructor(private readonly repo: BrokerRepository) {}

  @Get()
  async list(@Req() req: { user?: { id: string } }) {
    if (!req.user) throw new UnauthorizedException();
    const rows = await this.repo.list(req.user.id);
    return rows.map(toApi);
  }

  @Post()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(CreateBrokerDto))
  async create(
    @Req() req: { user?: { id: string } },
    @Body() dto: z.infer<typeof CreateBrokerDto>,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const row = await this.repo.create(req.user.id, dto);
    return toApi(row);
  }

  @Patch(':id')
  async update(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBrokerDto))
    dto: z.infer<typeof UpdateBrokerDto>,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const row = await this.repo.update(req.user.id, id, dto);
    if (!row) throw new NotFoundException();
    return toApi(row);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const ok = await this.repo.softDelete(req.user.id, id);
    if (!ok) throw new NotFoundException();
  }
}

function toApi(r: { id: string; name: string; display_name: string; currency: string; sort_order: number; exchange_default: string }) {
  return {
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    currency: r.currency,
    sortOrder: r.sort_order,
    exchangeDefault: r.exchange_default,
  };
}
