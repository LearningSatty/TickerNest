import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule, JwtMiddleware, JwksService, UserSyncService } from '@tickernest/common';
import { HealthController } from './health/health.controller';
import { FundController } from './fund/fund.controller';
import { FundService } from './fund/fund.service';
import { FundRepository } from './fund/fund.repository';
import { SipController } from './sip/sip.controller';
import { SipService } from './sip/sip.service';
import { SipRepository } from './sip/sip.repository';
import { UlipController } from './ulip/ulip.controller';
import { UlipService } from './ulip/ulip.service';
import { UlipRepository } from './ulip/ulip.repository';
import { SummaryController } from './summary/summary.controller';
import { NavPollerService } from './nav/nav-poller.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule],
  controllers: [HealthController, FundController, SipController, UlipController, SummaryController],
  providers: [JwksService, UserSyncService, FundRepository, FundService, SipRepository, SipService, UlipRepository, UlipService, NavPollerService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtMiddleware)
      .exclude('health')
      .forRoutes('*');
  }
}
