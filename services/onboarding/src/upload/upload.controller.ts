/**
 * Portfolio Onboarding Controller (Redesigned)
 *
 * Endpoints:
 *   POST /upload                      → Upload Excel, get sheet list
 *   GET  /upload/:id/sheet/:name      → Preview a sheet (raw grid)
 *   POST /upload/:id/extract          → Extract range from a sheet → headers + rows
 *   POST /upload/:id/transform-preview → Apply transform rules to ticker column, return preview
 *   POST /upload/:id/verify-tickers   → Batch verify resolved tickers against Yahoo
 *   POST /upload/:id/save             → Final save: broker + holdings with dual-ticker
 */
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UnauthorizedException,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService, SheetMeta, ExtractedData } from './upload.service';
import { TransformService, TransformRule, TransformResult, PRESETS } from './transform.service';
import { z } from 'zod';

/**
 * Parse a range expression like "1-5, 8, 10-12" into a sorted array of 1-based indices.
 */
function parseRangeExpr(expr: string): number[] {
  const result = new Set<number>();
  for (const part of expr.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const dashIdx = trimmed.indexOf('-');
    if (dashIdx > 0) {
      const start = parseInt(trimmed.slice(0, dashIdx), 10);
      const end = parseInt(trimmed.slice(dashIdx + 1), 10);
      if (!isNaN(start) && !isNaN(end) && start >= 1 && end >= start) {
        for (let i = start; i <= Math.min(end, 10000); i++) result.add(i);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n) && n >= 1) result.add(n);
    }
  }
  return [...result].sort((a, b) => a - b);
}

const ExtractDto = z.object({
  sheetName: z.string().min(1),
  rows: z.string().min(1),
  cols: z.string().min(1),
});

const TransformPreviewDto = z.object({
  /** Source tickers to transform (from the ticker column) */
  tickers: z.array(z.string()).min(1).max(1000),
  /** Transform rules to apply */
  rules: z.array(z.object({
    kind: z.enum(['UPPERCASE', 'STRIP_PREFIX', 'STRIP_SUFFIX', 'APPEND_SUFFIX', 'REGEX_REPLACE']),
    config: z.record(z.unknown()),
  })),
});

const VerifyTickersDto = z.object({
  /** Resolved tickers to verify against Yahoo */
  tickers: z.array(z.string().min(1)).min(1).max(200),
});

const SaveDto = z.object({
  brokerName: z.string().min(1).max(100),
  exchangeDefault: z.enum(['NSE', 'BSE', 'NASDAQ', 'NYSE']).default('NSE'),
  sheetName: z.string().min(1),
  rows: z.string().min(1),
  cols: z.string().min(1),
  columnMapping: z.object({
    ticker: z.number().int().min(0),
    qty: z.number().int().min(0),
    avgCost: z.number().int().min(0),
  }),
  /** Transform rules that were applied (saved with broker) */
  transformRules: z.array(z.object({
    kind: z.enum(['UPPERCASE', 'STRIP_PREFIX', 'STRIP_SUFFIX', 'APPEND_SUFFIX', 'REGEX_REPLACE']),
    config: z.record(z.unknown()),
  })),
  /** Full ticker mapping from Step 4 (user's final edits). Each entry = one row's source→resolved. */
  tickerMap: z.array(z.object({ source: z.string(), resolved: z.string() })),
});

@Controller('upload')
export class UploadController {
  constructor(
    private readonly svc: UploadService,
    private readonly transform: TransformService,
  ) {}

  /**
   * Step 1: Upload an Excel file. Returns uploadId + list of sheets.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @Req() req: { user?: { id: string } },
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ uploadId: string; sheets: SheetMeta[] }> {
    if (!req.user) throw new UnauthorizedException();
    if (!file) throw new BadRequestException('No file uploaded');
    if (!file.originalname.match(/\.xlsx?$/i)) {
      throw new BadRequestException('Only .xlsx files are supported');
    }
    return this.svc.parseExcel(req.user.id, file.buffer);
  }

  /**
   * Step 2: Preview a specific sheet (raw grid, max 200 rows).
   */
  @Get(':id/sheet/:name')
  async sheetPreview(
    @Req() req: { user?: { id: string } },
    @Param('id') uploadId: string,
    @Param('name') sheetName: string,
  ): Promise<{ grid: string[][]; totalRows: number; totalCols: number }> {
    if (!req.user) throw new UnauthorizedException();
    const result = this.svc.getSheetPreview(uploadId, req.user.id, decodeURIComponent(sheetName));
    if (!result) throw new BadRequestException('Upload session expired or sheet not found');
    return result;
  }

