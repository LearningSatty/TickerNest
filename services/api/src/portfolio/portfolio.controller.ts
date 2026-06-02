import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly svc: PortfolioService) {}

  @Get('consolidated')
  async consolidated(@Req() req: { user?: { id: string } }) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.getConsolidated(req.user.id);
  }

  @Get('sector')
  async sector(@Req() req: { user?: { id: string } }) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.getBySector(req.user.id);
  }
}
