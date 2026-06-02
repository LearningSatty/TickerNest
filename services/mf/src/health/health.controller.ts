import { Controller, Get } from '@nestjs/common';
import { DbService } from '@tickernest/common';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  async check() {
    try {
      await this.db.query('SELECT 1');
      return { ok: true, db: true, service: 'tickernest-mf' };
    } catch {
      return { ok: false, db: false, service: 'tickernest-mf' };
    }
  }
}
