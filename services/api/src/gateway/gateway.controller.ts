import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { GatewayService } from './gateway.service';

@Controller('net-worth')
export class GatewayController {
  constructor(private readonly svc: GatewayService) {}

  @Get()
  getNetWorth(@Req() req: Request) {
    const token = req.header('authorization')!.slice('Bearer '.length);
    return this.svc.getNetWorth((req as any).user!.id, token);
  }
}
