import { Injectable, Logger } from '@nestjs/common';

/**
 * Market calendar event shape (what we expose to the frontend).
 * Fetched from Yahoo Finance (US) and NSE India (Indian market).
 * These are NOT stored in the database — fetched on-demand and cached.
 */
export interface YahooCalendarEvent {
  id: string;
  title: string;
  description: string;
  stock_ticker: string;
  event_date: string; // YYYY-MM-DD
  event_time: string | null;
  event_type: 'earnings' | 'ipo' | 'split' | 'dividend' | 'other';
  color: string;
  source: 'yahoo';
  market: 'US' | 'IN' | 'OTHER';
}

const EVENT_COLORS = {
  earnings: '#10b981',
  ipo: '#8b5cf6',
  split: '#ec4899',
  dividend: '#06b6d4',
  other: '#6b7280',
};

/**
 * Classify a ticker into its market based on suffix.
 */
function classifyMarket(ticker: string): 'US' | 'IN' | 'OTHER' {
  if (ticker.endsWith('.NS') || ticker.endsWith('.BO')) return 'IN';
  if (ticker.endsWith('.L') || ticker.endsWith('.DE') || ticker.endsWith('.PA') ||
      ticker.endsWith('.T') || ticker.endsWith('.HK') || ticker.endsWith('.AX')) return 'OTHER';
  if (!ticker.includes('.')) return 'US';
  return 'OTHER';
}

/**
 * Convert DD-Mon-YYYY (e.g. "10-Jun-2026") to YYYY-MM-DD.
 */
function parseNseDate(dateStr: string): string {
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  const day = parts[0]!.padStart(2, '0');
  const mon = months[parts[1]!] ?? '01';
  const year = parts[2]!;
  return `${year}-${mon}-${day}`;
}

/**
 * Classify NSE board meeting purpose into event type.
 */
function classifyNsePurpose(purpose: string, desc: string): 'earnings' | 'dividend' | 'split' | 'other' {
  const lower = (purpose + ' ' + desc).toLowerCase();
  if (lower.includes('financial result') || lower.includes('audited') || lower.includes('unaudited') ||
      lower.includes('quarterly result') || lower.includes('annual result')) {
    return 'earnings';
  }
  if (lower.includes('dividend')) return 'dividend';
  if (lower.includes('split') || lower.includes('sub-division')) return 'split';
  return 'other';
}

interface NseBoardMeeting {
  bm_symbol: string;
  bm_date: string;
  bm_purpose: string;
  bm_desc: string;
  sm_name: string;
  sm_indusrty?: string;
}

@Injectable()
export class YahooEventsService {
  private readonly log = new Logger(YahooEventsService.name);
  private cache = new Map<string, { data: YahooCalendarEvent[]; fetchedAt: number }>();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Get market events for the next 14 days (current + next week).
   */
  async getUpcoming7Days(): Promise<YahooCalendarEvent[]> {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const end = new Date(today);
    end.setDate(today.getDate() + 13);
    const endStr = end.toISOString().slice(0, 10);
    return this.getForDateRange(todayStr, endStr);
  }

