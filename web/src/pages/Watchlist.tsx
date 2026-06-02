/**
 * Watchlist detail.
 *
 * Sections are first-class:
 *   • "+ Create new section…" in the dropdown opens a modal where the user
 *     types a section name. The empty section appears in the table immediately
 *     after creation, ready to receive items.
 *   • Drag-and-drop: any row can be dragged onto a section header (or onto
 *     the "Ungrouped" header) to move it. PATCH /items/:ticker updates the
 *     section_name in one round-trip; the page invalidates and re-renders.
 *
 * Render order: Ungrouped first, then sections in user-defined order
 * (the array stored on watchlist.sections).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  formatMoney,
  formatPct,
  formatSignedMoney,
  trendClass,
} from '@/lib/format';
import TickerSearch, { Market, TickerSearchHandle } from '@/components/TickerSearch';
import Modal from '@/components/Modal';
import WatchlistStockPane from '@/components/WatchlistStockPane';

interface WatchlistItem {
  ticker: string;
  name: string;
  sectionName: string | null;
  position: number;
  currentPrice: string;
  prevClose: string;
  dayChange: string;
  dayChangePct: string;
  currency: 'INR' | 'USD' | string;
}
interface WatchlistDetail {
  id: string;
  name: string;
  market: 'IN' | 'US';
  sections: string[];
  items: WatchlistItem[];
}

const UNGROUPED_KEY = '__ungrouped__';

type SortColumn = 'symbol' | 'currentPrice' | 'dayChange' | 'dayChangePct';
type SortDir = 'asc' | 'desc';

const compareItems = (
  a: WatchlistItem,
  b: WatchlistItem,
  col: SortColumn,
  dir: SortDir,
): number => {
  const sign = dir === 'asc' ? 1 : -1;
  if (col === 'symbol') {
    // Sort by display name (what the user sees in the Symbol column).
    return sign * a.name.localeCompare(b.name);
  }
  // Numeric columns are wire-string Decimals; compare numerically without
  // losing precision for the sort.  toFixed/Number is fine for ranking.
  const av = Number(a[col]);
  const bv = Number(b[col]);
  if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
  if (Number.isNaN(av)) return 1; // NaN to bottom regardless of dir
  if (Number.isNaN(bv)) return -1;
  return sign * (av - bv);
};

interface WatchlistProps {
  /** When embedded (e.g. inside Watchlists hub), the parent passes the id;
   *  otherwise we read it from the URL params. */
  idOverride?: string;
}

