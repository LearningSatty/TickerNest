import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { EventsService, CreateEventDto, UpdateEventDto } from './events.service';
import { YahooEventsService, YahooCalendarEvent } from './yahoo-events.service';

interface CombinedEvent {
  id: string;
  title: string;
  description: string;
  stock_ticker: string | null;
  event_date: string;
  event_time: string | null;
  event_type: string;
  color: string;
  source: 'custom' | 'yahoo';
  market?: 'US' | 'IN' | 'OTHER';
  created_at?: string;
  updated_at?: string;
}

@Controller('events')
export class EventsController {
  constructor(
    private readonly svc: EventsService,
    private readonly yahooSvc: YahooEventsService,
  ) {}

  /** List events, optionally filtered by date range or month. Returns both custom + Yahoo events. */
  @Get()
  async list(
    @Req() req: { user?: { id: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('month') month?: string, // YYYY-MM format
  ): Promise<CombinedEvent[]> {
    if (!req.user) throw new UnauthorizedException();

    let customEvents;
    if (month) {
      customEvents = await this.svc.listByMonth(req.user.id, month);
    } else {
      customEvents = await this.svc.list(req.user.id, from, to);
    }

    // Determine date range for Yahoo events
    let yahooFrom: string;
    let yahooTo: string;
    if (month) {
      const parts = month.split('-').map(Number);
      const y = parts[0]!;
      const m = parts[1]!;
      yahooFrom = `${month}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      yahooTo = `${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (from && to) {
      yahooFrom = from;
      yahooTo = to;
    } else {
      // Default: next 7 days
      const today = new Date();
      yahooFrom = today.toISOString().slice(0, 10);
      const end = new Date(today);
      end.setDate(today.getDate() + 7);
      yahooTo = end.toISOString().slice(0, 10);
    }

    let yahooEvents: YahooCalendarEvent[] = [];
    try {
      yahooEvents = await this.yahooSvc.getForDateRange(yahooFrom, yahooTo);
    } catch {
      // Yahoo fetch failed — return custom events only
    }

    // Merge: custom events first, then Yahoo events, sorted by date
    const custom: CombinedEvent[] = customEvents.map((e) => ({
      ...e,
      source: 'custom' as const,
    }));

    const yahoo: CombinedEvent[] = yahooEvents.map((e) => ({
      ...e,
      source: 'yahoo' as const,
    }));

    // Sort: by date, then custom before yahoo within same date
    return [...custom, ...yahoo].sort((a, b) => {
      const dateCmp = a.event_date.localeCompare(b.event_date);
      if (dateCmp !== 0) return dateCmp;
      // Custom events first
      if (a.source === 'custom' && b.source === 'yahoo') return -1;
      if (a.source === 'yahoo' && b.source === 'custom') return 1;
      return 0;
    });
  }

  /** Get events for today (used in dashboard). Custom first, then Yahoo. */
  @Get('today')
  async today(@Req() req: { user?: { id: string } }): Promise<CombinedEvent[]> {
    if (!req.user) throw new UnauthorizedException();

    const customEvents = await this.svc.listToday(req.user.id);

    const today = new Date().toISOString().slice(0, 10);
    let yahooEvents: YahooCalendarEvent[] = [];
    try {
      const all = await this.yahooSvc.getUpcoming7Days();
      yahooEvents = all.filter((e) => e.event_date === today);
    } catch {
      // Yahoo fetch failed
    }

    const custom: CombinedEvent[] = customEvents.map((e) => ({
      ...e,
      source: 'custom' as const,
    }));

    const yahoo: CombinedEvent[] = yahooEvents.map((e) => ({
      ...e,
      source: 'yahoo' as const,
    }));

    // Custom events first
    return [...custom, ...yahoo];
  }

  @Get(':id')
  async getOne(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.getOne(req.user.id, id);
  }

  @Post()
  async create(
    @Req() req: { user?: { id: string } },
    @Body() body: CreateEventDto,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.create(req.user.id, body);
  }

  @Patch(':id')
  async update(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() body: UpdateEventDto,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.remove(req.user.id, id);
  }
}
