/**
 * Simple Watchlist API — broker-independent.
 *
 * Sections are stored at two levels:
 *   • watchlist.sections   text[]  — the user-defined section list, including
 *                                    empty sections (created via dialog before
 *                                    any item is dropped in).
 *   • watchlist_item.section_name   — null = ungrouped, else points to a name
 *                                    in the parent's sections[] array.
 *
 * Endpoints
 *   GET    /watchlists                            → list
 *   POST   /watchlists                            → create
 *   DELETE /watchlists/:id                        → delete
 *   GET    /watchlists/:id                        → detail (sections + items + quotes)
 *   POST   /watchlists/:id/sections               → add a section (idempotent)
 *   DELETE /watchlists/:id/sections/:name         → delete section, items become ungrouped
 *   POST   /watchlists/:id/items                  → add ticker
 *   PATCH  /watchlists/:id/items/:ticker          → move item to a section (or unset)
 *   DELETE /watchlists/:id/items/:ticker          → remove ticker
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe';
import { DbService } from '../common/db.service';
import { QuoteCache } from '../quote/quote.cache';
import { D } from '../common/types/money';

const CreateWatchlistDto = z.object({
  name: z.string().min(1).max(80),
  /** Optional group placement at create-time. */
  groupId: z.string().uuid().optional(),
  /** Market hint — used by the watchlist's add-ticker search dropdown. */
  market: z.enum(['IN', 'US']).default('IN'),
});

const CreateGroupDto = z.object({
  name: z.string().min(1).max(80),
});

const PatchWatchlistDto = z.object({
  /** null → ungroup; string id → move into that group. */
  groupId: z.string().uuid().nullable(),
});

const AddSectionDto = z.object({
  name: z.string().min(1).max(80),
});

const AddItemDto = z.object({
  ticker: z.string().min(1).max(40),
  sectionName: z.string().min(1).max(80).optional(),
});

const PatchItemDto = z.object({
  sectionName: z.string().min(1).max(80).nullable(),
});

interface GroupRow {
  id: string;
  name: string;
  position: number;
}

interface WatchlistRow {
  id: string;
  name: string;
  groupId: string | null;
  market: 'IN' | 'US';
  itemCount: number;
  position: number;
}

interface WatchlistItemRow {
  ticker: string;
  name: string;
  sectionName: string | null;
  position: number;
  currentPrice: string;
  prevClose: string;
  dayChange: string;
  dayChangePct: string;
  currency: string;
}

interface WatchlistDetailResponse {
  id: string;
  name: string;
  market: 'IN' | 'US';
  sections: string[]; // user-defined order, may include empty sections
  items: WatchlistItemRow[];
}

@Controller('watchlists')
export class WatchlistController {
  constructor(
    private readonly db: DbService,
    private readonly quotes: QuoteCache,
  ) {}

  // ── List watchlists ─────────────────────────────────────────────────────────
  @Get()
  async list(@Req() req: { user?: { id: string } }): Promise<WatchlistRow[]> {
    if (!req.user) throw new UnauthorizedException();
    return this.db.withUserTx(req.user.id, async (tx) => {
      const r = await tx.query<{
        id: string;
        name: string;
        group_id: string | null;
        market: 'IN' | 'US';
        position: number;
        item_count: string;
      }>(
        `SELECT w.id, w.name, w.group_id, w.market, w.position,
                COALESCE(COUNT(wi.id), 0)::text AS item_count
           FROM watchlist w
      LEFT JOIN watchlist_item wi ON wi.watchlist_id = w.id
          WHERE w.user_id = $1
          GROUP BY w.id
          ORDER BY w.position, w.name`,
        [req.user!.id],
      );
      return r.rows.map((row) => ({
        id: row.id,
        name: row.name,
        groupId: row.group_id,
        market: row.market,
        position: row.position,
        itemCount: Number(row.item_count),
      }));
    });
  }

  // ── List groups ─────────────────────────────────────────────────────────────
  @Get('groups')
  async listGroups(
    @Req() req: { user?: { id: string } },
  ): Promise<GroupRow[]> {
    if (!req.user) throw new UnauthorizedException();
    return this.db.withUserTx(req.user.id, async (tx) => {
      const r = await tx.query<{
        id: string;
        name: string;
        position: number;
      }>(
        `SELECT id, name, position
           FROM watchlist_group
          WHERE user_id = $1
          ORDER BY position, name`,
        [req.user!.id],
      );
      return r.rows;
    });
  }