export default function Watchlist({ idOverride }: WatchlistProps = {}) {
  const params = useParams<{ id: string }>();
  const id = idOverride ?? params.id;
  const qc = useQueryClient();
  const [market, setMarket] = useState<Market>('IN');
  // Whether the user has manually overridden the market filter for this
  // watchlist's add-row.  If false, we keep it synced with the watchlist's
  // saved `market` field so switching between an IN and a US watchlist
  // updates the search filter automatically.
  const [marketUserOverride, setMarketUserOverride] = useState(false);
  const [pickedTicker, setPickedTicker] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string>('');
  // Section to drop the picked ticker into. '' = no section (ungrouped).
  const [sectionChoice, setSectionChoice] = useState<string>('');
  const pickedRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<TickerSearchHandle | null>(null);

  // After a ticker is picked, give focus to the wrapper so Enter submits.
  useEffect(() => {
    if (pickedTicker) pickedRef.current?.focus();
  }, [pickedTicker]);

  // New-section dialog
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  // Drag state
  const [dragTicker, setDragTicker] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Inline stock-detail pane — set when user clicks a row.
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  // Reset selection if the user navigates to a different watchlist.
  useEffect(() => {
    setSelectedTicker(null);
  }, [id]);

  // View toggle: when sections are off, show a flat sortable list.
  const [groupBySection, setGroupBySection] = useState(true);
  const [sortCol, setSortCol] = useState<SortColumn>('symbol');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const onHeaderClick = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      // Sensible defaults: ASC for text, DESC for numbers (largest first).
      setSortDir(col === 'symbol' ? 'asc' : 'desc');
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['watchlist', id],
    queryFn: () => api<WatchlistDetail>(`/watchlists/${id}`),
    enabled: !!id,
    refetchInterval: 10_000,
  });

  // Adopt the watchlist's saved market (until the user overrides it).
  useEffect(() => {
    if (!data || marketUserOverride) return;
    setMarket(data.market);
  }, [data, marketUserOverride]);

  // Reset transient form state when navigating to a different watchlist.
  useEffect(() => {
    setMarketUserOverride(false);
    setSectionChoice('');
  }, [id]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['watchlist', id] });

  const addMut = useMutation({
    mutationFn: (vars: { ticker: string; sectionName?: string }) =>
      api(`/watchlists/${id}/items`, { body: vars }),
    onSuccess: () => {
      setPickedTicker(null);
      setPickedName('');
      // Keep the section selection — user is likely adding several stocks
      // to the same section in a row.
      invalidate();
      // Return focus to the search box so the user can immediately type the
      // next ticker.  We wait two animation frames: one for React to commit
      // the cleared `pickedTicker` state (which re-mounts <TickerSearch>),
      // and another for the ref to attach.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => searchRef.current?.focus()),
      );
    },
  });
  const removeMut = useMutation({
    mutationFn: (t: string) =>
      api(`/watchlists/${id}/items/${encodeURIComponent(t)}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const moveMut = useMutation({
    mutationFn: (vars: { ticker: string; sectionName: string | null }) =>
      api(`/watchlists/${id}/items/${encodeURIComponent(vars.ticker)}`, {
        method: 'PATCH',
        body: { sectionName: vars.sectionName },
      }),
    onSuccess: invalidate,
  });
  const addSectionMut = useMutation({
    mutationFn: (name: string) =>
      api<{ sections: string[] }>(`/watchlists/${id}/sections`, {
        body: { name },
      }),
    onSuccess: () => {
      setNewSectionOpen(false);
      setNewSectionName('');
      invalidate();
    },
  });
  const deleteSectionMut = useMutation({
    mutationFn: (name: string) =>
      api(`/watchlists/${id}/sections/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  });

  // Group items by section name.  Map preserves insertion order — we seed
  // it with UNGROUPED_KEY first, then every section in user-defined order,
  // so empty sections still show their header.
  const grouped = useMemo(() => {
    const out = new Map<string, WatchlistItem[]>();
    out.set(UNGROUPED_KEY, []);
    for (const s of data?.sections ?? []) out.set(s, []);
    for (const it of data?.items ?? []) {
      const k = it.sectionName ?? UNGROUPED_KEY;
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(it);
    }
    return out;
  }, [data]);

  // Flat sorted list for the "sections off" view. Doesn't depend on
  // section assignment so the user can rank by any column independently.
  const flatSorted = useMemo(() => {
    const items = [...(data?.items ?? [])];
    items.sort((a, b) => compareItems(a, b, sortCol, sortDir));
    return items;
  }, [data, sortCol, sortDir]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickedTicker) return;
    addMut.mutate({
      ticker: pickedTicker,
      ...(sectionChoice ? { sectionName: sectionChoice } : {}),
    });
  };

  const confirmNewSection = () => {
    const name = newSectionName.trim();
    if (!name) return;
    addSectionMut.mutate(name);
  };

  if (isLoading || !data) {
    return (
      <div className="p-6 text-sm text-ink-muted">
        {isLoading ? 'Loading…' : (
          <span className="text-loss">Watchlist not found</span>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{data.name}</h1>
          <p className="text-2xs text-ink-muted">
            {data.items.length} {data.items.length === 1 ? 'ticker' : 'tickers'} ·{' '}
            {data.sections.length} section{data.sections.length === 1 ? '' : 's'} ·
            live prices refresh every 10s
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* + Section — moved up near the export/import controls so all
              "watchlist-level" actions live in one row, separate from the
              per-row add-stock form below. */}
          <button
            type="button"
            onClick={() => setNewSectionOpen(true)}
            className="px-3 py-1.5 rounded-md border border-line text-xs hover:bg-line/40"
            title="Create a new section in this watchlist"
          >
            + Section
          </button>
          {/* Export */}
          <button
            type="button"
            onClick={async () => {
              const tok = sessionStorage.getItem('tn:jwt');
              const res = await fetch(
                `${import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'}/watchlists/${id}/export`,
                { headers: tok ? { Authorization: `Bearer ${tok}` } : {} },
              );
              if (!res.ok) {
                alert(`Export failed: HTTP ${res.status}`);
                return;
              }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${data.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
            className="px-3 py-1.5 rounded-md border border-line text-xs hover:bg-line/40"
            title="Export this watchlist's symbols to CSV"
          >
            ⬇ Export CSV
          </button>
          {/* Import — hidden input + label */}
          <label
            className="px-3 py-1.5 rounded-md border border-line text-xs hover:bg-line/40 cursor-pointer"
            title="Import symbols from a CSV"
          >
            ⬆ Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = ''; // allow re-importing same file
                if (!file) return;
                const text = await file.text();
                try {
                  const tok = sessionStorage.getItem('tn:jwt');
                  const res = await fetch(
                    `${import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'}/watchlists/${id}/import`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'text/csv',
                        ...(tok && { Authorization: `Bearer ${tok}` }),
                      },
                      body: text,
                    },
                  );
                  if (!res.ok) {
                    const body = await res.text();
                    alert(`Import failed: HTTP ${res.status}\n${body}`);
                    return;
                  }
                  const summary = (await res.json()) as {
                    added: number;
                    skipped: number;
                    errors: string[];
                  };
                  invalidate();
                  let msg = `Imported ${summary.added} new, skipped ${summary.skipped} existing.`;
                  if (summary.errors.length) {
                    msg += `\nErrors:\n${summary.errors.slice(0, 5).join('\n')}`;
                    if (summary.errors.length > 5) {
                      msg += `\n…and ${summary.errors.length - 5} more.`;
                    }
                  }
                  alert(msg);
                } catch (err) {
                  alert(`Import failed: ${(err as Error).message}`);
                }
              }}
            />
          </label>
          {/* Group toggle */}
          <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer select-none">
            <span>Group by section</span>
            <button
              type="button"
              role="switch"
              aria-checked={groupBySection}
              onClick={() => setGroupBySection((v) => !v)}
              className={cn(
                'w-9 h-5 rounded-full relative transition-colors',
                groupBySection ? 'bg-accent' : 'bg-line/60',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                  groupBySection ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </button>
          </label>
        </div>
      </header>

      {/* ─── Add row ─── */}
      <form onSubmit={onSubmit} className="card p-4 space-y-3 relative z-30">
        <div className="flex flex-col md:flex-row gap-2 items-end">
          <div className="md:w-[150px] w-full">
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">
              Market
            </label>
            <select
              value={market}
              onChange={(e) => {
                setMarket(e.target.value as Market);
                setMarketUserOverride(true);
                setPickedTicker(null);
                setPickedName('');
              }}
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option value="IN">🇮🇳 Indian</option>
              <option value="US">🇺🇸 US</option>
            </select>
          </div>
          <div className="flex-1 min-w-0 w-full">
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">
              Stock
            </label>
            {pickedTicker ? (
              <div
                ref={pickedRef}
                tabIndex={0}
                onKeyDown={(e) => {
                  // After picking, focus shifts here — Enter triggers form submit.
                  if (e.key === 'Enter' && pickedTicker && !addMut.isPending) {
                    e.preventDefault();
                    e.currentTarget.closest('form')?.requestSubmit();
                  }
                }}
                className="flex items-center justify-between bg-bg-soft border border-accent/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                <span className="truncate">
                  <span className="font-medium">{pickedName}</span>{' '}
                  <span className="text-ink-muted">({pickedTicker})</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPickedTicker(null);
                    setPickedName('');
                  }}
                  className="text-2xs text-ink-muted hover:text-ink shrink-0 ml-2"
                >
                  ✕ change
                </button>
              </div>
            ) : (
              <TickerSearch
                ref={searchRef}
                market={market}
                onPick={(h) => {
                  setPickedTicker(h.ticker);
                  setPickedName(h.name);
                }}
                placeholder={
                  market === 'IN'
                    ? 'Search NSE/BSE (e.g. Reliance, Apollo Hospitals)'
                    : 'Search US stocks (e.g. Apple, Microsoft)'
                }
              />
            )}
          </div>
          {/* Section selector — defaults to "no section" (top of list).
              When sections exist on the watchlist, the user can target one
              directly without needing a separate drag-drop step. */}
          <div className="md:w-[160px] w-full">
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">
              Section
            </label>
            <select
              value={sectionChoice}
              onChange={(e) => setSectionChoice(e.target.value)}
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option value="">None</option>
              {(data.sections ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!pickedTicker || addMut.isPending}
            className="md:w-auto w-full px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 shrink-0"
          >
            {addMut.isPending ? 'Adding…' : 'Add to Watchlist'}
          </button>
        </div>
        {addMut.error && (
          <p className="text-2xs text-loss">{(addMut.error as Error).message}</p>
        )}
      </form>

      {/* ─── Table + optional inline stock pane ─── */}
      <div
        className={cn(
          'grid gap-4 relative z-0',
          selectedTicker
            ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]'
            : 'grid-cols-1',
        )}
      >
        <div className="card overflow-hidden">
          <table className="table-pivot w-full">
            <thead>
              <tr>
                <SortHeader
                  col="symbol"
                  label="Symbol"
                  align="left"
                  sortable={!groupBySection}
                  activeCol={sortCol}
                  dir={sortDir}
                  onClick={onHeaderClick}
                />
                <SortHeader
                  col="currentPrice"
                  label="Last"
                  align="right"
                  sortable={!groupBySection}
                  activeCol={sortCol}
                  dir={sortDir}
                  onClick={onHeaderClick}
                />
                <SortHeader
                  col="dayChange"
                  label="Chg"
                  align="right"
                  sortable={!groupBySection}
                  activeCol={sortCol}
                  dir={sortDir}
                  onClick={onHeaderClick}
                />
                <SortHeader
                  col="dayChangePct"
                  label="Chg%"
                  align="right"
                  sortable={!groupBySection}
                  activeCol={sortCol}
                  dir={sortDir}
                  onClick={onHeaderClick}
                />
                <th />
              </tr>
            </thead>
            <tbody>
              {!groupBySection &&
                flatSorted.map((it) => (
                  <FlatRow
                    key={it.ticker}
                    item={it}
                    selected={selectedTicker === it.ticker}
                    onSelect={(t) =>
                      setSelectedTicker((cur) => (cur === t ? null : t))
                    }
                    onRemove={(t) => removeMut.mutate(t)}
                  />
                ))}
              {groupBySection && [...grouped.entries()].map(([key, items]) => (
                <SectionBlock
                  key={key}
                  sectionKey={key}
                  items={items}
                  selectedTicker={selectedTicker}
                  isDropTarget={dropTarget === key}
                  isDragging={!!dragTicker}
                  onSelect={(t) =>
                    setSelectedTicker((cur) => (cur === t ? null : t))
                  }
                  onDragStart={(t) => setDragTicker(t)}
                  onDragEnd={() => {
                    setDragTicker(null);
                    setDropTarget(null);
                  }}
                  onDragEnter={() => setDropTarget(key)}
                  onDrop={(targetKey) => {
                    if (!dragTicker) return;
                    const target = targetKey === UNGROUPED_KEY ? null : targetKey;
                    const cur = data.items.find((i) => i.ticker === dragTicker);
                    if (cur && (cur.sectionName ?? null) !== target) {
                      moveMut.mutate({ ticker: dragTicker, sectionName: target });
                    }
                    setDragTicker(null);
                    setDropTarget(null);
                  }}
                  onRemoveItem={(t) => removeMut.mutate(t)}
                  {...(key !== UNGROUPED_KEY && {
                    onDeleteSection: () => {
                      if (
                        confirm(
                          `Delete section "${key}"? Items will become ungrouped.`,
                        )
                      ) {
                        deleteSectionMut.mutate(key);
                      }
                    },
                  })}
                />
              ))}
              {data.items.length === 0 &&
                (groupBySection ? data.sections.length === 0 : true) && (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-ink-muted py-6">
                      Empty watchlist. Search for a stock above
                      {groupBySection ? ', or create a section to organise things.' : '.'}
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
        {selectedTicker && (
          <div className="lg:sticky lg:top-2 lg:self-start lg:max-h-[calc(100vh-7rem)]">
            <WatchlistStockPane
              ticker={selectedTicker}
              onClose={() => setSelectedTicker(null)}
            />
          </div>
        )}
      </div>

      {/* ─── New section dialog ─── */}
      <Modal
        open={newSectionOpen}
        onClose={() => {
          setNewSectionOpen(false);
          setNewSectionName('');
        }}
        title="Create New Section"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setNewSectionOpen(false);
                setNewSectionName('');
              }}
              className="px-3 py-1.5 rounded-md text-sm text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmNewSection}
              disabled={!newSectionName.trim() || addSectionMut.isPending}
              className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
            >
              {addSectionMut.isPending ? 'Creating…' : 'Create Section'}
            </button>
          </>
        }
      >
        <p className="text-2xs text-ink-muted mb-3">
          Sections group related stocks within a watchlist. After creating,
          you can drag any stock onto the section header to move it.
        </p>
        <input
          autoFocus
          value={newSectionName}
          onChange={(e) => setNewSectionName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmNewSection();
          }}
          placeholder='e.g. "Big Player"'
          className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        {addSectionMut.error && (
          <p className="text-2xs text-loss mt-2">
            {(addSectionMut.error as Error).message}
          </p>
        )}
      </Modal>
    </div>
  );
}

