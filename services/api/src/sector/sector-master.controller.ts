/**
 * Sector & Sector-Domain master data CRUD.
 * Global (shared across all users) — flat lists used as dropdown options.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../common/db.service';

const CreateDto = z.object({ name: z.string().min(1).max(100) });

@Controller('master')
export class SectorMasterController {
  constructor(private readonly db: DbService) {}

  // ─── Sectors ─────────────────────────────────────────────────────────────
  @Get('sectors')
  async listSectors() {
    const r = await this.db.query<{ id: string; name: string }>(`SELECT id, name FROM sector ORDER BY name`);
    return r.rows;
  }

  @Post('sectors')
  @HttpCode(201)
  async createSector(@Req() req: { user?: { id: string } }, @Body() body: unknown) {
    if (!req.user) throw new UnauthorizedException();
    const parsed = CreateDto.safeParse(body);
    if (!parsed.success) throw new UnauthorizedException(parsed.error.message);
    const r = await this.db.query<{ id: string; name: string }>(
      `INSERT INTO sector (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name`,
      [parsed.data.name.trim()],
    );
    if (r.rows.length === 0) {
      // Already exists, just return it
      const existing = await this.db.query<{ id: string; name: string }>(`SELECT id, name FROM sector WHERE name = $1`, [parsed.data.name.trim()]);
      return existing.rows[0]!;
    }
    return r.rows[0]!;
  }

  @Delete('sectors/:id')
  @HttpCode(204)
  async deleteSector(@Req() req: { user?: { id: string } }, @Param('id') id: string) {
    if (!req.user) throw new UnauthorizedException();
    await this.db.query(`DELETE FROM sector WHERE id = $1`, [id]);
  }

  // ─── Sector Domains ──────────────────────────────────────────────────────
  @Get('sector-domains')
  async listSectorDomains() {
    const r = await this.db.query<{ id: string; name: string }>(`SELECT id, name FROM sector_domain ORDER BY name`);
    return r.rows;
  }

  @Post('sector-domains')
  @HttpCode(201)
  async createSectorDomain(@Req() req: { user?: { id: string } }, @Body() body: unknown) {
    if (!req.user) throw new UnauthorizedException();
    const parsed = CreateDto.safeParse(body);
    if (!parsed.success) throw new UnauthorizedException(parsed.error.message);
    const r = await this.db.query<{ id: string; name: string }>(
      `INSERT INTO sector_domain (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name`,
      [parsed.data.name.trim()],
    );
    if (r.rows.length === 0) {
      const existing = await this.db.query<{ id: string; name: string }>(`SELECT id, name FROM sector_domain WHERE name = $1`, [parsed.data.name.trim()]);
      return existing.rows[0]!;
    }
    return r.rows[0]!;
  }

  @Delete('sector-domains/:id')
  @HttpCode(204)
  async deleteSectorDomain(@Req() req: { user?: { id: string } }, @Param('id') id: string) {
    if (!req.user) throw new UnauthorizedException();
    await this.db.query(`DELETE FROM sector_domain WHERE id = $1`, [id]);
  }
}