  // ── Create group ────────────────────────────────────────────────────────────
  @Post('groups')
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(CreateGroupDto))
  async createGroup(
    @Req() req: { user?: { id: string } },
    @Body() dto: z.infer<typeof CreateGroupDto>,
  ): Promise<GroupRow> {
    if (!req.user) throw new UnauthorizedException();
    return this.db.withUserTx(req.user.id, async (tx) => {
      const max = await tx.query<{ max: number | null }>(
        `SELECT COALESCE(MAX(position), 0) AS max FROM watchlist_group WHERE user_id = $1`,
        [req.user!.id],
      );
      const pos = (max.rows[0]!.max ?? 0) + 1;
      const r = await tx.query<{ id: string }>(
        `INSERT INTO watchlist_group (user_id, name, position)
         VALUES ($1, $2, $3) RETURNING id`,
        [req.user!.id, dto.name.trim(), pos],
      );
      return { id: r.rows[0]!.id, name: dto.name.trim(), position: pos };
    });
  }

  // ── Delete group (sets contained watchlists' group_id to NULL) ──────────────
  @Delete('groups/:groupId')
  @HttpCode(204)
  async deleteGroup(
    @Req() req: { user?: { id: string } },
    @Param('groupId') groupId: string,
  ): Promise<void> {
    if (!req.user) throw new UnauthorizedException();
    await this.db.withUserTx(req.user.id, async (tx) => {
      // FK has ON DELETE SET NULL so member watchlists ungroup automatically.
      await tx.query(
        `DELETE FROM watchlist_group WHERE id = $1 AND user_id = $2`,
        [groupId, req.user!.id],
      );
    });
  }

  // ── Move watchlist into / out of a group ────────────────────────────────────
  @Patch(':id')
  @UsePipes(new ZodValidationPipe(PatchWatchlistDto))
  async patchWatchlist(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() dto: z.infer<typeof PatchWatchlistDto>,
  ): Promise<{ id: string; groupId: string | null }> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;
    return this.db.withUserTx(userId, async (tx) => {
      // If a target group was supplied, confirm ownership before linking.
      if (dto.groupId) {
        const owner = await tx.query<{ id: string }>(
          `SELECT id FROM watchlist_group WHERE id = $1 AND user_id = $2`,
          [dto.groupId, userId],
        );
        if (owner.rows.length === 0) {
          throw new UnauthorizedException('group not found');
        }
      }
      const r = await tx.query<{ id: string; group_id: string | null }>(
        `UPDATE watchlist
            SET group_id = $1
          WHERE id = $2 AND user_id = $3
          RETURNING id, group_id`,
        [dto.groupId, id, userId],
      );
      if (r.rows.length === 0) {
        throw new UnauthorizedException('watchlist not found');
      }
      return { id: r.rows[0]!.id, groupId: r.rows[0]!.group_id };
    });
  }

  // ── Create watchlist ────────────────────────────────────────────────────────
  @Post()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(CreateWatchlistDto))
  async create(
    @Req() req: { user?: { id: string } },
    @Body() dto: z.infer<typeof CreateWatchlistDto>,
  ): Promise<WatchlistRow> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;
    return this.db.withUserTx(userId, async (tx) => {
      // Confirm the user owns the group (if one was supplied) before linking.
      if (dto.groupId) {
        const owner = await tx.query<{ id: string }>(
          `SELECT id FROM watchlist_group WHERE id = $1 AND user_id = $2`,
          [dto.groupId, userId],
        );
        if (owner.rows.length === 0) {
          throw new UnauthorizedException('group not found');
        }
      }
      const max = await tx.query<{ max: number | null }>(
        `SELECT COALESCE(MAX(position), 0) AS max FROM watchlist WHERE user_id = $1`,
        [userId],
      );
      const pos = (max.rows[0]!.max ?? 0) + 1;
      const r = await tx.query<{ id: string }>(
        `INSERT INTO watchlist (user_id, name, type, position, group_id, market)
         VALUES ($1, $2, 'STANDARD', $3, $4, $5)
         RETURNING id`,
        [userId, dto.name, pos, dto.groupId ?? null, dto.market],
      );
      return {
        id: r.rows[0]!.id,
        name: dto.name,
        groupId: dto.groupId ?? null,
        market: dto.market,
        position: pos,
        itemCount: 0,
      };
    });
  }

  // ── Delete watchlist ────────────────────────────────────────────────────────
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ): Promise<void> {
    if (!req.user) throw new UnauthorizedException();
    await this.db.withUserTx(req.user.id, async (tx) => {
      await tx.query(`DELETE FROM watchlist WHERE id = $1 AND user_id = $2`, [id, req.user!.id]);
    });
  }

  // ── Top movers across all user's watchlists ─────────────────────────────────
  // Returns the N tickers with the largest |dayChangePct|, regardless of
  // which watchlist they live in. Used by the Watchlists hub page.
  @Get('movers')
  async movers(
    @Req() req: { user?: { id: string } },
    @Query('limit') limitStr = '6',
  ): Promise<Array<{
    ticker: string;
    name: string;
    currentPrice: string;
    dayChange: string;
    dayChangePct: string;
    currency: string;
    watchlistId: string;
    watchlistName: string;
  }>> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;
    const limit = Math.max(1, Math.min(20, parseInt(limitStr, 10) || 6));

    // Get every (ticker, watchlist) pair the user follows.
    const rowsByTicker = await this.db.withUserTx(userId, async (tx) => {
      const r = await tx.query<{
        ticker: string;
        name: string | null;
        currency: string | null;
        watchlist_id: string;
        watchlist_name: string;
      }>(
        `SELECT DISTINCT ON (wi.ticker)
                wi.ticker,
                tm.name,
                tm.currency,
                w.id   AS watchlist_id,
                w.name AS watchlist_name
           FROM watchlist_item wi
           JOIN watchlist w  ON w.id = wi.watchlist_id
      LEFT JOIN ticker_meta tm ON tm.ticker = wi.ticker
          WHERE wi.user_id = $1
          ORDER BY wi.ticker, w.position`,
        [userId],
      );
      return r.rows;
    });
    if (rowsByTicker.length === 0) return [];

    const tickers = rowsByTicker.map((r) => r.ticker);
    const quotes = await this.quotes.getMany(tickers);

    const enriched = rowsByTicker
      .map((row) => {
        const q = quotes.get(row.ticker);
        const ltp = q?.ltp ?? D(0);
        const prev = q?.prevClose ?? D(0);
        const change = ltp.sub(prev);
        const changePct = prev.isZero() ? D(0) : change.div(prev);
        return {
          ticker: row.ticker,
          name: row.name ?? row.ticker,
          currentPrice: ltp.toFixed(4),
          dayChange: change.toFixed(4),
          dayChangePct: changePct.toFixed(6),
          currency: row.currency ?? 'INR',
          watchlistId: row.watchlist_id,
          watchlistName: row.watchlist_name,
          _abs: changePct.abs(),
          _hasQuote: !ltp.isZero(),
        };
      })
      .filter((x) => x._hasQuote)
      .sort((a, b) => b._abs.cmp(a._abs))
      .slice(0, limit);

    return enriched.map(({ _abs, _hasQuote, ...rest }) => {
      void _abs; void _hasQuote;
      return rest;
    });
  }

  // ── Aggregated news across the user's watchlists ────────────────────────────
  // Pulls Yahoo Finance news for up to MAX_TICKERS distinct watchlist tickers
  // (round-robin sampled), dedupes by uuid, sorts by publish time desc.
  @Get('news')
  async news(
    @Req() req: { user?: { id: string } },
    @Query('limit') limitStr = '10',
  ): Promise<Array<{
    title: string;
    publisher: string;
    publishedAt: number;
    link: string;
    relatedTickers: string[];
  }>> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;
    const limit = Math.max(1, Math.min(30, parseInt(limitStr, 10) || 10));
    const MAX_TICKERS = 6; // to bound Yahoo calls per request

    // Distinct tickers across all the user's watchlists.
    const tickers = await this.db.withUserTx(userId, async (tx) => {
      const r = await tx.query<{ ticker: string }>(
        `SELECT DISTINCT ticker FROM watchlist_item WHERE user_id = $1 LIMIT $2`,
        [userId, MAX_TICKERS],
      );
      return r.rows.map((x) => x.ticker);
    });
    if (tickers.length === 0) return [];

    interface NewsItem {
      uuid: string;
      title: string;
      publisher: string;
      providerPublishTime: number;
      link: string;
      relatedTickers?: string[];
    }
    const seen = new Set<string>();
    const all: NewsItem[] = [];
    await Promise.all(
      tickers.map(async (t) => {
        try {
          const url =
            `https://query2.finance.yahoo.com/v1/finance/search` +
            `?q=${encodeURIComponent(t)}&newsCount=5&quotesCount=0&listsCount=0`;
          const r = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (TickerNest)' },
          });
          if (!r.ok) return;
          const body = (await r.json()) as { news?: NewsItem[] };
          for (const item of body.news ?? []) {
            if (!item.uuid || seen.has(item.uuid)) continue;
            seen.add(item.uuid);
            all.push(item);
          }
        } catch {
          /* skip silently — news is best-effort */
        }
      }),
    );

    return all
      .sort((a, b) => (b.providerPublishTime ?? 0) - (a.providerPublishTime ?? 0))
      .slice(0, limit)
      .map((n) => ({
        title: n.title,
        publisher: n.publisher,
        publishedAt: n.providerPublishTime,
        link: n.link,
        relatedTickers: n.relatedTickers ?? [],
      }));
  }

  // ── Get watchlist detail ────────────────────────────────────────────────────
  @Get(':id')
  async details(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ): Promise<WatchlistDetailResponse> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;
    const data = await this.db.withUserTx(userId, async (tx) => {
      const wl = await tx.query<{
        id: string;
        name: string;
        sections: string[];
        market: 'IN' | 'US';
      }>(
        `SELECT id, name, sections, market FROM watchlist WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (wl.rows.length === 0) {
        throw new UnauthorizedException('watchlist not found');
      }
      const items = await tx.query<{
        ticker: string;
        section_name: string | null;
        position: number;
        name: string | null;
        currency: string | null;
      }>(
        `SELECT wi.ticker, wi.section_name, wi.position,
                tm.name, tm.currency
           FROM watchlist_item wi
      LEFT JOIN ticker_meta tm ON tm.ticker = wi.ticker
          WHERE wi.watchlist_id = $1 AND wi.user_id = $2
          ORDER BY wi.position, wi.ticker`,
        [id, userId],
      );
      return { wl: wl.rows[0]!, items: items.rows };
    });

    const tickers = [...new Set(data.items.map((it) => it.ticker))];
    const quotes = await this.quotes.getMany(tickers);

    const items: WatchlistItemRow[] = data.items.map((it) => {
      const q = quotes.get(it.ticker);
      const ltp = q?.ltp ?? D(0);
      const prev = q?.prevClose ?? D(0);
      const change = ltp.sub(prev);
      const changePct = prev.isZero() ? D(0) : change.div(prev);
      return {
        ticker: it.ticker,
        name: it.name ?? it.ticker,
        sectionName: it.section_name,
        position: it.position,
        currentPrice: ltp.toFixed(4),
        prevClose: prev.toFixed(4),
        dayChange: change.toFixed(4),
        dayChangePct: changePct.toFixed(6),
        currency: it.currency ?? 'INR',
      };
    });
    return {
      id: data.wl.id,
      name: data.wl.name,
      market: data.wl.market,
      sections: data.wl.sections ?? [],
      items,
    };
  }

  // ── Add section ─────────────────────────────────────────────────────────────
  @Post(':id/sections')
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(AddSectionDto))
  async addSection(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() dto: z.infer<typeof AddSectionDto>,
  ): Promise<{ sections: string[] }> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;
    const name = dto.name.trim();
    return this.db.withUserTx(userId, async (tx) => {
      // array_append-or-no-op via array_remove + array_append (idempotent).
      const r = await tx.query<{ sections: string[] }>(
        `UPDATE watchlist
            SET sections = CASE
                             WHEN $1 = ANY(sections) THEN sections
                             ELSE array_append(sections, $1)
                           END
          WHERE id = $2 AND user_id = $3
          RETURNING sections`,
        [name, id, userId],
      );
      if (r.rows.length === 0) throw new UnauthorizedException('watchlist not found');
      return { sections: r.rows[0]!.sections };
    });
  }

  // ── Delete section ──────────────────────────────────────────────────────────
  @Delete(':id/sections/:name')
  @HttpCode(204)
  async deleteSection(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Param('name') name: string,
  ): Promise<void> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;
    await this.db.withUserTx(userId, async (tx) => {
      // Items in this section become ungrouped.
      await tx.query(
        `UPDATE watchlist_item
            SET section_name = NULL
          WHERE watchlist_id = $1 AND section_name = $2 AND user_id = $3`,
        [id, name, userId],
      );
      // Remove from the watchlist's sections array.
      await tx.query(
        `UPDATE watchlist
            SET sections = array_remove(sections, $1)
          WHERE id = $2 AND user_id = $3`,
        [name, id, userId],
      );
    });
  }

  // ── Export to CSV ───────────────────────────────────────────────────────────
  // Streams text/csv: SYMBOL,SECTION header + one row per item.
  @Get(':id/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;
    const data = await this.db.withUserTx(userId, async (tx) => {
      const wl = await tx.query<{ name: string }>(
        `SELECT name FROM watchlist WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (wl.rows.length === 0) throw new UnauthorizedException('watchlist not found');
      const items = await tx.query<{ ticker: string; section_name: string | null }>(
        `SELECT ticker, section_name
           FROM watchlist_item
          WHERE watchlist_id = $1 AND user_id = $2
          ORDER BY position, ticker`,
        [id, userId],
      );
      return { name: wl.rows[0]!.name, items: items.rows };
    });

    // Sanitize filename for Content-Disposition.
    const slug = data.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() || 'watchlist';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${slug}.csv"`,
    );
    const lines = ['SYMBOL,SECTION'];
    for (const it of data.items) {
      // Quote section if it contains a comma or quote.
      const section = it.section_name ?? '';
      const safe = /[",\n]/.test(section)
        ? `"${section.replace(/"/g, '""')}"`
        : section;
      lines.push(`${it.ticker},${safe}`);
    }
    res.send(lines.join('\n') + '\n');
  }

  // ── Import from CSV ─────────────────────────────────────────────────────────
  // Accepts text/csv body. Header row optional; first column = ticker, second
  // (optional) = section name. Lines with a leading "#" are treated as comments.
  // Returns a count summary and never throws on individual bad rows.
  @Post(':id/import')
  @Header('Content-Type', 'application/json')
  async importCsv(
    @Req() req: { user?: { id: string }; body?: unknown },
    @Param('id') id: string,
    @Body() body: string | { csv?: string },
  ): Promise<{ added: number; skipped: number; errors: string[] }> {
    if (!req.user) throw new UnauthorizedException();
    const userId = req.user.id;

    // Body can arrive as raw text/csv OR JSON {csv: "..."} — accept both.
    const csv = typeof body === 'string'
      ? body
      : (body && typeof body === 'object' && typeof body.csv === 'string')
        ? body.csv
        : '';
    if (!csv.trim()) {
      return { added: 0, skipped: 0, errors: ['empty CSV body'] };
    }

    interface Row { ticker: string; section: string | null }
    const rows: Row[] = [];
    const errors: string[] = [];
    const lines = csv.split(/\r?\n/);
    let lineNo = 0;
    for (const raw of lines) {
      lineNo++;
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      // Skip a header row that explicitly names "SYMBOL".
      if (lineNo === 1 && /^symbol\b/i.test(line)) continue;
      const parts = parseCsvLine(line);
      const ticker = (parts[0] ?? '').trim().toUpperCase();
      const section = (parts[1] ?? '').trim();
      if (!ticker) {
        errors.push(`line ${lineNo}: missing symbol`);
        continue;
      }
      if (ticker.length > 40) {
        errors.push(`line ${lineNo}: symbol too long`);
        continue;
      }
      rows.push({ ticker, section: section || null });
    }
    if (rows.length === 0) {
      return { added: 0, skipped: 0, errors };
    }

    let added = 0;
    let skipped = 0;
    await this.db.withUserTx(userId, async (tx) => {
      // Confirm ownership once.
      const wl = await tx.query<{ id: string }>(
        `SELECT id FROM watchlist WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (wl.rows.length === 0) {
        throw new UnauthorizedException('watchlist not found');
      }
      // Auto-add any new sections to the watchlist's sections[] in one batch.
      const newSections = [
        ...new Set(rows.map((r) => r.section).filter((s): s is string => !!s)),
      ];
      if (newSections.length > 0) {
        for (const s of newSections) {
          await tx.query(
            `UPDATE watchlist
                SET sections = CASE
                                 WHEN $1 = ANY(sections) THEN sections
                                 ELSE array_append(sections, $1)
                               END
              WHERE id = $2 AND user_id = $3`,
            [s, id, userId],
          );
        }
      }
      // Position bump: pick up where the existing list ends.
      const max = await tx.query<{ max: number | null }>(
        `SELECT COALESCE(MAX(position), 0) AS max FROM watchlist_item WHERE watchlist_id = $1`,
        [id],
      );
      let pos = (max.rows[0]!.max ?? 0) + 1;
      for (const r of rows) {
        try {
          const result = await tx.query<{ id: string }>(
            `INSERT INTO watchlist_item
               (user_id, watchlist_id, ticker, section_name, position)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (watchlist_id, ticker) DO NOTHING
             RETURNING id`,
            [userId, id, r.ticker, r.section, pos],
          );
          if ((result.rowCount ?? 0) > 0) {
            added++;
            pos++;
          } else {
            skipped++;
          }
        } catch (e) {
          errors.push(`${r.ticker}: ${(e as Error).message}`);
        }
      }
    });
    return { added, skipped, errors };
  }

  // ── Add item ────────────────────────────────────────────────────────────────
  @Post(':id/items')
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(AddItemDto))
  async addItem(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() dto: z.infer<typeof AddItemDto>,
  ): Promise<{ ticker: string; sectionName: string | null }> {
    if (!req.user) throw new UnauthorizedException();
    const ticker = dto.ticker.toUpperCase();
    const userId = req.user.id;
    return this.db.withUserTx(userId, async (tx) => {
      const wl = await tx.query<{ id: string }>(
        `SELECT id FROM watchlist WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (wl.rows.length === 0) throw new UnauthorizedException('watchlist not found');

      const max = await tx.query<{ max: number | null }>(
        `SELECT COALESCE(MAX(position), 0) AS max
           FROM watchlist_item
          WHERE watchlist_id = $1`,
        [id],
      );
      const pos = (max.rows[0]!.max ?? 0) + 1;

      // If a sectionName was supplied, make sure it's in the watchlist's
      // sections[] (auto-create on first reference — convenient for the
      // form-driven flow without a separate pre-create dialog click).
      if (dto.sectionName) {
        await tx.query(
          `UPDATE watchlist
              SET sections = CASE
                               WHEN $1 = ANY(sections) THEN sections
                               ELSE array_append(sections, $1)
                             END
            WHERE id = $2 AND user_id = $3`,
          [dto.sectionName, id, userId],
        );
      }

      await tx.query(
        `INSERT INTO watchlist_item (user_id, watchlist_id, ticker, section_name, position)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (watchlist_id, ticker) DO UPDATE
            SET section_name = COALESCE(EXCLUDED.section_name, watchlist_item.section_name)`,
        [userId, id, ticker, dto.sectionName ?? null, pos],
      );

      return { ticker, sectionName: dto.sectionName ?? null };
    });
  }

  // ── Move item to a section / unset ──────────────────────────────────────────
  @Patch(':id/items/:ticker')
  @UsePipes(new ZodValidationPipe(PatchItemDto))
  async patchItem(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Param('ticker') ticker: string,
    @Body() dto: z.infer<typeof PatchItemDto>,
  ): Promise<{ ticker: string; sectionName: string | null }> {
    if (!req.user) throw new UnauthorizedException();
    const t = ticker.toUpperCase();
    const userId = req.user.id;
    return this.db.withUserTx(userId, async (tx) => {
      // If a target section was specified, auto-add it to the watchlist's
      // section list (matches the addItem behaviour).
      if (dto.sectionName) {
        await tx.query(
          `UPDATE watchlist
              SET sections = CASE
                               WHEN $1 = ANY(sections) THEN sections
                               ELSE array_append(sections, $1)
                             END
            WHERE id = $2 AND user_id = $3`,
          [dto.sectionName, id, userId],
        );
      }
      const r = await tx.query<{ ticker: string; section_name: string | null }>(
        `UPDATE watchlist_item
            SET section_name = $1
          WHERE watchlist_id = $2 AND ticker = $3 AND user_id = $4
          RETURNING ticker, section_name`,
        [dto.sectionName, id, t, userId],
      );
      if (r.rows.length === 0) throw new UnauthorizedException('item not found');
      return { ticker: r.rows[0]!.ticker, sectionName: r.rows[0]!.section_name };
    });
  }

  // ── Remove item ─────────────────────────────────────────────────────────────
  @Delete(':id/items/:ticker')
  @HttpCode(204)
  async removeItem(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Param('ticker') ticker: string,
  ): Promise<void> {
    if (!req.user) throw new UnauthorizedException();
    const t = ticker.toUpperCase();
    await this.db.withUserTx(req.user.id, async (tx) => {
      await tx.query(
        `DELETE FROM watchlist_item
          WHERE watchlist_id = $1 AND ticker = $2 AND user_id = $3`,
        [id, t, req.user!.id],
      );
    });
  }
}

// ─── Pure helper: parse one CSV line, supporting quoted fields ──────────────
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        out.push(cur);
        cur = '';
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}