// ─── one section block (header row + rows) ──────────────────────────────────
function SectionBlock({
  sectionKey,
  items,
  selectedTicker,
  isDropTarget,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
  onRemoveItem,
  onDeleteSection,
}: {
  sectionKey: string;
  items: WatchlistItem[];
  selectedTicker: string | null;
  isDropTarget: boolean;
  isDragging: boolean;
  onSelect: (ticker: string) => void;
  onDragStart: (ticker: string) => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDrop: (targetKey: string) => void;
  onRemoveItem: (ticker: string) => void;
  onDeleteSection?: () => void;
}) {
  const isUngrouped = sectionKey === UNGROUPED_KEY;
  const empty = items.length === 0;
  // Dropzone styling — highlight when valid dropTarget during a drag.
  const dropClasses = cn(
    'transition-colors',
    isDragging && 'cursor-copy',
    isDropTarget && 'bg-accent/20',
  );
  return (
    <>
      {(!isUngrouped || items.length > 0) && (
        <tr
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            onDragEnter();
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(sectionKey);
          }}
          className={dropClasses}
        >
          <td
            colSpan={5}
            className={cn(
              'px-3 py-1.5 border-y border-line/40',
              isUngrouped
                ? 'bg-bg-soft/40 text-2xs text-ink-muted'
                : 'bg-line/30 text-2xs uppercase tracking-wider text-ink-muted',
            )}
          >
            <div className="flex items-center justify-between">
              <span>
                {isUngrouped ? 'UNGROUPED' : sectionKey}
                {empty && !isUngrouped && (
                  <span className="ml-2 text-2xs text-ink-muted/60">
                    — drop a stock here
                  </span>
                )}
              </span>
              {onDeleteSection && (
                <button
                  type="button"
                  onClick={onDeleteSection}
                  className="text-2xs text-ink-muted hover:text-loss"
                  title="Delete section"
                >
                  ✕ section
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
      {items.map((it) => (
        <tr
          key={it.ticker}
          draggable
          onClick={() => onSelect(it.ticker)}
          onDragStart={(e) => {
            onDragStart(it.ticker);
            e.dataTransfer.setData('text/plain', it.ticker);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={onDragEnd}
          onDragOver={(e) => {
            // Allow dropping on rows too — counts as dropping into this section.
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            onDragEnter();
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(sectionKey);
          }}
          className={cn(
            'cursor-pointer active:cursor-grabbing',
            isDragging && 'opacity-90',
            selectedTicker === it.ticker && 'bg-accent/15',
          )}
        >
          <td>
            <div className="text-sm truncate max-w-[280px]">{it.name}</div>
            <div className="text-2xs text-ink-muted">{it.ticker}</div>
          </td>
          <td className="text-right num">
            {formatMoney(it.currentPrice, it.currency === 'USD' ? 'USD' : 'INR')}
          </td>
          <td className={cn('text-right num', trendClass(it.dayChange))}>
            {formatSignedMoney(
              it.dayChange,
              it.currency === 'USD' ? 'USD' : 'INR',
            )}
          </td>
          <td className={cn('text-right num', trendClass(it.dayChangePct))}>
            {formatPct(it.dayChangePct)}
          </td>
          <td className="text-right">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Remove ${it.ticker}?`)) onRemoveItem(it.ticker);
              }}
              className="text-2xs text-ink-muted hover:text-loss px-2"
              title="Remove from watchlist"
            >
              ✕
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Sortable header cell ────────────────────────────────────────────────────
function SortHeader({
  col,
  label,
  align,
  sortable,
  activeCol,
  dir,
  onClick,
}: {
  col: SortColumn;
  label: string;
  align: 'left' | 'right';
  sortable: boolean;
  activeCol: SortColumn;
  dir: SortDir;
  onClick: (col: SortColumn) => void;
}) {
  const active = sortable && activeCol === col;
  const arrow = active ? (dir === 'asc' ? '▲' : '▼') : '';
  return (
    <th className={align === 'left' ? 'text-left' : 'text-right'}>
      {sortable ? (
        <button
          type="button"
          onClick={() => onClick(col)}
          className={cn(
            'inline-flex items-center gap-1 hover:text-ink',
            align === 'right' && 'flex-row-reverse',
            active && 'text-ink',
          )}
        >
          <span>{label}</span>
          <span className="text-2xs opacity-70">{arrow || '↕'}</span>
        </button>
      ) : (
        <span>{label}</span>
      )}
    </th>
  );
}

// ─── Flat (ungrouped) row used when section grouping is off ──────────────────
function FlatRow({
  item: it,
  selected,
  onSelect,
  onRemove,
}: {
  item: WatchlistItem;
  selected: boolean;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}) {
  return (
    <tr
      onClick={() => onSelect(it.ticker)}
      className={cn(
        'cursor-pointer',
        selected && 'bg-accent/15',
      )}
    >
      <td>
        <div className="text-sm truncate max-w-[280px]">{it.name}</div>
        <div className="text-2xs text-ink-muted">{it.ticker}</div>
      </td>
      <td className="text-right num">
        {formatMoney(it.currentPrice, it.currency === 'USD' ? 'USD' : 'INR')}
      </td>
      <td className={cn('text-right num', trendClass(it.dayChange))}>
        {formatSignedMoney(
          it.dayChange,
          it.currency === 'USD' ? 'USD' : 'INR',
        )}
      </td>
      <td className={cn('text-right num', trendClass(it.dayChangePct))}>
        {formatPct(it.dayChangePct)}
      </td>
      <td className="text-right">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Remove ${it.ticker}?`)) onRemove(it.ticker);
          }}
          className="text-2xs text-ink-muted hover:text-loss px-2"
          title="Remove from watchlist"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}
