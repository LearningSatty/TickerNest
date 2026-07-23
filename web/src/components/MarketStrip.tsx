/**
 * MarketStrip — global indices + breadth bar.
 * Mounted in AppShell so it shows on every page (compact variant).
 *
 *   ┌──────────────┬──────────────┬───┬──────────────┐
 *   │  NIFTY 50    │  NIFTY BANK  │ … │  ADV / DEC   │
 *   │  23,547.75   │  54,239.20   │   │     1.4      │
 *   │  -29.30 -2%  │  -614.65 -1% │   │   ▰▰▱  ▼ 10  │
 *   └──────────────┴──────────────┴───┴──────────────┘
 *
 * Refreshes every 30s.  When the scroller has more cards than visible space,
 * a chevron button on the right scrolls one viewport-worth.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatPct, formatMoney, formatSignedMoney, trendClass } from '@/lib/format';
import { getMarketCards } from '@/pages/Settings';
import type { MarketCard } from '@/pages/Settings';

interface IndexQuote {
  ticker: string;
  label: string;
  currentPrice: string;
  prevClose: string;
  dayChange: string;
  dayChangePct: string;
  currency: string;
}
interface BreadthSummary {
  advances: number;
  declines: number;
  unchanged: number;
  total: number;
  ratio: string | null;
  source: 'watchlist' | 'empty';
}
interface MarketSnapshot {
  indices: IndexQuote[];
  breadth: BreadthSummary;
}

interface MarketStripProps {
  /** Compact variant strips the card chrome — for the global top bar. */
  compact?: boolean;
}

/** Detail shape returned by GET /quotes/:ticker */
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
}

