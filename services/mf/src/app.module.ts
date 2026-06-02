import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule, JwtMiddleware, JwksService, UserSyncService } from '@tickernest/common';
import { HealthController } from './health/health.controller';
import { FundController } from './fund/fund.controller';
import { FundService } from './fund/fund.service';
import { FundRepository } from './fund/fund.repository';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule],
  controllers: [HealthController, FundController],
  providers: [JwksService, UserSyncService, FundRepository, FundService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtMiddleware)
      .exclude('health')
      .forRoutes('*');
  }
}
