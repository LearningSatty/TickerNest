/**
 * Watchlists hub — Google Finance-style layout with grouped sidebar.
 *
 *   ┌──────────────────┬─────────────────────────────────┐
 *   │  Search    [+]   │                                 │
 *   │  + Create Group  │   (dashboard or selected wl)    │
 *   ├──────────────────┤                                 │
 *   │  ▼ Banks (3)     │                                 │
 *   │    Watchlist A   │                                 │
 *   │    Watchlist B   │                                 │
 *   │  ▼ IT (2)        │                                 │
 *   │    Watchlist C   │                                 │
 *   │  ─ Ungrouped ─   │                                 │
 *   │    Watchlist X   │                                 │
 *   └──────────────────┴─────────────────────────────────┘
 *
 * Drag any watchlist row onto a group header to move it; drop on the
 * "Ungrouped" header to remove from its group.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  formatMoney,
  formatPct,
  formatSignedMoney,
  trendClass,
} from '@/lib/format';
import Modal from '@/components/Modal';
import Watchlist from '@/pages/Watchlist';

interface WatchlistRow {
  id: string;
  name: string;
  groupId: string | null;
  market: 'IN' | 'US';
  itemCount: number;
  position: number;
}
interface GroupRow {
  id: string;
  name: string;
  position: number;
}
interface MoverRow {
  ticker: string;
  name: string;
  currentPrice: string;
  dayChange: string;
  dayChangePct: string;
  currency: string;
  watchlistId: string;
  watchlistName: string;
}
interface NewsRow {
  title: string;
  publisher: string;
  publishedAt: number;
  link: string;
  relatedTickers: string[];
}

const COLLAPSED_GROUPS_KEY = 'tn:wl-collapsed-groups';
const UNGROUPED_KEY = '__ungrouped__';

export default function Watchlists() {
  const { id: selectedId } = useParams<{ id?: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');

  // Modals
  const [createWlOpen, setCreateWlOpen] = useState(false);
  const [createWlName, setCreateWlName] = useState('');
  // '' = no group; '__new__' opens the inline group-create modal
  const [createWlGroupId, setCreateWlGroupId] = useState<string>('');
  const [createWlMarket, setCreateWlMarket] = useState<'IN' | 'US'>('IN');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupName, setCreateGroupName] = useState('');

  // Drag state
  const [dragWlId, setDragWlId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Persisted accordion-collapsed state.  Set entries are group ids that
  // are currently collapsed; UNGROUPED_KEY is also tracked here.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        COLLAPSED_GROUPS_KEY,
        JSON.stringify([...collapsed]),
      );
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const { data: watchlists = [], isLoading: loadingLists } = useQuery({
    queryKey: ['watchlists'],
    queryFn: () => api<WatchlistRow[]>('/watchlists'),
  });
  const { data: groups = [] } = useQuery({
    queryKey: ['watchlist-groups'],
    queryFn: () => api<GroupRow[]>('/watchlists/groups'),
  });

  const createWlMut = useMutation({
    mutationFn: (vars: { name: string; groupId?: string; market: 'IN' | 'US' }) =>
      api<WatchlistRow>('/watchlists', { body: vars }),
    onSuccess: (created) => {
      setCreateWlOpen(false);
      setCreateWlName('');
      setCreateWlGroupId('');
      setCreateWlMarket('IN');
      qc.invalidateQueries({ queryKey: ['watchlists'] });
      nav(`/watchlists/${created.id}`);
    },
  });

  const createGroupMut = useMutation({
    mutationFn: (n: string) =>
      api<GroupRow>('/watchlists/groups', { body: { name: n } }),
    onSuccess: (created) => {
      setCreateGroupOpen(false);
      setCreateGroupName('');
      qc.invalidateQueries({ queryKey: ['watchlist-groups'] });
      // If the user opened "Create new group…" from inside the watchlist
      // modal, auto-select the newly-created group there for convenience.
      if (createWlOpen) setCreateWlGroupId(created.id);
    },
  });

  const deleteWlMut = useMutation({
    mutationFn: (wlId: string) =>
      api(`/watchlists/${wlId}`, { method: 'DELETE' }),
    onSuccess: (_data, wlId) => {
      qc.invalidateQueries({ queryKey: ['watchlists'] });
      // If the deleted one was selected, drop the selection so the right
      // pane falls back to the dashboard.
      if (selectedId === wlId) nav('/watchlists');
    },
  });

  const moveWlMut = useMutation({
    mutationFn: (vars: { id: string; groupId: string | null }) =>
      api(`/watchlists/${vars.id}`, {
        method: 'PATCH',
        body: { groupId: vars.groupId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlists'] }),
  });

  const deleteGroupMut = useMutation({
    mutationFn: (id: string) =>
      api(`/watchlists/groups/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist-groups'] });
      // Member watchlists' group_id becomes NULL via FK ON DELETE SET NULL,
      // so refresh the list as well.
      qc.invalidateQueries({ queryKey: ['watchlists'] });
    },
  });

  // Filter & group watchlists for the sidebar render.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return watchlists;
    return watchlists.filter((w) => w.name.toLowerCase().includes(q));
  }, [filter, watchlists]);

  const grouped = useMemo(() => {
    // Map: groupId (or UNGROUPED_KEY) → watchlists[]
    const out = new Map<string, WatchlistRow[]>();
    // Seed in render order: groups in user-defined order, then Ungrouped last
    for (const g of groups) out.set(g.id, []);
    out.set(UNGROUPED_KEY, []);
    for (const w of filtered) {
      const k = w.groupId ?? UNGROUPED_KEY;
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(w);
    }
    return out;
  }, [filtered, groups]);

  const toggleCollapsed = (key: string) => {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onDropToGroup = (groupKey: string) => {
    if (!dragWlId) return;
    const wl = watchlists.find((w) => w.id === dragWlId);
    const target = groupKey === UNGROUPED_KEY ? null : groupKey;
    if (wl && (wl.groupId ?? null) !== target) {
      moveWlMut.mutate({ id: dragWlId, groupId: target });
    }
    setDragWlId(null);
    setDropTarget(null);
  };

  const confirmCreateWl = () => {
    const n = createWlName.trim();
    if (!n) return;
    createWlMut.mutate({
      name: n,
      market: createWlMarket,
      ...(createWlGroupId ? { groupId: createWlGroupId } : {}),
    });
  };
  const confirmCreateGroup = () => {
    const n = createGroupName.trim();
    if (!n) return;
    createGroupMut.mutate(n);
  };

  return (
    <div className="grid grid-cols-[260px_1fr] h-full min-w-0">
      {/* ─── Left sidebar ─── */}
      <aside className="border-r border-line/60 bg-bg-soft/40 flex flex-col h-full overflow-hidden">
        <div className="p-3 border-b border-line/60 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search watchlists…"
              className="flex-1 bg-bg border border-line rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setCreateWlOpen(true)}
              title="Create watchlist"
              className="w-8 h-8 flex items-center justify-center rounded-md bg-accent text-white text-base font-semibold hover:bg-accent/90"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreateGroupOpen(true)}
            className="w-full px-2 py-1.5 rounded-md border border-line text-2xs text-ink-muted hover:text-ink hover:bg-line/40"
          >
            + Create Group
          </button>
        </div>
        <nav className="flex-1 overflow-auto p-1 space-y-0.5">
          {loadingLists && (
            <div className="px-3 py-2 text-2xs text-ink-muted">Loading…</div>
          )}
          {!loadingLists &&
            watchlists.length === 0 &&
            groups.length === 0 && (
              <div className="px-3 py-4 text-2xs text-ink-muted text-center">
                No watchlists or groups yet. Click + to create one.
              </div>
            )}

          {[...grouped.entries()].map(([key, items]) => {
            const group = groups.find((g) => g.id === key);
            const isUngrouped = key === UNGROUPED_KEY;
            // Hide an empty Ungrouped section if any group exists — keeps
            // the sidebar tidy when the user has organised everything.
            if (isUngrouped && items.length === 0 && groups.length > 0) {
              return null;
            }
            const isCollapsed = collapsed.has(key);
            return (
              <GroupBlock
                key={key}
                groupKey={key}
                title={isUngrouped ? 'Ungrouped' : group?.name ?? '(group)'}
                items={items}
                isUngrouped={isUngrouped}
                isCollapsed={isCollapsed}
                isDropTarget={dropTarget === key}
                isDragging={!!dragWlId}
                selectedId={selectedId}
                onToggle={() => toggleCollapsed(key)}
                onDragOver={() => setDropTarget(key)}
                onDrop={() => onDropToGroup(key)}
                onWlDragStart={(wlId) => setDragWlId(wlId)}
                onWlDragEnd={() => {
                  setDragWlId(null);
                  setDropTarget(null);
                }}
                onWlDelete={(wlId) => deleteWlMut.mutate(wlId)}
                {...(group && {
                  onDelete: () => {
                    if (
                      confirm(
                        `Delete group "${group.name}"? Member watchlists will become ungrouped.`,
                      )
                    ) {
                      deleteGroupMut.mutate(group.id);
                    }
                  },
                })}
              />
            );
          })}
        </nav>
      </aside>

      {/* ─── Right pane ─── */}
      <main className="overflow-auto min-w-0">
        {selectedId ? (
          <Watchlist idOverride={selectedId} />
        ) : (
          <Dashboard watchlists={watchlists} />
        )}
      </main>

      {/* ─── Create watchlist modal ─── */}
      <Modal
        open={createWlOpen}
        onClose={() => {
          setCreateWlOpen(false);
          setCreateWlName('');
          setCreateWlGroupId('');
        }}
        title="Create New Watchlist"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setCreateWlOpen(false);
                setCreateWlName('');
                setCreateWlGroupId('');
              }}
              className="px-3 py-1.5 rounded-md text-sm text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmCreateWl}
              disabled={!createWlName.trim() || createWlMut.isPending}
              className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
            >
              {createWlMut.isPending ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">
              Name
            </label>
            <input
              autoFocus
              value={createWlName}
              onChange={(e) => setCreateWlName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreateWl();
              }}
              placeholder='e.g. "Hospitals"'
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">
              Market
            </label>
            <select
              value={createWlMarket}
              onChange={(e) =>
                setCreateWlMarket(e.target.value as 'IN' | 'US')
              }
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option value="IN">🇮🇳 Indian (NSE/BSE)</option>
              <option value="US">🇺🇸 US (NYSE/Nasdaq)</option>
            </select>
            <p className="text-2xs text-ink-muted mt-1">
              Sets the default market filter when adding tickers to this watchlist.
            </p>
          </div>
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">
              Group (optional)
            </label>
            <select
              value={createWlGroupId}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__new__') {
                  // Stash the partially-filled WL name + open Create Group;
                  // user finishes that flow, then comes back.  We don't auto-
                  // pre-select the new group here (groups query needs to
                  // refetch first); user can pick it from the dropdown after.
                  setCreateGroupOpen(true);
                  // Reset back to "no group" so the modal shows that until
                  // the user picks the new group.
                  setCreateWlGroupId('');
                } else {
                  setCreateWlGroupId(v);
                }
              }}
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option value="">No group (ungrouped)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="__new__">+ Create new group…</option>
            </select>
            {groups.length === 0 && (
              <p className="text-2xs text-ink-muted mt-1">
                No groups yet. Use “+ Create new group…” to add one.
              </p>
            )}
          </div>
          {createWlMut.error && (
            <p className="text-2xs text-loss">
              {(createWlMut.error as Error).message}
            </p>
          )}
        </div>
      </Modal>

      {/* ─── Create group modal ─── */}
      <Modal
        open={createGroupOpen}
        onClose={() => {
          setCreateGroupOpen(false);
          setCreateGroupName('');
        }}
        title="Create New Group"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setCreateGroupOpen(false);
                setCreateGroupName('');
              }}
              className="px-3 py-1.5 rounded-md text-sm text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmCreateGroup}
              disabled={!createGroupName.trim() || createGroupMut.isPending}
              className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
            >
              {createGroupMut.isPending ? 'Creating…' : 'Create Group'}
            </button>
          </>
        }
      >
        <p className="text-2xs text-ink-muted mb-2">
          Groups are sidebar buckets for organising watchlists. Drag any
          watchlist onto a group to move it.
        </p>
        <input
          autoFocus
          value={createGroupName}
          onChange={(e) => setCreateGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmCreateGroup();
          }}
          placeholder='e.g. "IT", "Banks"'
          className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        {createGroupMut.error && (
          <p className="text-2xs text-loss mt-2">
            {(createGroupMut.error as Error).message}
          </p>
        )}
      </Modal>
    </div>
  );
}

