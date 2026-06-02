/**
 * Inline stock detail pane shown next to the watchlist table when the user
 * clicks a row.  Same data sources as the standalone /stock/:ticker page,
 * but rendered compactly (no news, no key-stats grid — those live on the
 * full page).  A "↗ Open full view" link jumps to /stock/:ticker.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  formatMoney,
  formatPct,
  formatSignedMoney,
  trendClass,
} from '@/lib/format';
import StockChart from '@/components/StockChart';

type Range = '1d' | '5d' | '1mo' | '6mo' | '1y' | '5y' | 'max';
const RANGE_BUTTONS: Array<{ key: Range; label: string }> = [
  { key: '1d', label: '1D' },
  { key: '5d', label: '5D' },
  { key: '1mo', label: '1M' },
  { key: '6mo', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '5y', label: '5Y' },
  { key: 'max', label: 'MAX' },
];

interface StockDetail {
  ticker: string;
  longName: string;
  shortName: string;
  exchange: string;
  currency: string;
  currentPrice: number;
  prevClose: number;
  dayChange: number;
  dayChangePct: number;
  dayHigh: number | null;
  dayLow: number | null;
  yearHigh: number | null;
  yearLow: number | null;
}
interface ChartSeries {
  ticker: string;
  range: Range;
  currency: string;
  points: Array<{ t: number; close: number | null }>;
  prevClose: number | null;
}

interface Props {
  ticker: string;
  onClose: () => void;
}

export default function WatchlistStockPane({ ticker, onClose }: Props) {
  const [range, setRange] = useState<Range>('1d');
  const [hoverPoint, setHoverPoint] = useState<{ t: number; close: number } | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['stock', 'detail', ticker],
    queryFn: () => api<StockDetail>(`/quotes/${encodeURIComponent(ticker)}`),
    refetchInterval: 30_000,
  });
  const { data: chart } = useQuery({
    queryKey: ['stock', 'chart', ticker, range],
    queryFn: () =>
      api<ChartSeries>(`/quotes/${encodeURIComponent(ticker)}/chart?range=${range}`),
    refetchInterval: 60_000,
  });

  // Range-aware hero — same logic as the full StockDetail page.
  const hero = useMemo(() => {
    if (!detail) return { price: 0, change: 0, changePct: 0, baseline: 0 };
    const valid =
      chart?.points.filter((p): p is { t: number; close: number } => p.close != null) ?? [];
    const baseline =
      range === '1d'
        ? detail.prevClose
        : valid.length > 0
          ? valid[0]!.close
          : detail.prevClose;
    const liveOrHover = hoverPoint?.close ?? detail.currentPrice;
    const change = liveOrHover - baseline;
    const changePct = baseline === 0 ? 0 : change / baseline;
    return { price: liveOrHover, change, changePct, baseline };
  }, [chart, range, detail, hoverPoint]);

  const cur = detail?.currency === 'USD' ? 'USD' : 'INR';
  const rangeLabel = (r: Range) =>
    r === '1d' ? 'Today' : r === '1mo' ? '1M' : r === '5d' ? '5D' : r.toUpperCase();

  return (
    <aside className="card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="px-4 py-3 border-b border-line/60 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {detail ? (
            <>
              <div className="text-2xs text-ink-muted uppercase tracking-wider">
                {detail.exchange}: {detail.ticker}
              </div>
              <h2 className="text-sm font-semibold truncate">{detail.longName}</h2>
            </>
          ) : (
            <div className="text-sm text-ink-muted">{ticker}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            to={`/stock/${encodeURIComponent(ticker)}`}
            title="Open full stock detail page"
            className="text-2xs text-ink-muted hover:text-accent px-1.5"
          >
            ↗
          </Link>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="w-6 h-6 flex items-center justify-center rounded-md text-ink-muted hover:bg-line/40 hover:text-ink"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {isLoading || !detail ? (
          <div className="text-sm text-ink-muted">Loading…</div>
        ) : (
          <>
            {/* Hero price */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <div className="text-2xl font-semibold num">
                {hero.price > 0 ? formatMoney(hero.price.toFixed(4), cur) : '—'}
              </div>
              <div
                className={cn(
                  'text-xs num',
                  trendClass(hero.change.toString()),
                )}
              >
                {hero.price > 0 && hero.baseline > 0 ? (
                  <>
                    {formatSignedMoney(hero.change.toFixed(4), cur)} (
                    {formatPct(hero.changePct.toString())})
                    <span className="text-2xs text-ink-muted ml-1">
                      {hoverPoint ? '' : rangeLabel(range)}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {/* Range tabs */}
            <div className="flex gap-1 border-b border-line/60">
              {RANGE_BUTTONS.map((rb) => (
                <button
                  key={rb.key}
                  type="button"
                  onClick={() => setRange(rb.key)}
                  className={cn(
                    'px-2 py-1 text-2xs border-b-2 -mb-px transition-colors',
                    range === rb.key
                      ? 'text-accent border-accent'
                      : 'text-ink-muted border-transparent hover:text-ink',
                  )}
                >
                  {rb.label}
                </button>
              ))}
            </div>

            {/* Chart */}
            {chart ? (
              <StockChart
                points={chart.points}
                range={range}
                currency={cur}
                reference={range === '1d' ? chart.prevClose : null}
                onHover={(p) => setHoverPoint(p)}
                height={260}
              />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-xs text-ink-muted">
                Loading chart…
              </div>
            )}

            {/* Compact key stats */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line/40">
              <Stat
                label="Prev Close"
                value={
                  detail.prevClose
                    ? formatMoney(detail.prevClose.toFixed(4), cur)
                    : '—'
                }
              />
              <Stat
                label="Day Range"
                value={
                  detail.dayLow != null && detail.dayHigh != null
                    ? `${formatMoney(detail.dayLow.toFixed(4), cur)} – ${formatMoney(detail.dayHigh.toFixed(4), cur)}`
                    : '—'
                }
              />
              <Stat
                label="52w Low"
                value={
                  detail.yearLow != null
                    ? formatMoney(detail.yearLow.toFixed(4), cur)
                    : '—'
                }
              />
              <Stat
                label="52w High"
                value={
                  detail.yearHigh != null
                    ? formatMoney(detail.yearHigh.toFixed(4), cur)
                    : '—'
                }
              />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="text-xs num font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}
