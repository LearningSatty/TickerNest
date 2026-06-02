import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';
import { RedisHealthService } from './redis-health.service';

/**
 * @Global so every feature module (QuoteModule, RealtimeModule, etc.) can
 * inject DbService without explicitly importing DbModule. Import DbModule
 * once in AppModule — that's all that's needed.
 */
@Global()
@Module({
  providers: [DbService, RedisHealthService],
  exports: [DbService, RedisHealthService],
})
export class DbModule {}
