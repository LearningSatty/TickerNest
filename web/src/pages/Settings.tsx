/**
 * Settings page — VS Code-style layout with a searchable category sidebar
 * on the left and the active setting panel on the right.
 *
 * Categories:
 *   1. Appearance — theme switching
 *   2. Layout Settings (expandable)
 *      2.1 Edit Marketplace Strip — CRUD for market strip cards
 *      2.2 Show Notes on Dashboard
 *      2.3 Show Calendar on Dashboard
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Theme, useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import { formatMoney, formatSignedMoney, formatPct, trendClass } from '@/lib/format';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SettingItem {
  id: string;
  label: string;
  parentId?: string;
  isGroup?: boolean;
}

/** A single card in the marketplace strip */
export interface MarketCard {
  id: string;
  ticker: string;
  label: string;
  currency: 'INR' | 'USD';
  enabled: boolean;
}

interface IndexQuote {
  ticker: string;
  label: string;
  currentPrice: string;
  prevClose: string;
  dayChange: string;
  dayChangePct: string;
  currency: string;
}

interface SearchHit {
  ticker: string;
  name: string;
  exchange: string;
  quoteType: string;
}

// ─── Settings tree definition ───────────────────────────────────────────────

const SETTINGS_TREE: SettingItem[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'layout', label: 'Layout Settings', isGroup: true },
  { id: 'layout.marketplace', label: 'Edit Marketplace Strip', parentId: 'layout' },
  { id: 'layout.notes', label: 'Show Notes on Dashboard', parentId: 'layout' },
  { id: 'layout.calendar', label: 'Show Calendar on Dashboard', parentId: 'layout' },
];

// ─── Default market cards (mirrors MARKET_INDICES from the backend) ─────────

const DEFAULT_MARKET_CARDS: MarketCard[] = [
  { id: '1', ticker: '^NSEI', label: 'NIFTY 50', currency: 'INR', enabled: true },
  { id: '2', ticker: '^NSEBANK', label: 'NIFTY BANK', currency: 'INR', enabled: true },
  { id: '3', ticker: 'NIFTY_MIDCAP_100.NS', label: 'NIFTY MIDCAP', currency: 'INR', enabled: true },
  { id: '4', ticker: '^CNXSC', label: 'NIFTY SMALLCAP', currency: 'INR', enabled: true },
  { id: '5', ticker: '^CNXIT', label: 'NIFTY IT', currency: 'INR', enabled: true },
  { id: '6', ticker: '^INDIAVIX', label: 'INDIA VIX', currency: 'INR', enabled: true },
  { id: '7', ticker: '^IXIC', label: 'NASDAQ', currency: 'USD', enabled: true },
  { id: '8', ticker: 'NQ=F', label: 'NASDAQ FUT', currency: 'USD', enabled: true },
  { id: '9', ticker: 'YM=F', label: 'DOW FUT', currency: 'USD', enabled: true },
  { id: '10', ticker: 'BZ=F', label: 'BRENT CRUDE', currency: 'USD', enabled: true },
  { id: '11', ticker: 'GC=F', label: 'GOLD', currency: 'USD', enabled: true },
  { id: '12', ticker: 'BTC-USD', label: 'BITCOIN', currency: 'USD', enabled: true },
];

// ─── LocalStorage helpers ───────────────────────────────────────────────────

const LS_KEYS = {
  showNotes: 'tn:layout-show-notes',
  showCalendar: 'tn:layout-show-calendar',
  marketCards: 'tn:market-cards',
} as const;

const MAX_CARDS_WARNING = 15;

function getBool(key: string, fallback = true): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === '1';
  } catch {
    return fallback;
  }
}

function setBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getMarketCards(): MarketCard[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.marketCards);
    if (!raw) return DEFAULT_MARKET_CARDS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_MARKET_CARDS;
  } catch {
    return DEFAULT_MARKET_CARDS;
  }
}