  /**
   * Step 3: Extract specific rows/cols from a sheet. Returns headers + rows.
   */
  @Post(':id/extract')
  async extract(
    @Req() req: { user?: { id: string } },
    @Param('id') uploadId: string,
    @Body() body: unknown,
  ): Promise<ExtractedData> {
    if (!req.user) throw new UnauthorizedException();
    const parsed = ExtractDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { sheetName, rows, cols } = parsed.data;
    const rowIndices = parseRangeExpr(rows);
    const colIndices = parseRangeExpr(cols);
    if (rowIndices.length === 0) throw new BadRequestException('No valid rows in range expression');
    if (colIndices.length === 0) throw new BadRequestException('No valid columns in range expression');
    const result = this.svc.extractByIndices(uploadId, req.user.id, sheetName, rowIndices, colIndices);
    if (!result) throw new BadRequestException('Upload session expired or sheet not found');
    return result;
  }

  /**
   * Step 4a: Transform preview — apply rules to source tickers, return preview.
   * Also returns available presets for convenience.
   */
  @Post(':id/transform-preview')
  async transformPreview(
    @Req() req: { user?: { id: string } },
    @Param('id') _uploadId: string,
    @Body() body: unknown,
  ): Promise<{ results: Array<{ source: string; resolved: string }>; presets: Record<string, TransformRule[]> }> {
    if (!req.user) throw new UnauthorizedException();
    const parsed = TransformPreviewDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { tickers, rules } = parsed.data;
    const results = this.transform.transformBatch(tickers, rules as TransformRule[]);
    return { results, presets: PRESETS };
  }

  /**
   * Step 4b: Verify resolved tickers against Yahoo Finance.
   * Returns verification status for each ticker.
   */
  @Post(':id/verify-tickers')
  async verifyTickers(
    @Req() req: { user?: { id: string } },
    @Param('id') _uploadId: string,
    @Body() body: unknown,
  ): Promise<{ results: TransformResult[] }> {
    if (!req.user) throw new UnauthorizedException();
    const parsed = VerifyTickersDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const results = await this.transform.verifyTickers(parsed.data.tickers);
    return { results };
  }

  /**
   * Step 5: Save — create portfolio (if needed), broker, transform rules, and holdings.
   * Uses the new dual-ticker schema (source_ticker + resolved_ticker).
   */
  @Post(':id/save')
  async save(
    @Req() req: { user?: { id: string } },
    @Param('id') uploadId: string,
    @Body() body: unknown,
  ): Promise<{ portfolioId: string; brokerId: string; holdingsCreated: number }> {
    if (!req.user) throw new UnauthorizedException();
    const parsed = SaveDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { brokerName, exchangeDefault, sheetName, rows, cols, columnMapping, transformRules, tickerMap } = parsed.data;
    const rowIndices = parseRangeExpr(rows);
    const colIndices = parseRangeExpr(cols);

    // Re-extract the data to ensure consistency
    const data = this.svc.extractByIndices(uploadId, req.user.id, sheetName, rowIndices, colIndices);
    if (!data) throw new BadRequestException('Upload session expired or sheet not found');

    return this.svc.saveWithNewSchema(
      uploadId,
      req.user.id,
      brokerName,
      exchangeDefault,
      columnMapping,
      transformRules as TransformRule[],
      data,
      tickerMap,
    );
  }

  /**
   * Utility: Get available transform presets.
   */
  @Get('presets')
  getPresets(): Record<string, TransformRule[]> {
    return PRESETS;
  }
}
