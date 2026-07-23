import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useConsolidated } from '@/hooks/usePortfolio';
import { formatMoney, formatPct, formatSignedMoney, trendClass } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Link } from 'react-router-dom';

interface Mover {
  ticker: string;
  changePct: string;
  ltp: string;
}
interface MoversResp {
  gainers: Mover[];
  losers: Mover[];
}

interface Note {
  id: string;
  title: string;
  content: string;
  is_done: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface StockEvent {
  id: string;
  title: string;
  description: string;
  stock_ticker: string | null;
  event_date: string;
  event_time: string | null;
  event_type: string;
  color: string;
  source: 'custom' | 'yahoo';
  market?: 'US' | 'IN' | 'OTHER';
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { data: portfolio } = useConsolidated();
  const { data: movers } = useQuery({
    queryKey: ['movers'],
    queryFn: () => api<MoversResp>('/movers?threshold=0.10'),
    staleTime: 5_000,
  });
  const { data: notes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: () => api<Note[]>('/notes'),
  });
  const { data: todayEvents = [] } = useQuery({
    queryKey: ['events-today'],
    queryFn: () => api<StockEvent[]>('/events/today'),
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => api<Note>(`/notes/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });

  // Event filters
  const [eventMarketFilter, setEventMarketFilter] = useState<'all' | 'US' | 'IN'>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | 'earnings' | 'ipo' | 'split' | 'dividend' | 'custom'>('all');

  const filteredEvents = todayEvents.filter((ev) => {
    if (eventMarketFilter !== 'all' && ev.source === 'yahoo' && ev.market !== eventMarketFilter) return false;
    if (eventTypeFilter !== 'all') {
      if (eventTypeFilter === 'custom') return ev.source === 'custom';
      return ev.event_type === eventTypeFilter;
    }
    return true;
  });

  const activeNotes = notes.filter((n) => !n.is_done).slice(0, 8);

  return (
    <div className="p-6 flex gap-6 min-h-0">
      {/* ─── Left: Main content ─── */}
      <div className="flex-1 min-w-0 space-y-4">
        <header>
          <h1 className="text-xl font-semibold">Dashboard</h1>
        </header>

        {/* Net-worth + today's P/L */}
        {portfolio && (
          <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Big label="Net Equity" value={formatMoney(portfolio.totalCurrentValue)} accent />
            <Big label="Invested" value={formatMoney(portfolio.totalInvested)} />
            <Big label="Today" value={formatSignedMoney(portfolio.todaysTotalProfit)} tone={trendClass(portfolio.todaysTotalProfit)} />
            <Big label="Overall" value={formatSignedMoney(portfolio.overallProfit)} tone={trendClass(portfolio.overallProfit)} sub={formatPct(portfolio.overallProfitPct)} />
          </div>
        )}

        {/* Movers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MoversCard title="Gainers" rows={movers?.gainers ?? []} tone="gain" />
          <MoversCard title="Losers" rows={movers?.losers ?? []} tone="loss" />
        </div>
      </div>

      {/* ─── Right sidebar: Events + Notes ─── */}
      <aside className="w-[320px] shrink-0 space-y-4 hidden lg:block">
        {/* Today's Events */}
        <div className="card p-4 flex flex-col max-h-[380px]">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              📅 Today's Events
              <span className="text-2xs text-ink-muted font-normal">
                {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            </h2>
            <Link to="/calendar" className="text-2xs text-accent hover:underline">All →</Link>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap shrink-0">
            <div className="flex gap-0.5 bg-bg-soft rounded p-0.5">
              {(['all', 'US', 'IN'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setEventMarketFilter(m)}
                  className={cn(
                    'px-2 py-0.5 text-[9px] rounded transition-colors',
                    eventMarketFilter === m
                      ? 'bg-accent text-white'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {m === 'all' ? 'All' : m === 'US' ? '🇺🇸' : '🇮🇳'}
                </button>
              ))}
            </div>
            <div className="flex gap-0.5 bg-bg-soft rounded p-0.5">
              {(['all', 'custom', 'earnings', 'ipo', 'split'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setEventTypeFilter(t)}
                  className={cn(
                    'px-2 py-0.5 text-[9px] rounded transition-colors',
                    eventTypeFilter === t
                      ? 'bg-accent text-white'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {t === 'all' ? 'All' : t === 'custom' ? 'My' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable events list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredEvents.length === 0 ? (
              <p className="text-2xs text-ink-muted py-3">No events match the filter.</p>
            ) : (
              <div className="space-y-0.5">
                {/* Custom events first */}
                {filteredEvents.filter((e) => e.source === 'custom').map((ev) => (
                  <DashboardEventRow key={ev.id} ev={ev} />
                ))}
                {/* Market events */}
                {filteredEvents.filter((e) => e.source === 'yahoo').length > 0 && (
                  <>
                    {filteredEvents.filter((e) => e.source === 'custom').length > 0 && (
                      <div className="border-t border-line/40 my-1" />
                    )}
                    <div className="text-[9px] uppercase tracking-wide text-ink-muted font-medium flex items-center gap-1 py-0.5">
                      <span>📡</span> Market
                    </div>
                    {filteredEvents.filter((e) => e.source === 'yahoo').map((ev) => (
                      <DashboardEventRow key={ev.id} ev={ev} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="card p-4 flex flex-col max-h-[300px]">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h2 className="text-sm font-semibold">📝 Notes</h2>
            <Link to="/notes" className="text-2xs text-accent hover:underline">All →</Link>
          </div>

          {/* Scrollable notes list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeNotes.length === 0 ? (
              <p className="text-2xs text-ink-muted py-3">No active notes. <Link to="/notes" className="text-accent">Add one →</Link></p>
            ) : (
              <ul className="space-y-0.5">
                {activeNotes.map((note) => (
                  <li key={note.id} className="flex items-center gap-2 py-1.5 px-1.5 rounded hover:bg-line/20">
                    <button
                      onClick={() => toggleMut.mutate(note.id)}
                      className="w-3.5 h-3.5 rounded border-2 border-line hover:border-accent flex items-center justify-center shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs truncate block leading-tight">{note.title || 'Untitled'}</span>
                      {note.content && (
                        <span className="text-2xs text-ink-muted truncate block">{note.content.slice(0, 50)}</span>
                      )}
                    </div>
                    {note.is_pinned && <span className="text-[10px] shrink-0">📌</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {notes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-line/40 text-2xs text-ink-muted shrink-0">
              {notes.filter((n) => !n.is_done).length} active · {notes.filter((n) => n.is_done).length} done
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function MoversCard({ title, rows, tone }: { title: string; rows: Mover[]; tone: 'gain' | 'loss' }) {
  return (
    <div className="card p-4">
      <h2 className={cn('text-sm font-semibold mb-2', tone === 'gain' ? 'text-gain' : 'text-loss')}>
        {title} <span className="text-ink-muted text-2xs ml-2">|Δ| ≥ 10%</span>
      </h2>
      <ul className="divide-y divide-line/40">
        {rows.length === 0 && <li className="text-2xs text-ink-muted py-2">No movers above threshold.</li>}
        {rows.slice(0, 12).map((m) => (
          <li key={m.ticker} className="flex justify-between py-1.5 num">
            <span>{m.ticker}</span>
            <span className="text-ink-muted">{formatMoney(m.ltp)}</span>
            <span className={trendClass(m.changePct)}>{formatPct(m.changePct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashboardEventRow({ ev }: { ev: StockEvent }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: ev.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium truncate">{ev.title}</span>
          {ev.stock_ticker && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium shrink-0">
              {ev.stock_ticker}
            </span>
          )}
          {ev.market && ev.market !== 'OTHER' && (
            <span className={cn(
              'text-[9px] px-1 py-0.5 rounded shrink-0',
              ev.market === 'US' ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500',
            )}>
              {ev.market === 'US' ? '🇺🇸' : '🇮🇳'}
            </span>
          )}
        </div>
        {ev.description && (
          <p className="text-2xs text-ink-muted mt-0.5 line-clamp-1">{ev.description}</p>
        )}
        {ev.event_time && (
          <span className="text-2xs text-ink-muted">🕐 {ev.event_time}</span>
        )}
      </div>
    </div>
  );
}

function Big({
  label, value, sub, tone, accent,
}: { label: string; value: string; sub?: string; tone?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span className={cn('num text-2xl font-semibold', tone, accent && 'text-accent')}>{value}</span>
      {sub && <span className={cn('text-2xs', tone)}>{sub}</span>}
    </div>
  );
}