export default function MarketStrip({ compact = false }: MarketStripProps = {}) {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['market', 'snapshot'],
    queryFn: () => api<MarketSnapshot>('/market/snapshot'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Read user's enabled cards from settings (only show selected ones)
  const enabledCards: MarketCard[] = useMemo(() => {
    const cards = getMarketCards();
    return cards.filter((c) => c.enabled);
  }, [data]); // re-read on each data refresh to pick up settings changes

  // Identify tickers that are NOT in the snapshot (custom user-added tickers)
  const customTickers = useMemo(() => {
    if (!data?.indices) return enabledCards.map((c) => c.ticker);
    const snapshotSet = new Set(data.indices.map((ix) => ix.ticker));
    return enabledCards
      .map((c) => c.ticker)
      .filter((t) => !snapshotSet.has(t));
  }, [data, enabledCards]);

  // Fetch individual quotes for custom tickers via /quotes/:ticker
  const { data: customQuotes } = useQuery({
    queryKey: ['market', 'custom-quotes', customTickers],
    queryFn: async () => {
      if (customTickers.length === 0) return {};
      const results: Record<string, StockDetail> = {};
      // Fetch in parallel (max 10 at a time to avoid flooding)
      const batches = [];
      for (let i = 0; i < customTickers.length; i += 10) {
        batches.push(customTickers.slice(i, i + 10));
      }
      for (const batch of batches) {
        const fetched = await Promise.allSettled(
          batch.map((t) => api<StockDetail>(`/quotes/${encodeURIComponent(t)}`)),
        );
        fetched.forEach((r, idx) => {
          if (r.status === 'fulfilled' && r.value) {
            results[batch[idx]] = r.value;
          }
        });
      }
      return results;
    },
    enabled: customTickers.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Build a unified quote map: snapshot indices + custom fetched quotes
  const quoteMap = useMemo(() => {
    const m = new Map<string, IndexQuote>();
    // From market snapshot
    if (data?.indices) {
      for (const ix of data.indices) {
        m.set(ix.ticker, ix);
      }
    }
    // From individual detail fetches (custom tickers)
    if (customQuotes) {
      for (const [ticker, detail] of Object.entries(customQuotes)) {
        if (detail && !m.has(ticker)) {
          const changePct = detail.prevClose === 0 ? 0 : detail.dayChange / detail.prevClose;
          m.set(ticker, {
            ticker: detail.ticker,
            label: detail.shortName || detail.longName || ticker,
            currentPrice: detail.currentPrice.toFixed(4),
            prevClose: detail.prevClose.toFixed(4),
            dayChange: detail.dayChange.toFixed(4),
            dayChangePct: changePct.toFixed(6),
            currency: detail.currency || 'INR',
          });
        }
      }
    }
    return m;
  }, [data, customQuotes]);

  // Map enabled cards to their corresponding quotes (in user's chosen order)
  const visibleIndices: (IndexQuote | null)[] = useMemo(() => {
    return enabledCards.map((card) => quoteMap.get(card.ticker) ?? null);
  }, [enabledCards, quoteMap]);

  const onPickIndex = (ticker: string) => {
    nav(`/stock/${encodeURIComponent(ticker)}`);
  };

  const wrapperClass = compact
    ? 'flex items-stretch overflow-hidden w-full min-w-0'
    : 'card flex flex-col lg:flex-row lg:items-stretch overflow-hidden';

  // Horizontal scroll affordance — toggles visibility based on overflow.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft < max - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [data]);

  const scrollByOneViewport = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: 'smooth' });
  };

  // Both chevrons always rendered for a stable layout (matches the
  // screenshot reference).  Each button independently enables/disables
  // based on the user's current scroll position.

  return (
    <div className={wrapperClass}>
      {/* Index strip — horizontal scrollable.  Native scrollbar hidden via
          .no-scrollbar; user scrolls only via chevron buttons on the right. */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div ref={scrollRef} className="overflow-x-auto no-scrollbar">
          <div className="flex divide-x divide-line/60 min-w-max">
            {(isLoading && visibleIndices.length === 0
              ? Array.from({ length: 12 }, () => null)
              : visibleIndices
            ).map((ix, i) => (
              <IndexCell
                key={ix?.ticker ?? `placeholder-${i}`}
                ix={ix}
                loading={isLoading}
                compact={compact}
                onClick={onPickIndex}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Chevron group — sits between the cards and the breadth panel.
          Both buttons always render for stable layout; greyed out when
          their direction has no further content to scroll into. */}
      <div className="flex items-center gap-1 px-2 border-l border-line/60 shrink-0">
        <ChevronButton
          direction="left"
          disabled={!canScrollLeft}
          onClick={() => scrollByOneViewport(-1)}
        />
        <ChevronButton
          direction="right"
          disabled={!canScrollRight}
          onClick={() => scrollByOneViewport(1)}
        />
      </div>

      {/* Advance/Decline panel */}
      <div
        className={cn(
          'border-line/60 flex flex-col justify-center shrink-0',
          compact
            ? 'border-l px-3 py-1 min-w-[170px]'
            : 'border-t lg:border-t-0 lg:border-l px-4 py-2 lg:min-w-[200px]',
        )}
      >
        <BreadthPanel breadth={data?.breadth} loading={isLoading} />
      </div>
    </div>
  );
}

// ─── Round chevron button ────────────────────────────────────────────────────
function ChevronButton({
  direction,
  onClick,
  disabled,
}: {
  direction: 'left' | 'right';
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Scroll ${direction}`}
      className={cn(
        'w-7 h-7 rounded-full border border-line text-ink-muted',
        'flex items-center justify-center transition-colors text-base leading-none',
        disabled
          ? 'opacity-30 cursor-not-allowed'
          : 'hover:bg-line/60 hover:text-ink cursor-pointer',
      )}
    >
      {direction === 'left' ? '‹' : '›'}
    </button>
  );
}

// ─── Single index cell ───────────────────────────────────────────────────────
function IndexCell({
  ix,
  loading,
  compact,
  onClick,
}: {
  ix: IndexQuote | null;
  loading: boolean;
  compact?: boolean;
  onClick?: (ticker: string) => void;
}) {
  const padding = compact ? 'px-3 py-1' : 'px-4 py-2';
  // Each cell is wider now to accommodate the change row underneath.
  const minW = compact ? 'min-w-[150px]' : 'min-w-[160px]';

  if (!ix) {
    return (
      <div className={cn(padding, minW)}>
        <div className="text-2xs uppercase tracking-wider text-ink-muted">
          {loading ? '…' : '—'}
        </div>
        <div className="text-sm font-medium text-ink-muted">—</div>
      </div>
    );
  }
  const ltpZero = Number(ix.currentPrice) === 0;
  const cur = ix.currency === 'USD' ? 'USD' : 'INR';
  const clickable = !!onClick && !ltpZero;
  return (
    <button
      type="button"
      onClick={clickable ? () => onClick!(ix.ticker) : undefined}
      disabled={!clickable}
      title={clickable ? `Open ${ix.label} chart` : undefined}
      className={cn(
        padding,
        minW,
        'text-left transition-colors',
        clickable
          ? 'hover:bg-line/40 cursor-pointer focus-visible:bg-line/40 focus-visible:outline-none'
          : 'cursor-default',
      )}
    >
      <div className="text-2xs uppercase tracking-wider text-ink-muted truncate">
        {ix.label}
      </div>
      {ltpZero ? (
        <div className="text-sm text-ink-muted">—</div>
      ) : (
        <>
          <div className="text-sm num font-medium leading-tight">
            {formatMoney(ix.currentPrice, cur)}
          </div>
          <div
            className={cn(
              'text-2xs num leading-tight whitespace-nowrap',
              trendClass(ix.dayChange),
            )}
          >
            {formatSignedMoney(ix.dayChange, cur)}{' '}
            <span className="opacity-90">({formatPct(ix.dayChangePct)})</span>
          </div>
        </>
      )}
    </button>
  );
}

// ─── Advance / Decline panel ─────────────────────────────────────────────────
function BreadthPanel({
  breadth,
  loading,
}: {
  breadth: BreadthSummary | undefined;
  loading: boolean;
}) {
  if (loading || !breadth) {
    return (
      <div className="text-2xs text-ink-muted">Loading breadth…</div>
    );
  }
  if (breadth.source === 'empty') {
    return (
      <div className="text-2xs text-ink-muted">
        Add tickers to see today's
        <br /> advance / decline ratio.
      </div>
    );
  }
  const { advances, declines, unchanged, total, ratio } = breadth;
  const advPct = total === 0 ? 0 : (advances / total) * 100;
  const decPct = total === 0 ? 0 : (declines / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-2xs uppercase tracking-wider text-ink-muted">
          Adv / Dec
        </span>
        <span className="text-sm font-semibold num">
          {ratio ?? '∞'}
        </span>
      </div>
      <div className="h-1.5 rounded overflow-hidden flex bg-line/40">
        <div className="bg-gain" style={{ width: `${advPct}%` }} title={`${advances} advancing`} />
        <div className="bg-loss" style={{ width: `${decPct}%` }} title={`${declines} declining`} />
      </div>
      <div className="flex justify-between text-2xs">
        <span className="text-gain num">▲ {advances}</span>
        <span className="text-ink-muted num">— {unchanged}</span>
        <span className="text-loss num">▼ {declines}</span>
      </div>
    </div>
  );
}
