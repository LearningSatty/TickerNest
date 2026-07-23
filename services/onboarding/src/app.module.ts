import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule, JwtMiddleware, JwksService, UserSyncService } from '@tickernest/common';
import { HealthController } from './health/health.controller';
import { UploadController } from './upload/upload.controller';
import { UploadService } from './upload/upload.service';
import { TransformService } from './upload/transform.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule],
  controllers: [HealthController, UploadController],
  providers: [JwksService, UserSyncService, UploadService, TransformService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtMiddleware)
      .exclude('health')
      .forRoutes('*');
  }
}
