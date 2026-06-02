import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { PortfolioListener } from './portfolio-listener';

/**
 * RealtimeModule is imported by QuoteModule (so the poller can emit
 * quote.tick) and by AppModule (which dropped its inline providers).
 */
@Module({
  providers: [RealtimeGateway, PortfolioListener],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
