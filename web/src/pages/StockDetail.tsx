/**
 * Stock detail page — Google Finance-style.
 *
 *   Title row:           Reliance Industries Limited (NSE: RELIANCE.NS)
 *   Price hero:          ₹1,321.20  +29.30 (+2.21%)  Today
 *   Range tabs:          [1D] [5D] [1M] [6M] [1Y] [5Y] [Max]
 *   Chart                — SVG line chart, prevClose dotted reference
 *
 *   Left col (chart) | Right col (key stats)
 *                    |   Previous Close
 *                    |   Day Range
 *                    |   Year Range
 *                    |   Market Cap
 *                    |   PE Ratio
 *                    |   Website
 *                    |   Sector / Industry
 *
 *   News section at the bottom.
 *
 *   Add to Watchlist button (opens reusable modal).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  formatMoney,
  formatPct,
  formatSignedMoney,
  trendClass,
} from '@/lib/format';
import StockChart from '@/components/StockChart';
import Modal from '@/components/Modal';

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
  peRatio: number | null;
  marketCap: number | null;
  website: string | null;
  sector: string | null;
  industry: string | null;
}

interface ChartSeries {
  ticker: string;
  range: Range;
  currency: string;
  points: Array<{ t: number; close: number | null }>;
  prevClose: number | null;
}

interface NewsItem {
  title: string;
  publisher: string;
  publishedAt: number;
  link: string;
}

interface WatchlistRow {
  id: string;
  name: string;
  itemCount: number;
}

export default function StockDetail() {
  const { ticker = '' } = useParams<{ ticker: string }>();
  const t = ticker.toUpperCase();
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>('1d');
  const [addOpen, setAddOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  // When the user hovers a chart point, the hero price block flips to show
  // that point's value rather than the live LTP.
  const [hoverPoint, setHoverPoint] = useState<{ t: number; close: number } | null>(null);

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['stock', 'detail', t],
    queryFn: () => api<StockDetail>(`/quotes/${encodeURIComponent(t)}`),
    refetchInterval: 30_000,
  });

  const { data: chart } = useQuery({
    queryKey: ['stock', 'chart', t, range],
    queryFn: () =>
      api<ChartSeries>(`/quotes/${encodeURIComponent(t)}/chart?range=${range}`),
    refetchInterval: 60_000,
  });

  const { data: news = [] } = useQuery({
    queryKey: ['stock', 'news', t],
    queryFn: () => api<NewsItem[]>(`/quotes/${encodeURIComponent(t)}/news?limit=10`),
    refetchInterval: 5 * 60_000,
  });

  const { data: watchlists = [] } = useQuery({
    queryKey: ['watchlists'],
    queryFn: () => api<WatchlistRow[]>('/watchlists'),
  });

  const addMut = useMutation({
    mutationFn: (vars: { watchlistId: string; ticker: string }) =>
      api(`/watchlists/${vars.watchlistId}/items`, { body: { ticker: vars.ticker } }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['watchlist', vars.watchlistId] });
      qc.invalidateQueries({ queryKey: ['watchlists'] });
      setAddOpen(false);
      setTargetId('');
    },
  });

  // ── Range-aware hero values ───────────────────────────────────────────────
  // (Hook MUST run before any early-return so the hook count stays stable
  // across renders — see React's Rules of Hooks.)
  //
  // For 1D we use the API's `prevClose` (yesterday's close) as the baseline.
  // For longer ranges we anchor on the FIRST data point in the chart series,
  // which is exactly how Yahoo / Google Finance compute "5D / 6M / 1Y" change.
  // When the user is hovering a point, the displayed price flips to that
  // point's close — change is recomputed against the same baseline so the
  // hero stays internally consistent.
  const heroValues = useMemo(() => {
    if (!detail) {
      return { price: 0, change: 0, changePct: 0, baseline: 0 };
    }
    const validPoints =
      chart?.points.filter((p): p is { t: number; close: number } => p.close != null) ?? [];

    const baseline =
      range === '1d'
        ? detail.prevClose // yesterday's close
        : validPoints.length > 0
          ? validPoints[0]!.close
          : detail.prevClose;

    const liveOrHover = hoverPoint?.close ?? detail.currentPrice;
    const change = liveOrHover - baseline;
    const changePct = baseline === 0 ? 0 : change / baseline;
    return {
      price: liveOrHover,
      change,
      changePct,
      baseline,
    };
  }, [chart, range, detail, hoverPoint]);

  if (isLoading) {
    return <div className="p-6 text-sm text-ink-muted">Loading {t}…</div>;
  }
  if (error || !detail) {
    return (
      <div className="p-6 text-sm text-loss">
        Couldn't load {t}: {(error as Error)?.message ?? 'unknown error'}
      </div>
    );
  }

  const cur = detail.currency === 'USD' ? 'USD' : 'INR';

  const rangeLabel = (r: Range) =>
    r === '1d' ? 'Today' : r === '1mo' ? '1M' : r === '5d' ? '5D' : r.toUpperCase();

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      {/* ─── Header ─── */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-2xs text-ink-muted uppercase tracking-wider">
            {detail.exchange}: {detail.ticker}
          </div>
          <h1 className="text-xl font-semibold truncate">{detail.longName}</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setAddOpen(true);
            setTargetId(watchlists[0]?.id ?? '');
          }}
          className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 shrink-0"
        >
          + Add to Watchlist
        </button>
      </header>

      {/* ─── Hero price ─── */}
      <section className="card p-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-3xl font-semibold num">
            {heroValues.price > 0
              ? formatMoney(heroValues.price.toFixed(4), cur)
              : '—'}
          </div>
          <div className={cn('text-sm num', trendClass(heroValues.change.toString()))}>
            {heroValues.price > 0 && heroValues.baseline > 0 ? (
              <>
                {formatSignedMoney(heroValues.change.toFixed(4), cur)} (
                {formatPct(heroValues.changePct.toString())})
                <span className="text-2xs text-ink-muted ml-1">
                  {hoverPoint ? '' : rangeLabel(range)}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* Range tabs */}
        <div className="mt-4 flex gap-1 border-b border-line/60">
          {RANGE_BUTTONS.map((rb) => (
            <button
              key={rb.key}
              type="button"
              onClick={() => setRange(rb.key)}
              className={cn(
                'px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors',
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
        <div className="mt-3">
          {chart ? (
            <StockChart
              points={chart.points}
              range={range}
              currency={cur}
              // Reference line: only meaningful on 1D (prev close).  For longer
              // ranges the line would always be the same as the first point.
              reference={range === '1d' ? chart.prevClose : null}
              onHover={(p) => setHoverPoint(p)}
              height={300}
            />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-xs text-ink-muted">
              Loading chart…
            </div>
          )}
        </div>
      </section>

      {/* ─── Key stats ─── */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat
          label="Previous Close"
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
              ? `${formatMoney(detail.dayLow.toFixed(4), cur)} – ${formatMoney(
                  detail.dayHigh.toFixed(4),
                  cur,
                )}`
              : '—'
          }
        />
        <Stat
          label="Year Range"
          value={
            detail.yearLow != null && detail.yearHigh != null
              ? `${formatMoney(detail.yearLow.toFixed(4), cur)} – ${formatMoney(
                  detail.yearHigh.toFixed(4),
                  cur,
                )}`
              : '—'
          }
        />
        <Stat
          label="Market Cap"
          value={detail.marketCap != null ? humanCap(detail.marketCap, cur) : '—'}
          {...(detail.marketCap == null && {
            hint: 'Not available without Yahoo auth',
          })}
        />
        <Stat
          label="PE Ratio"
          value={detail.peRatio != null ? detail.peRatio.toFixed(2) : '—'}
          {...(detail.peRatio == null && {
            hint: 'Not available without Yahoo auth',
          })}
        />
        <Stat
          label="Website"
          value={
            detail.website ? (
              <a
                href={detail.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline truncate"
              >
                {prettyHost(detail.website)}
              </a>
            ) : (
              '—'
            )
          }
        />
      </section>

      {/* ─── News ─── */}
      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-line/60">
          <h2 className="text-sm font-semibold">In the news</h2>
        </div>
        {news.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">
            No recent news for {detail.ticker}.
          </p>
        ) : (
          <ul className="divide-y divide-line/40">
            {news.map((n) => (
              <li key={n.link} className="px-4 py-3 hover:bg-line/20">
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:text-accent line-clamp-2"
                >
                  {n.title}
                </a>
                <div className="text-2xs text-ink-muted mt-1 flex flex-wrap items-center gap-2">
                  <span>{n.publisher || 'Yahoo Finance'}</span>
                  {n.publishedAt > 0 && (
                    <>
                      <span>·</span>
                      <span>{relativeTime(n.publishedAt)}</span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Add-to-watchlist modal ─── */}
      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setTargetId('');
        }}
        title="Add to Watchlist"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setTargetId('');
              }}
              className="px-3 py-1.5 rounded-md text-sm text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                targetId &&
                addMut.mutate({ watchlistId: targetId, ticker: detail.ticker })
              }
              disabled={!targetId || addMut.isPending}
              className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
            >
              {addMut.isPending ? 'Adding…' : 'Add'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-bg-soft border border-accent/40 rounded-md px-3 py-2 text-sm">
            <span className="font-medium">{detail.longName}</span>{' '}
            <span className="text-ink-muted">({detail.ticker})</span>
          </div>
          {watchlists.length === 0 ? (
            <p className="text-2xs text-ink-muted">
              No watchlists yet —{' '}
              <Link to="/watchlists" className="text-accent hover:underline">
                create one
              </Link>{' '}
              first.
            </p>
          ) : (
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
              autoFocus
            >
              {watchlists.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.itemCount})
                </option>
              ))}
            </select>
          )}
          {addMut.error && (
            <p className="text-2xs text-loss">{(addMut.error as Error).message}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────
function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="card p-3">
      <div className="text-2xs uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="text-sm num font-medium mt-1 truncate" title={hint}>
        {value}
      </div>
      {hint && <div className="text-2xs text-ink-muted mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function humanCap(n: number, cur: 'INR' | 'USD'): string {
  if (cur === 'INR') {
    if (n >= 1e12) return `₹${(n / 1e12).toFixed(2)} T`;
    if (n >= 1e9) return `₹${(n / 1e9).toFixed(2)} B`;
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return `₹${n.toFixed(0)}`;
  }
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)} M`;
  return `$${n.toFixed(0)}`;
}

function prettyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function relativeTime(epoch: number): string {
  if (!epoch) return '';
  const diff = Math.max(0, Date.now() / 1000 - epoch);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
