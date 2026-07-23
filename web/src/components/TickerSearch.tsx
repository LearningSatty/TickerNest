/**
 * TickerSearch — debounced autocomplete that calls /quotes/search.
 *
 * UX:
 *   • Min 2 chars before fetching.
 *   • 250 ms debounce on keystrokes.
 *   • Market filter (Indian / US) restricts results to relevant exchanges.
 *   • Arrow-keys navigate, Enter picks, Esc closes.
 *   • Click-outside closes.
 *
 * Returns the picked ticker (full Yahoo symbol incl. .NS / .BO suffix) so
 * the caller doesn't need to know the suffix conventions.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

export type Market = 'IN' | 'US' | 'OTHER';

/** Imperative handle exposed via ref — lets the parent focus the input
 *  programmatically (e.g. after a successful add, the watchlist page focuses
 *  the search box again so the user can type the next ticker). */
export interface TickerSearchHandle {
  focus: () => void;
}

interface SearchHit {
  ticker: string;
  name: string;
  exchange: string;
  quoteType: string;
}

interface Props {
  onPick: (hit: SearchHit) => void;
  /** Filter results to this market (default 'IN'). */
  market?: Market;
  placeholder?: string;
  autoFocus?: boolean;
  /** Reset the typed query after a successful pick (default true). */
  resetOnPick?: boolean;
}

/** Canonical exchange codes per market. The API normalises Yahoo's various
 *  exchange/exchDisp values down to these — see normaliseExchange in
 *  yahoo.provider.ts. For 'OTHER' we pass all results through unfiltered
 *  so the user can pick any global exchange (TYO, HKG, LON, etc.). */
const MARKET_EXCHANGES: Record<Market, ReadonlySet<string> | null> = {
  IN: new Set(['NSE', 'BSE']),
  US: new Set(['NASDAQ', 'NYSE', 'AMEX']),
  OTHER: null, // null = no filtering, show all results
};

const TickerSearch = forwardRef<TickerSearchHandle, Props>(function TickerSearch(
  {
    onPick,
    market = 'IN',
    placeholder = 'Search ticker (e.g. Reliance, Apollo Hospitals)',
    autoFocus,
    resetOnPick = true,
  },
  ref,
) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Expose imperative focus() to the parent. Selecting any existing text so
  // a quick second tab through the field is effortless.
  useImperativeHandle(
    ref,
    (): TickerSearchHandle => ({
      focus: () => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.select();
      },
    }),
    [],
  );

  // 250 ms debounce
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  // Fetch when debounced value changes
  useEffect(() => {
    let cancelled = false;
    if (debounced.length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    // Fetch a larger window from upstream so client-side filtering still
    // surfaces 10 relevant rows even when the picked market is in the
    // long tail of Yahoo's ranking.
    api<SearchHit[]>(`/quotes/search?q=${encodeURIComponent(debounced)}&limit=25`)
      .then((res) => {
        if (cancelled) return;
        setHits(res);
        setActive(0);
      })
      .catch(() => {
        if (cancelled) return;
        setHits([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // Click-outside to close dropdown
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (hit: SearchHit) => {
    onPick(hit);
    setOpen(false);
    if (resetOnPick) {
      setQ('');
      setDebounced('');
      setHits([]);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[active]) pick(hits[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showDropdown = open && (loading || hits.length > 0 || debounced.length >= 2);

  // Filter to the selected market and rank NSE > BSE within India.
  // For 'OTHER' market, no exchange filtering is applied — all hits pass.
  const ranked = useMemo(() => {
    const allow = MARKET_EXCHANGES[market];
    const filtered = allow
      ? hits.filter((h) => {
          const ex = (h.exchange ?? '').toUpperCase();
          return allow.has(ex);
        })
      : hits; // OTHER → show all exchanges
    const order: Record<string, number> = {
      NSE: 0, NSI: 0,
      BSE: 1, BSI: 1,
      NMS: 0, NASDAQ: 0,
      NYQ: 1, NYSE: 1,
    };
    return filtered
      .sort((a, b) => {
        const oa = order[a.exchange.toUpperCase()] ?? 9;
        const ob = order[b.exchange.toUpperCase()] ?? 9;
        return oa - ob;
      })
      .slice(0, 10);
  }, [hits, market]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
      />
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-auto bg-bg-soft border border-line rounded-md shadow-lg">
          {loading && hits.length === 0 && (
            <div className="px-3 py-2 text-2xs text-ink-muted">Searching…</div>
          )}
          {!loading && ranked.length === 0 && debounced.length >= 2 && (
            <div className="px-3 py-2 text-2xs text-ink-muted">No matches.</div>
          )}
          {ranked.map((h, i) => (
            <button
              key={h.ticker}
              type="button"
              onMouseDown={(e) => {
                // mousedown beats blur; otherwise input blur fires first and
                // we lose the click on the dropdown.
                e.preventDefault();
                pick(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-line/40',
                i === active && 'bg-line/40',
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{h.name}</div>
                <div className="text-2xs text-ink-muted">
                  {h.ticker} · {h.exchange || '—'}
                </div>
              </div>
              <span className="chip text-2xs bg-bg text-ink-muted">{h.quoteType}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default TickerSearch;