// ─── One group block (Slack-style header + member rows) ────────────────────
function GroupBlock({
  groupKey,
  title,
  items,
  isUngrouped,
  isCollapsed,
  isDropTarget,
  isDragging,
  selectedId,
  onToggle,
  onDragOver,
  onDrop,
  onWlDragStart,
  onWlDragEnd,
  onWlDelete,
  onDelete,
}: {
  groupKey: string;
  title: string;
  items: WatchlistRow[];
  isUngrouped: boolean;
  isCollapsed: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  selectedId: string | undefined;
  onToggle: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onWlDragStart: (wlId: string) => void;
  onWlDragEnd: () => void;
  onWlDelete: (wlId: string) => void;
  onDelete?: () => void;
}) {
  void groupKey; // unused — only here to keep the prop signature symmetrical
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        'rounded-md transition-colors',
        isDropTarget && 'bg-accent/10 ring-1 ring-accent/40',
      )}
    >
      {/* Header row: chevron, group icon, name */}
      <div className="group/hdr flex items-center px-1 py-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-1.5 px-1 py-0.5 text-sm text-ink hover:text-accent"
        >
          {/* Chevron — points down when expanded, right when collapsed */}
          <span
            className={cn(
              'inline-flex w-3 h-3 items-center justify-center text-ink-muted transition-transform shrink-0',
              isCollapsed ? '-rotate-90' : 'rotate-0',
            )}
            aria-hidden
          >
            ▼
          </span>
          {/* Group icon — different glyph for ungrouped vs custom group */}
          <span className="text-ink-muted text-sm shrink-0" aria-hidden>
            {isUngrouped ? '☰' : '🗂'}
          </span>
          <span className="truncate">{title}</span>
        </button>
        {onDelete && !isUngrouped && (
          <button
            type="button"
            onClick={onDelete}
            title={`Delete group "${title}"`}
            className="text-2xs text-ink-muted hover:text-loss px-1.5 opacity-0 group-hover/hdr:opacity-100 transition-opacity"
          >
            ✕
          </button>
        )}
      </div>
      {!isCollapsed && (
        <div className="space-y-0.5">
          {items.length === 0 && (
            <div className="px-7 py-1 text-2xs text-ink-muted/70">
              {isDragging ? 'Drop here' : '— empty —'}
            </div>
          )}
          {items.map((w) => (
            <WlRow
              key={w.id}
              wl={w}
              selected={selectedId === w.id}
              onDragStart={() => onWlDragStart(w.id)}
              onDragEnd={onWlDragEnd}
              onDelete={() => onWlDelete(w.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── One draggable watchlist row (Slack channel-style) ──────────────────────
function WlRow({
  wl,
  selected,
  onDragStart,
  onDragEnd,
  onDelete,
}: {
  wl: WatchlistRow;
  selected: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDelete: () => void;
}) {
  return (
    <Link
      to={`/watchlists/${wl.id}`}
      draggable
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.setData('text/plain', wl.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group/wl flex items-center px-2 py-1 pl-7 rounded-md text-sm truncate cursor-grab active:cursor-grabbing',
        'hover:bg-line/40',
        selected
          ? 'bg-accent/15 text-accent font-medium'
          : 'text-ink-muted',
      )}
    >
      {/* Slack-style # prefix.  Muted so it doesn't fight with the name. */}
      <span className="text-ink-muted/80 mr-1.5 shrink-0">#</span>
      <span className="truncate flex-1">{wl.name}</span>
      {/* US flag chip when applicable, so you can see at a glance which
          watchlists track US tickers. */}
      {wl.market === 'US' && (
        <span className="text-2xs ml-1 shrink-0" title="US market">🇺🇸</span>
      )}
      <span className="text-2xs text-ink-muted ml-2 shrink-0 tabular-nums">
        {wl.itemCount}
      </span>
      {/* Delete button — visible on hover only.  preventDefault stops the
          parent <Link> from navigating into the (about-to-be-deleted) watchlist. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (
            confirm(
              `Delete "${wl.name}"? Tickers in this watchlist are removed but other watchlists are unaffected.`,
            )
          ) {
            onDelete();
          }
        }}
        title={`Delete watchlist "${wl.name}"`}
        className="ml-1 text-2xs text-ink-muted hover:text-loss px-1 opacity-0 group-hover/wl:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </Link>
  );
}

// ─── Dashboard pane (shown when no watchlist is selected) ────────────────────
function Dashboard({ watchlists }: { watchlists: WatchlistRow[] }) {
  const { data: movers = [], isLoading: loadingMovers } = useQuery({
    queryKey: ['watchlists', 'movers'],
    queryFn: () => api<MoverRow[]>('/watchlists/movers?limit=8'),
    refetchInterval: 30_000,
  });
  const { data: news = [], isLoading: loadingNews } = useQuery({
    queryKey: ['watchlists', 'news'],
    queryFn: () => api<NewsRow[]>('/watchlists/news?limit=10'),
    refetchInterval: 5 * 60_000,
  });

  const shortcuts = watchlists.slice(0, 8);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <header>
        <h1 className="text-xl font-semibold">Watchlists</h1>
        <p className="text-2xs text-ink-muted">
          Pick a watchlist on the left, or scan today's biggest movers below.
        </p>
      </header>

      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-line/60 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Top movers in your lists</h2>
          <span className="text-2xs text-ink-muted">
            Refreshes every 30s • by absolute % change
          </span>
        </div>
        {loadingMovers ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Loading…</p>
        ) : movers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">
            Add tickers to a watchlist to see today's movers here.
          </p>
        ) : (
          <table className="table-pivot w-full">
            <thead>
              <tr>
                <th className="text-left">Symbol</th>
                <th className="text-left">Watchlist</th>
                <th className="text-right">Last</th>
                <th className="text-right">Chg</th>
                <th className="text-right">Chg%</th>
              </tr>
            </thead>
            <tbody>
              {movers.map((m) => (
                <tr key={m.ticker}>
                  <td>
                    <div className="text-sm truncate max-w-[260px]">{m.name}</div>
                    <div className="text-2xs text-ink-muted">{m.ticker}</div>
                  </td>
                  <td>
                    <Link
                      to={`/watchlists/${m.watchlistId}`}
                      className="text-2xs text-accent hover:underline"
                    >
                      {m.watchlistName}
                    </Link>
                  </td>
                  <td className="text-right num">
                    {formatMoney(m.currentPrice, m.currency === 'USD' ? 'USD' : 'INR')}
                  </td>
                  <td className={cn('text-right num', trendClass(m.dayChange))}>
                    {formatSignedMoney(
                      m.dayChange,
                      m.currency === 'USD' ? 'USD' : 'INR',
                    )}
                  </td>
                  <td className={cn('text-right num', trendClass(m.dayChangePct))}>
                    {formatPct(m.dayChangePct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {shortcuts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3">Your watchlists</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {shortcuts.map((w) => (
              <Link
                key={w.id}
                to={`/watchlists/${w.id}`}
                className="card p-3 hover:border-accent/60 transition-colors"
              >
                <div className="text-sm font-medium truncate">{w.name}</div>
                <div className="text-2xs text-ink-muted mt-1">
                  {w.itemCount} {w.itemCount === 1 ? 'ticker' : 'tickers'}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-line/60">
          <h2 className="text-sm font-semibold">Latest news from your watchlists</h2>
        </div>
        {loadingNews ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Loading…</p>
        ) : news.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">
            No recent news for your tickers.
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
                  <span>{n.publisher}</span>
                  <span>·</span>
                  <span>{relativeTime(n.publishedAt)}</span>
                  {n.relatedTickers.length > 0 && (
                    <>
                      <span>·</span>
                      <div className="flex flex-wrap gap-1">
                        {n.relatedTickers.slice(0, 4).map((t) => (
                          <span key={t} className="chip text-2xs bg-line/40">
                            {t}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function relativeTime(epoch: number): string {
  if (!epoch) return '';
  const diff = Math.max(0, Date.now() / 1000 - epoch);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
