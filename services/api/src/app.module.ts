import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { JwtMiddleware } from './auth/jwt.middleware';
import { JwksService } from './auth/jwks.service';
import { UserSyncService } from './auth/user-sync.service';
import { DbModule } from './common/db.module';
import { IdempotencyService } from './common/idempotency';
import { PgIdempotencyStore } from './common/idempotency.pg';

import { HoldingController } from './holding/holding.controller';
import { HoldingService } from './holding/holding.service';
import { HoldingRepository } from './holding/holding.repository';
import { BrokerController } from './broker/broker.controller';
import { BrokerRepository } from './broker/broker.repository';
import { CsvImportController } from './csv-import/csv-import.controller';
import { CsvImportService } from './csv-import/csv-import.service';
import { ExcelImportController } from './excel-import/excel-import.controller';
import { ExcelImportService } from './excel-import/excel-import.service';
import { PortfolioController } from './portfolio/portfolio.controller';
import { PortfolioService } from './portfolio/portfolio.service';
import { MoversController } from './movers/movers.controller';
import { IndicesController } from './indices/indices.controller';
import { MarketController } from './market/market.controller';
import { SoldShareController } from './sold-share/sold-share.controller';
import { WatchlistController } from './watchlist/watchlist.controller';
import { HealthController } from './health/health.controller';
import { GatewayController } from './gateway/gateway.controller';
import { GatewayService } from './gateway/gateway.service';
import { NotesController } from './notes/notes.controller';
import { NotesService } from './notes/notes.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { YahooEventsService } from './events/yahoo-events.service';
import { QuoteModule } from './quote/quote.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SectorMasterController } from './sector/sector-master.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, RealtimeModule, QuoteModule],
  controllers: [
    HoldingController,
    BrokerController,
    CsvImportController,
    ExcelImportController,
    PortfolioController,
    MoversController,
    IndicesController,
    MarketController,
    SoldShareController,
    WatchlistController,
    SectorMasterController,
    HealthController,
    GatewayController,
    NotesController,
    EventsController,
  ],
  providers: [
    JwksService,
    UserSyncService,
    PgIdempotencyStore,
    {
      provide: IdempotencyService,
      useFactory: (store: PgIdempotencyStore) => new IdempotencyService(store),
      inject: [PgIdempotencyStore],
    },
    HoldingRepository,
    HoldingService,
    BrokerRepository,
    CsvImportService,
    ExcelImportService,
    PortfolioService,
    GatewayService,
    NotesService,
    EventsService,
    YahooEventsService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtMiddleware)
      .exclude('healthz', 'metrics')
      .forRoutes('*');
  }
}