  /**
   * Get market calendar events for a date range.
   * Combines US (Yahoo) and Indian (NSE) market events.
   */
  async getForDateRange(from: string, to: string): Promise<YahooCalendarEvent[]> {
    const cacheKey = `range-${from}-${to}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL) {
      return cached.data;
    }

    const [usEvents, inEvents] = await Promise.allSettled([
      this.fetchUsEarnings(from),
      this.fetchIndianEvents(from, to),
    ]);

    const allEvents: YahooCalendarEvent[] = [];

    if (usEvents.status === 'fulfilled') {
      // Only include US events if the range includes today (Yahoo only gives current data)
      const today = new Date().toISOString().slice(0, 10);
      if (today >= from && today <= to) {
        allEvents.push(...usEvents.value);
      }
    }

    if (inEvents.status === 'fulfilled') {
      // Filter Indian events to the requested date range
      const filtered = inEvents.value.filter(
        (ev) => ev.event_date >= from && ev.event_date <= to,
      );
      allEvents.push(...filtered);
    }

    allEvents.sort((a, b) => a.event_date.localeCompare(b.event_date));
    this.cache.set(cacheKey, { data: allEvents, fetchedAt: Date.now() });
    return allEvents;
  }

  // ─── US Market: Yahoo Finance ──────────────────────────────────────────────

  private async fetchUsEarnings(today: string): Promise<YahooCalendarEvent[]> {
    const cacheKey = `us-${today}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const url = `https://finance.yahoo.com/calendar/earnings?day=${today}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!resp.ok) return [];

      const html = await resp.text();
      const events = this.parseYahooTable(html, today);
      this.cache.set(cacheKey, { data: events, fetchedAt: Date.now() });
      this.log.log(`Parsed ${events.length} US earnings from Yahoo`);
      return events;
    } catch (e) {
      this.log.warn(`Yahoo fetch failed: ${(e as Error).message}`);
      return [];
    }
  }

  private parseYahooTable(html: string, date: string): YahooCalendarEvent[] {
    const events: YahooCalendarEvent[] = [];
    const seen = new Set<string>();

    const rowPattern = /<tr[^>]*data-testid="data-table-v2-row"[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowPattern.exec(html)) !== null) {
      const rowHtml = rowMatch[1]!;

      const tickerMatch = rowHtml.match(/href="\/quote\/([A-Z0-9.\-]+)\/"/);
      if (!tickerMatch || !tickerMatch[1]) continue;
      const ticker = tickerMatch[1];

      if (seen.has(ticker)) continue;
      seen.add(ticker);

      const companyMatch = rowHtml.match(
        /data-testid-cell="companyshortname"[^>]*>\s*([\s\S]*?)\s*<\/td>/,
      );
      const company = companyMatch
        ? companyMatch[1]!.replace(/<[^>]*>/g, '').trim()
        : ticker;

      const eventNameMatch = rowHtml.match(
        /data-testid-cell="eventname"[^>]*>\s*([\s\S]*?)\s*<\/td>/,
      );
      const eventName = eventNameMatch
        ? eventNameMatch[1]!.replace(/<[^>]*>/g, '').trim()
        : '';

      let eventTime: string | null = null;
      let timeLabel = '';
      if (rowHtml.includes('>BMO<') || rowHtml.includes('Before market open')) {
        eventTime = '09:15';
        timeLabel = 'Before market open';
      } else if (rowHtml.includes('>AMC<') || rowHtml.includes('After market close')) {
        eventTime = '15:30';
        timeLabel = 'After market close';
      }

      const epsMatch = rowHtml.match(
        /data-testid-cell="epsestimate"[^>]*>\s*([\d.]+)\s*<\/td>/,
      );
      const epsEst = epsMatch ? epsMatch[1] : null;

      const descParts = [
        eventName || `${company} earnings report`,
        epsEst ? `EPS Est: ${epsEst}` : null,
        timeLabel || null,
      ].filter(Boolean);

      events.push({
        id: `yahoo-earnings-${ticker}-${date}`,
        title: `${company} - Earnings`,
        description: descParts.join(' · '),
        stock_ticker: ticker,
        event_date: date,
        event_time: eventTime,
        event_type: 'earnings',
        color: EVENT_COLORS.earnings,
        source: 'yahoo',
        market: classifyMarket(ticker),
      });
    }

    return events;
  }

  // ─── Indian Market: NSE India ──────────────────────────────────────────────

  private async fetchIndianEvents(from: string, to: string): Promise<YahooCalendarEvent[]> {
    const cacheKey = `in-${from}-${to}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // NSE expects DD-MM-YYYY format
      const fromNse = this.toNseDateFormat(from);
      const toNse = this.toNseDateFormat(to);

      const url = `https://www.nseindia.com/api/corporate-board-meetings?index=equities&from_date=${fromNse}&to_date=${toNse}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!resp.ok) {
        this.log.debug(`NSE returned ${resp.status}`);
        return [];
      }

      const data = (await resp.json()) as NseBoardMeeting[];
      const events = this.parseNseData(data);
      this.cache.set(cacheKey, { data: events, fetchedAt: Date.now() });
      this.log.log(`Parsed ${events.length} Indian market events from NSE`);
      return events;
    } catch (e) {
      this.log.warn(`NSE fetch failed: ${(e as Error).message}`);
      return [];
    }
  }

  private parseNseData(data: NseBoardMeeting[]): YahooCalendarEvent[] {
    const events: YahooCalendarEvent[] = [];
    const seen = new Set<string>();

    for (const item of data) {
      const eventDate = parseNseDate(item.bm_date);
      if (!eventDate) continue;

      const eventType = classifyNsePurpose(item.bm_purpose, item.bm_desc);

      // Skip "other" type events that are just generic board meeting intimations
      // unless they have meaningful content
      if (eventType === 'other' && item.bm_purpose === 'Board Meeting Intimation') continue;

      const ticker = `${item.bm_symbol}.NS`;
      const dedupKey = `${ticker}-${eventDate}-${eventType}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const company = item.sm_name || item.bm_symbol;

      // Shorten description
      let description = item.bm_desc || item.bm_purpose;
      if (description.length > 200) {
        description = description.substring(0, 200) + '...';
      }

      const title =
        eventType === 'earnings' ? `${company} - Results` :
        eventType === 'dividend' ? `${company} - Dividend` :
        eventType === 'split' ? `${company} - Split` :
        `${company} - ${item.bm_purpose}`;

      events.push({
        id: `nse-${eventType}-${item.bm_symbol}-${eventDate}`,
        title,
        description,
        stock_ticker: ticker,
        event_date: eventDate,
        event_time: null,
        event_type: eventType,
        color: EVENT_COLORS[eventType],
        source: 'yahoo', // keeping 'yahoo' as source type for frontend compatibility
        market: 'IN',
      });
    }

    return events;
  }

  /**
   * Convert YYYY-MM-DD to DD-MM-YYYY (NSE format).
   */
  private toNseDateFormat(isoDate: string): string {
    const [y, m, d] = isoDate.split('-');
    return `${d}-${m}-${y}`;
  }
}
