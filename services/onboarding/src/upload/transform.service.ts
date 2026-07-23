/**
 * Ticker Transform Service — applies transformation rules to source tickers
 * and verifies them against Yahoo Finance.
 *
 * Rule types:
 *   UPPERCASE       → convert to upper case
 *   STRIP_PREFIX    → remove known prefixes (e.g., "NSE:", "BOM:")
 *   STRIP_SUFFIX   → remove known suffixes (e.g., "-EQ", "-BE")
 *   APPEND_SUFFIX   → add suffix (e.g., ".NS", ".BO")
 *   REGEX_REPLACE   → pattern-based replacement
 */
import { Injectable, Logger } from '@nestjs/common';

export interface TransformRule {
  kind: 'UPPERCASE' | 'STRIP_PREFIX' | 'STRIP_SUFFIX' | 'APPEND_SUFFIX' | 'REGEX_REPLACE';
  config: Record<string, unknown>;
}

export interface TransformResult {
  sourceTicker: string;
  resolvedTicker: string;
  status: 'VERIFIED' | 'UNVERIFIED' | 'FAILED';
  canonicalName?: string;
}

/** Default preset rules for common sources */
export const PRESETS: Record<string, TransformRule[]> = {
  'google-sheets-india': [
    { kind: 'UPPERCASE', config: {} },
    { kind: 'APPEND_SUFFIX', config: { suffix: '.NS' } },
  ],
  'groww': [
    { kind: 'STRIP_SUFFIX', config: { suffixes: ['-EQ', '-BE'] } },
    { kind: 'UPPERCASE', config: {} },
    { kind: 'APPEND_SUFFIX', config: { suffix: '.NS' } },
  ],
  'kite': [
    { kind: 'UPPERCASE', config: {} },
    // Kite exports already include exchange info; no suffix needed
  ],
  'us-stocks': [
    { kind: 'UPPERCASE', config: {} },
    // US tickers don't need suffix for Yahoo
  ],
  'angel-one': [
    { kind: 'STRIP_SUFFIX', config: { suffixes: ['-EQ'] } },
    { kind: 'UPPERCASE', config: {} },
    { kind: 'APPEND_SUFFIX', config: { suffix: '.NS' } },
  ],
};

@Injectable()
export class TransformService {
  private readonly log = new Logger(TransformService.name);

  /**
   * Apply transformation rules to a single ticker.
   */
  applyRules(sourceTicker: string, rules: TransformRule[]): string {
    let result = sourceTicker.trim();
    for (const rule of rules) {
      result = this.applyOneRule(result, rule);
    }
    return result;
  }

  /**
   * Apply rules to a batch of tickers and return results.
   */
  transformBatch(tickers: string[], rules: TransformRule[]): Array<{ source: string; resolved: string }> {
    return tickers.map((t) => ({
      source: t,
      resolved: this.applyRules(t, rules),
    }));
  }

  /**
   * Verify tickers against Yahoo Finance search API.
   * Returns verification status for each ticker.
   */
  async verifyTickers(resolvedTickers: string[]): Promise<TransformResult[]> {
    const results: TransformResult[] = [];
    // Process in batches of 3 to avoid rate limiting
    const BATCH = 3;
    for (let i = 0; i < resolvedTickers.length; i += BATCH) {
      const batch = resolvedTickers.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (ticker) => {
          try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
            const res = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0 (TickerNest)' },
            });
            if (!res.ok) {
              return { sourceTicker: ticker, resolvedTicker: ticker, status: 'FAILED' as const };
            }
            const body = (await res.json()) as {
              chart?: { result?: Array<{ meta?: Record<string, unknown> }> };
            };
            const meta = body.chart?.result?.[0]?.meta;
            if (!meta || !meta['regularMarketPrice']) {
              return { sourceTicker: ticker, resolvedTicker: ticker, status: 'FAILED' as const };
            }
            const name = (meta['longName'] as string) ?? (meta['shortName'] as string) ?? ticker;
            return {
              sourceTicker: ticker,
              resolvedTicker: ticker,
              status: 'VERIFIED' as const,
              canonicalName: name,
            };
          } catch {
            return { sourceTicker: ticker, resolvedTicker: ticker, status: 'UNVERIFIED' as const };
          }
        }),
      );
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * Full pipeline: transform + verify a batch of source tickers.
   */
  async transformAndVerify(
    sourceTickers: string[],
    rules: TransformRule[],
  ): Promise<TransformResult[]> {
    const transformed = this.transformBatch(sourceTickers, rules);
    const resolvedTickers = transformed.map((t) => t.resolved);
    const verifications = await this.verifyTickers(resolvedTickers);

    return transformed.map((t, i) => ({
      sourceTicker: t.source,
      resolvedTicker: t.resolved,
      status: verifications[i]?.status ?? 'UNVERIFIED',
      canonicalName: verifications[i]?.canonicalName,
    }));
  }

  private applyOneRule(ticker: string, rule: TransformRule): string {
    switch (rule.kind) {
      case 'UPPERCASE':
        return ticker.toUpperCase();

      case 'STRIP_PREFIX': {
        const prefixes = (rule.config['prefixes'] as string[]) ?? [];
        for (const p of prefixes) {
          if (ticker.startsWith(p)) {
            ticker = ticker.slice(p.length);
            break;
          }
        }
        return ticker;
      }

      case 'STRIP_SUFFIX': {
        const suffixes = (rule.config['suffixes'] as string[]) ?? [];
        for (const s of suffixes) {
          if (ticker.endsWith(s)) {
            ticker = ticker.slice(0, -s.length);
            break;
          }
        }
        return ticker;
      }

      case 'APPEND_SUFFIX': {
        const suffix = (rule.config['suffix'] as string) ?? '';
        if (suffix && !ticker.endsWith(suffix)) {
          return ticker + suffix;
        }
        return ticker;
      }

      case 'REGEX_REPLACE': {
        const pattern = rule.config['pattern'] as string;
        const replacement = (rule.config['replacement'] as string) ?? '';
        if (pattern) {
          try {
            const re = new RegExp(pattern);
            return ticker.replace(re, replacement);
          } catch {
            return ticker; // Invalid regex → no-op
          }
        }
        return ticker;
      }

      default:
        return ticker;
    }
  }
}
