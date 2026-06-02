import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule, JwtMiddleware, JwksService, UserSyncService } from '@tickernest/common';
import { HealthController } from './health/health.controller';
import { GoldController, SgbController } from './gold/gold.controller';
import { GoldService } from './gold/gold.service';
import { GoldRepository } from './gold/gold.repository';
import { SgbRepository } from './gold/sgb.repository';
import { AssetsController } from './assets/assets.controller';
import { AssetsService } from './assets/assets.service';
import { AssetsRepository } from './assets/assets.repository';
import { SummaryController } from './summary/summary.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule],
  controllers: [HealthController, GoldController, SgbController, AssetsController, SummaryController],
  providers: [JwksService, UserSyncService, GoldRepository, SgbRepository, GoldService, AssetsRepository, AssetsService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtMiddleware)
      .exclude('health')
      .forRoutes('*');
  }
}