function saveMarketCards(cards: MarketCard[]) {
  try {
    localStorage.setItem(LS_KEYS.marketCards, JSON.stringify(cards));
  } catch {
    /* ignore */
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── Theme options ──────────────────────────────────────────────────────────

const THEME_OPTIONS: Array<{
  key: Theme;
  label: string;
  hint: string;
  preview: string;
}> = [
  {
    key: 'dark',
    label: 'Dark',
    hint: 'Default. Easier on the eyes during after-market hours.',
    preview: '🌙',
  },
  {
    key: 'light',
    label: 'Light',
    hint: 'Higher contrast for daytime use and bright displays.',
    preview: '☀️',
  },
  {
    key: 'system',
    label: 'Match system',
    hint: 'Follows your OS appearance preference.',
    preview: '🖥️',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Main Settings component
// ═══════════════════════════════════════════════════════════════════════════════

export default function Settings() {
  const [activeId, setActiveId] = useState('appearance');
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(['layout']),
  );

  const filteredItems = useMemo(() => {
    if (!search.trim()) return SETTINGS_TREE;
    const q = search.toLowerCase();
    const matchingIds = new Set<string>();
    for (const item of SETTINGS_TREE) {
      if (item.label.toLowerCase().includes(q)) {
        matchingIds.add(item.id);
        if (item.parentId) matchingIds.add(item.parentId);
      }
    }
    return SETTINGS_TREE.filter((item) => matchingIds.has(item.id));
  }, [search]);

  const effectiveExpanded = search.trim()
    ? new Set(SETTINGS_TREE.filter((i) => i.isGroup).map((i) => i.id))
    : expandedGroups;

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleItemClick = (item: SettingItem) => {
    if (item.isGroup) {
      toggleGroup(item.id);
      setActiveId(item.id);
    } else {
      setActiveId(item.id);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Left sidebar ─── */}
      <aside className="w-[240px] shrink-0 border-r border-line/60 bg-bg-soft/40 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-line/60">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-xs">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings"
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-bg-lift border border-line/60 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredItems.map((item) => {
            if (item.parentId && !effectiveExpanded.has(item.parentId)) {
              return null;
            }
            const isActive = activeId === item.id;
            const isChild = !!item.parentId;
            const isExpanded = item.isGroup && effectiveExpanded.has(item.id);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                className={cn(
                  'w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                  isChild && 'pl-7',
                  isActive
                    ? 'bg-accent/15 text-accent'
                    : 'text-ink hover:bg-line/40',
                )}
              >
                {item.isGroup && (
                  <span
                    className={cn(
                      'text-2xs transition-transform',
                      isExpanded && 'rotate-90',
                    )}
                  >
                    ▶
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          {filteredItems.length === 0 && (
            <p className="px-3 py-4 text-2xs text-ink-muted text-center">
              No settings match your search.
            </p>
          )}
        </nav>
      </aside>

      {/* ─── Right content panel ─── */}
      <main className="flex-1 overflow-y-auto p-6">
        <SettingsPanel activeId={activeId} />
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Settings panel router
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsPanel({ activeId }: { activeId: string }) {
  switch (activeId) {
    case 'appearance':
      return <AppearancePanel />;
    case 'layout':
      return <LayoutOverviewPanel />;
    case 'layout.marketplace':
      return <MarketplaceStripPanel />;
    case 'layout.notes':
      return <ShowNotesPanel />;
    case 'layout.calendar':
      return <ShowCalendarPanel />;
    default:
      return (
        <div className="text-ink-muted text-sm">
          Select a setting from the sidebar.
        </div>
      );
  }
}

// ─── Appearance panel ───────────────────────────────────────────────────────

function AppearancePanel() {
  const { theme, resolved, setTheme } = useTheme();

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Appearance</h1>
        <p className="text-2xs text-ink-muted">
          Personalise how TickerNest looks and feels.
        </p>
      </header>

      <Section
        title="Theme"
        subtitle={`Currently showing the ${resolved} theme.`}
      >
        <div className="grid sm:grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTheme(opt.key)}
              className={cn(
                'card text-left p-4 transition-colors hover:border-accent/60',
                theme === opt.key && 'border-accent bg-accent/10',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-base">{opt.preview}</span>
                {theme === opt.key && (
                  <span className="text-2xs text-accent">✓ active</span>
                )}
              </div>
              <div className="text-sm font-medium mt-2">{opt.label}</div>
              <div className="text-2xs text-ink-muted mt-1">{opt.hint}</div>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Layout overview ────────────────────────────────────────────────────────

function LayoutOverviewPanel() {
  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Layout Settings</h1>
        <p className="text-2xs text-ink-muted">
          Configure which widgets and sections appear on your dashboard and app layout.
        </p>
      </header>
      <Section title="Available options">
        <ul className="space-y-2 text-sm text-ink-muted list-disc list-inside">
          <li>Edit Marketplace Strip — Customise the market ticker shown in the header.</li>
          <li>Show Notes on Dashboard — Toggle the notes widget on the dashboard.</li>
          <li>Show Calendar on Dashboard — Toggle the calendar widget on the dashboard.</li>
        </ul>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Marketplace Strip panel — full CRUD with live-preview cards
// ═══════════════════════════════════════════════════════════════════════════════

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

function MarketplaceStripPanel() {
  const [cards, setCards] = useState<MarketCard[]>(getMarketCards);
  const [editingCard, setEditingCard] = useState<MarketCard | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Fetch real-time quotes from snapshot
  const { data: snapshot } = useQuery({
    queryKey: ['market', 'snapshot'],
    queryFn: () => api<{ indices: IndexQuote[] }>('/market/snapshot'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Find custom tickers not covered by the snapshot
  const customTickers = useMemo(() => {
    const snapshotSet = new Set(snapshot?.indices?.map((ix) => ix.ticker) ?? []);
    return cards.map((c) => c.ticker).filter((t) => !snapshotSet.has(t));
  }, [snapshot, cards]);

  // Fetch individual quotes for custom tickers via /quotes/:ticker
  const { data: customQuotes } = useQuery({
    queryKey: ['market', 'custom-quotes-settings', customTickers],
    queryFn: async () => {
      if (customTickers.length === 0) return {};
      const results: Record<string, StockDetail> = {};
      const fetched = await Promise.allSettled(
        customTickers.map((t) => api<StockDetail>(`/quotes/${encodeURIComponent(t)}`)),
      );
      fetched.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value) {
          results[customTickers[idx]] = r.value;
        }
      });
      return results;
    },
    enabled: customTickers.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Build a unified quote map: snapshot + custom
  const quoteMap = useMemo(() => {
    const m = new Map<string, IndexQuote>();
    if (snapshot?.indices) {
      for (const ix of snapshot.indices) {
        m.set(ix.ticker, ix);
      }
    }
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
  }, [snapshot, customQuotes]);

  const persist = useCallback((next: MarketCard[]) => {
    setCards(next);
    saveMarketCards(next);
  }, []);

  const handleDelete = (id: string) => {
    persist(cards.filter((c) => c.id !== id));
    if (editingCard?.id === id) setEditingCard(null);
  };

  const handleSaveEdit = (updated: MarketCard) => {
    persist(cards.map((c) => (c.id === updated.id ? updated : c)));
    setEditingCard(null);
  };

  const handleAdd = (newCard: Omit<MarketCard, 'id'>) => {
    const card: MarketCard = { ...newCard, id: generateId() };
    persist([...cards, card]);
    setIsAdding(false);
  };

  const handleToggleEnabled = (id: string) => {
    persist(
      cards.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const handleResetDefaults = () => {
    persist(DEFAULT_MARKET_CARDS);
    setEditingCard(null);
    setIsAdding(false);
  };

  const enabledCount = cards.filter((c) => c.enabled).length;
  const showWarning = enabledCount > MAX_CARDS_WARNING;

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Edit Marketplace Strip</h1>
        <p className="text-2xs text-ink-muted">
          Manage the market index cards displayed in the header strip.
          Only cards with a checkmark (✓) are shown on the header.
        </p>
      </header>

      {/* Warning banner */}
      {showWarning && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-medium text-yellow-200">
              Too many active cards ({enabledCount})
            </p>
            <p className="text-2xs text-yellow-200/70 mt-0.5">
              Having more than {MAX_CARDS_WARNING} cards on the header strip may
              cause overflow and affect loading performance. Consider disabling some.
            </p>
          </div>
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-muted">
          {enabledCount} of {cards.length} card{cards.length !== 1 ? 's' : ''} shown on header
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1.5 text-2xs rounded-md border border-line/60 text-ink-muted hover:text-ink hover:bg-line/40 transition-colors"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={() => { setIsAdding(true); setEditingCard(null); }}
            className="px-3 py-1.5 text-2xs rounded-md bg-accent text-white hover:bg-accent/80 transition-colors font-medium"
          >
            + Add Card
          </button>
        </div>
      </div>

      {/* Add form with ticker search */}
      {isAdding && (
        <AddCardForm
          onAdd={handleAdd}
          onCancel={() => setIsAdding(false)}
          existingTickers={new Set(cards.map((c) => c.ticker))}
        />
      )}

      {/* Edit form */}
      {editingCard && (
        <EditCardForm
          card={editingCard}
          onSave={handleSaveEdit}
          onCancel={() => setEditingCard(null)}
        />
      )}

      {/* Cards grid — rendered like the header strip, supports drag-and-drop reorder */}
      <Section
        title="Current Cards"
        subtitle="Drag cards to reorder. The header strip follows this order."
      >
        {cards.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-ink-muted">No cards configured.</p>
            <p className="text-2xs text-ink-dim mt-1">
              Click &ldquo;+ Add Card&rdquo; to add a market index.
            </p>
          </div>
        ) : (
          <DraggableCardGrid
            cards={cards}
            quoteMap={quoteMap}
            editingCardId={editingCard?.id ?? null}
            onReorder={(reordered) => persist(reordered)}
            onToggleEnabled={(id) => handleToggleEnabled(id)}
            onEdit={(card) => { setEditingCard(card); setIsAdding(false); }}
            onDelete={(id) => handleDelete(id)}
          />
        )}
      </Section>
    </div>
  );
}

// ─── Draggable card grid — HTML5 drag-and-drop reordering ───────────────────

function DraggableCardGrid({
  cards,
  quoteMap,
  editingCardId,
  onReorder,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  cards: MarketCard[];
  quoteMap: Map<string, IndexQuote>;
  editingCardId: string | null;
  onReorder: (reordered: MarketCard[]) => void;
  onToggleEnabled: (id: string) => void;
  onEdit: (card: MarketCard) => void;
  onDelete: (id: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedId(null);
    setDragOverId(null);
    setDropSide(null);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id === draggedId) return;

    // Determine if dropping before or after based on cursor position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const side = e.clientX < midX ? 'before' : 'after';

    setDragOverId(id);
    setDropSide(side);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
    setDropSide(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      setDropSide(null);
      return;
    }

    const dragIdx = cards.findIndex((c) => c.id === draggedId);
    const targetIdx = cards.findIndex((c) => c.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    // Remove the dragged card and insert at new position
    const reordered = [...cards];
    const [moved] = reordered.splice(dragIdx, 1);

    // Recalculate target index after removal
    let insertIdx = reordered.findIndex((c) => c.id === targetId);
    if (insertIdx === -1) insertIdx = reordered.length;
    if (dropSide === 'after') insertIdx += 1;

    reordered.splice(insertIdx, 0, moved);
    onReorder(reordered);

    setDraggedId(null);
    setDragOverId(null);
    setDropSide(null);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.id}
          draggable
          onDragStart={(e) => handleDragStart(e, card.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, card.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, card.id)}
          className={cn(
            'relative transition-transform',
            draggedId === card.id && 'scale-95 opacity-50',
            dragOverId === card.id && dropSide === 'before' &&
              'ring-2 ring-accent/60 ring-offset-1 ring-offset-bg rounded-lg',
            dragOverId === card.id && dropSide === 'after' &&
              'ring-2 ring-accent/60 ring-offset-1 ring-offset-bg rounded-lg',
          )}
        >
          {/* Drop indicator line */}
          {dragOverId === card.id && dropSide === 'before' && (
            <div className="absolute -left-1.5 top-0 bottom-0 w-0.5 bg-accent rounded-full z-30" />
          )}
          {dragOverId === card.id && dropSide === 'after' && (
            <div className="absolute -right-1.5 top-0 bottom-0 w-0.5 bg-accent rounded-full z-30" />
          )}

          <MarketCardPreview
            card={card}
            quote={quoteMap.get(card.ticker) ?? null}
            isEditing={editingCardId === card.id}
            isDragging={draggedId === card.id}
            onToggleEnabled={() => onToggleEnabled(card.id)}
            onEdit={() => onEdit(card)}
            onDelete={() => onDelete(card.id)}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Market card preview — renders same as header IndexCell + hover actions ─

function MarketCardPreview({
  card,
  quote,
  isEditing,
  isDragging,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  card: MarketCard;
  quote: IndexQuote | null;
  isEditing: boolean;
  isDragging?: boolean;
  onToggleEnabled: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cur = card.currency;
  const hasQuote = quote && Number(quote.currentPrice) !== 0;

  return (
    <div
      className={cn(
        'relative rounded-lg border transition-all overflow-hidden cursor-grab active:cursor-grabbing',
        card.enabled
          ? 'border-line/60 bg-bg-soft/60'
          : 'border-line/30 bg-bg-soft/20 opacity-60',
        isEditing && 'border-accent ring-1 ring-accent/30',
        isDragging && 'shadow-lg',
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setConfirmDelete(false); }}
    >
      {/* Drag handle indicator — top-left */}
      <div className="absolute top-1.5 left-1.5 text-ink-dim/40 text-xs leading-none z-10 pointer-events-none select-none">
        ⠿
      </div>

      {/* Enabled badge (checkmark) — top-right */}
      {card.enabled && (
        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gain/20 flex items-center justify-center z-10">
          <span className="text-gain text-2xs leading-none">✓</span>
        </div>
      )}

      {/* Card content — matching header IndexCell layout */}
      <div className="px-3 py-2 min-h-[60px]">
        <div className="text-2xs uppercase tracking-wider text-ink-muted truncate pr-5">
          {card.label}
        </div>
        {hasQuote ? (
          <>
            <div className="text-sm num font-medium leading-tight mt-0.5">
              {formatMoney(quote.currentPrice, cur)}
            </div>
            <div
              className={cn(
                'text-2xs num leading-tight whitespace-nowrap mt-0.5',
                trendClass(quote.dayChange),
              )}
            >
              {formatSignedMoney(quote.dayChange, cur)}{' '}
              <span className="opacity-90">({formatPct(quote.dayChangePct)})</span>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-ink-muted mt-0.5">—</div>
            <div className="text-2xs text-ink-dim font-mono mt-0.5 truncate">
              {card.ticker}
            </div>
          </>
        )}
      </div>

      {/* Hover overlay with actions */}
      {showActions && (
        <div className="absolute inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center gap-1.5 z-20">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="px-2 py-1 text-2xs rounded bg-loss/20 text-loss hover:bg-loss/30 transition-colors font-medium"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-2xs rounded bg-line/40 text-ink-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleEnabled}
                title={card.enabled ? 'Hide from header' : 'Show on header'}
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center transition-colors',
                  card.enabled
                    ? 'bg-gain/20 text-gain hover:bg-gain/30'
                    : 'bg-line/40 text-ink-muted hover:bg-line/60',
                )}
              >
                <span className="text-xs">{card.enabled ? '👁' : '👁‍🗨'}</span>
              </button>
              <button
                type="button"
                onClick={onEdit}
                title="Edit card"
                className="w-7 h-7 rounded-full bg-line/40 text-ink-muted hover:text-ink hover:bg-line/60 flex items-center justify-center transition-colors"
              >
                <span className="text-xs">✏️</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title="Delete card"
                className="w-7 h-7 rounded-full bg-line/40 text-ink-muted hover:text-loss hover:bg-loss/15 flex items-center justify-center transition-colors"
              >
                <span className="text-xs">🗑️</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add card form with ticker search autocomplete ──────────────────────────

function AddCardForm({
  onAdd,
  onCancel,
  existingTickers,
}: {
  onAdd: (card: Omit<MarketCard, 'id'>) => void;
  onCancel: () => void;
  existingTickers: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Fetch search results
  useEffect(() => {
    let cancelled = false;
    if (debounced.length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
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
    return () => { cancelled = true; };
  }, [debounced]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = (hit: SearchHit) => {
    if (existingTickers.has(hit.ticker)) {
      setError(`"${hit.ticker}" is already in your strip.`);
      setOpen(false);
      return;
    }
    // Determine currency from exchange
    const currency = inferCurrency(hit.exchange);
    onAdd({
      ticker: hit.ticker,
      label: hit.name,
      currency,
      enabled: true,
    });
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

  return (
    <div className="card p-4 space-y-3 border-accent/40 relative z-30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add New Card</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-2xs text-ink-muted hover:text-ink"
        >
          ✕ Close
        </button>
      </div>

      <p className="text-2xs text-ink-muted">
        Search for an index, stock, future, or crypto. The display name will be
        populated from Yahoo Finance.
      </p>

      {error && <p className="text-2xs text-loss">{error}</p>}

      <div ref={wrapRef} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setError(''); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search ticker (e.g. Nifty, Nasdaq, Gold, Bitcoin…)"
          autoFocus
          autoComplete="off"
          className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        {showDropdown && (
          <div className="absolute z-[100] mt-1 w-full max-h-72 overflow-auto bg-bg-soft border border-line rounded-md shadow-xl">
            {loading && hits.length === 0 && (
              <div className="px-3 py-2 text-2xs text-ink-muted">Searching…</div>
            )}
            {!loading && hits.length === 0 && debounced.length >= 2 && (
              <div className="px-3 py-2 text-2xs text-ink-muted">No matches.</div>
            )}
            {hits.slice(0, 12).map((h, i) => {
              const alreadyAdded = existingTickers.has(h.ticker);
              return (
                <button
                  key={h.ticker}
                  type="button"
                  disabled={alreadyAdded}
                  onMouseDown={(e) => { e.preventDefault(); pick(h); }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'w-full text-left px-3 py-2 flex items-center gap-2',
                    alreadyAdded
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-line/40 cursor-pointer',
                    i === active && !alreadyAdded && 'bg-line/40',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{h.name}</div>
                    <div className="text-2xs text-ink-muted">
                      {h.ticker} · {h.exchange || '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="chip text-2xs bg-bg text-ink-muted">{h.quoteType}</span>
                    {alreadyAdded && (
                      <span className="text-2xs text-accent">Added</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit card form ─────────────────────────────────────────────────────────

function EditCardForm({
  card,
  onSave,
  onCancel,
}: {
  card: MarketCard;
  onSave: (updated: MarketCard) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(card.label);
  const [currency, setCurrency] = useState<'INR' | 'USD'>(card.currency);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const l = label.trim();
    if (!l) {
      setError('Display label is required.');
      return;
    }
    setError('');
    onSave({ ...card, label: l, currency });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="card p-4 space-y-4 border-accent/40"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Edit Card — <span className="font-mono text-ink-muted">{card.ticker}</span>
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-2xs text-ink-muted hover:text-ink"
        >
          ✕ Close
        </button>
      </div>

      {error && <p className="text-2xs text-loss">{error}</p>}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-2xs text-ink-muted font-medium">
            Display Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-1.5 rounded-md bg-bg border border-line/60 text-sm text-ink focus:outline-none focus:border-accent/60 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-2xs text-ink-muted font-medium">
            Currency
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')}
            className="w-full px-3 py-1.5 rounded-md bg-bg border border-line/60 text-sm text-ink focus:outline-none focus:border-accent/60 transition-colors"
          >
            <option value="INR">🇮🇳 INR</option>
            <option value="USD">🇺🇸 USD</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:bg-accent/80 transition-colors font-medium"
        >
          Save Changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-sm rounded-md border border-line/60 text-ink-muted hover:text-ink hover:bg-line/40 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Show Notes panel ───────────────────────────────────────────────────────

function ShowNotesPanel() {
  const [showNotes, setShowNotes] = useState(() =>
    getBool(LS_KEYS.showNotes, true),
  );

  const handleToggle = () => {
    const next = !showNotes;
    setShowNotes(next);
    setBool(LS_KEYS.showNotes, next);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Show Notes on Dashboard</h1>
        <p className="text-2xs text-ink-muted">
          Control whether the Notes widget appears on your dashboard.
        </p>
      </header>
      <Section title="Notes Widget">
        <div className="card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Display notes section</p>
            <p className="text-2xs text-ink-muted mt-0.5">
              When enabled, your recent notes will be shown on the dashboard.
            </p>
          </div>
          <ToggleSwitch checked={showNotes} onChange={handleToggle} />
        </div>
      </Section>
    </div>
  );
}

// ─── Show Calendar panel ────────────────────────────────────────────────────

function ShowCalendarPanel() {
  const [showCalendar, setShowCalendar] = useState(() =>
    getBool(LS_KEYS.showCalendar, true),
  );

  const handleToggle = () => {
    const next = !showCalendar;
    setShowCalendar(next);
    setBool(LS_KEYS.showCalendar, next);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Show Calendar on Dashboard</h1>
        <p className="text-2xs text-ink-muted">
          Control whether the Calendar widget appears on your dashboard.
        </p>
      </header>
      <Section title="Calendar Widget">
        <div className="card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Display calendar section</p>
            <p className="text-2xs text-ink-muted mt-0.5">
              When enabled, upcoming events will be shown on the dashboard.
            </p>
          </div>
          <ToggleSwitch checked={showCalendar} onChange={handleToggle} />
        </div>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared UI
// ═══════════════════════════════════════════════════════════════════════════════

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-2xs text-ink-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40',
        checked ? 'bg-accent' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

// ─── Utility: infer currency from exchange ──────────────────────────────────

function inferCurrency(exchange: string): 'INR' | 'USD' {
  const ex = (exchange ?? '').toUpperCase();
  const inrExchanges = new Set(['NSE', 'BSE', 'NSI', 'BSI']);
  return inrExchanges.has(ex) ? 'INR' : 'USD';
}
