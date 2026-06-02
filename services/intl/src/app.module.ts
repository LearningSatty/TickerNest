import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule, JwtMiddleware, JwksService, UserSyncService } from '@tickernest/common';
import { HealthController } from './health/health.controller';
import { UsController } from './us/us.controller';
import { UsService } from './us/us.service';
import { UsRepository } from './us/us.repository';
import { CryptoController } from './crypto/crypto.controller';
import { CryptoService } from './crypto/crypto.service';
import { CryptoRepository } from './crypto/crypto.repository';
import { FxController } from './fx/fx.controller';
import { FxPollerService } from './fx/fx-poller.service';
import { SummaryController } from './summary/summary.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule],
  controllers: [HealthController, UsController, CryptoController, FxController, SummaryController],
  providers: [JwksService, UserSyncService, UsRepository, UsService, CryptoRepository, CryptoService, FxPollerService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtMiddleware)
      .exclude('health')
      .forRoutes('*');
  }
}
