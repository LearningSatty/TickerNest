/**
 * Portfolio By Broker — watchlist-style layout with broker sidebar.
 *
 *   ┌──────────────────┬──────────────────────────────────────────────┐
 *   │  Brokers List    │  Holdings table for selected broker          │
 *   │  ─────────────── │                                              │
 *   │  • Groww      42 │  Ticker | Name | Sector | ... | P/L          │
 *   │  • Kite       15 │                                              │
 *   │  • Angel One  28 │                                              │
 *   └──────────────────┴──────────────────────────────────────────────┘
 *
 * Columns: Ticker, Name, Sector, Sector-Domain, Market Type, Total Holding,
 * Avg Price, Current Price, Prev Close, Change, Change%, Today's P/L,
 * Invested Cost, Current Cost, Overall Change%, Overall P/L, PE Ratio
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney, formatPct, formatSignedMoney, trendClass } from '@/lib/format';
import Modal from '@/components/Modal';
import type { Broker, BrokerHolding } from '@/types/api';

interface MasterItem { id: string; name: string; }

interface EnrichedHolding {
  ticker: string;
  name: string;
  sector: string;
  sectorDomain: string;
  sectorId: string | null;
  sectorDomainId: string | null;
  marketType: string;
  qty: Decimal;
  avgCost: Decimal;
  currentPrice: Decimal;
  prevClose: Decimal;
  change: Decimal;
  changePct: Decimal;
  todaysPL: Decimal;
  investedCost: Decimal;
  currentCost: Decimal;
  overallChangePct: Decimal;
  overallPL: Decimal;
  peRatio: string;
}

export default function PortfolioByBroker() {
  const qc = useQueryClient();
  const { data: brokers = [] } = useQuery({
    queryKey: ['brokers'],
    queryFn: () => api<Broker[]>('/brokers'),
    staleTime: 60_000,
  });
  const { data: sectors = [] } = useQuery({
    queryKey: ['master-sectors'],
    queryFn: () => api<MasterItem[]>('/master/sectors'),
    staleTime: 300_000,
  });
  const { data: sectorDomains = [] } = useQuery({
    queryKey: ['master-sector-domains'],
    queryFn: () => api<MasterItem[]>('/master/sector-domains'),
    staleTime: 300_000,
  });

  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
  const [editingHolding, setEditingHolding] = useState<EnrichedHolding | null>(null);
  const [createBrokerOpen, setCreateBrokerOpen] = useState(false);
  const [createBrokerName, setCreateBrokerName] = useState('');
  const [renamingBrokerId, setRenamingBrokerId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Broker CRUD mutations
  const createBrokerMut = useMutation({
    mutationFn: (name: string) =>
      api<Broker>('/brokers', { method: 'POST', body: { name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), displayName: name, currency: 'INR' } }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['brokers'] });
      setCreateBrokerOpen(false);
      setCreateBrokerName('');
      setSelectedBrokerId(created.id);
    },
  });
  const renameBrokerMut = useMutation({
    mutationFn: (vars: { id: string; displayName: string }) =>
      api(`/brokers/${vars.id}`, { method: 'PATCH', body: { displayName: vars.displayName } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brokers'] });
      setRenamingBrokerId(null);
    },
  });
  const deleteBrokerMut = useMutation({
    mutationFn: (id: string) => api(`/brokers/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['brokers'] });
      if (selectedBrokerId === id) setSelectedBrokerId(null);
    },
  });

  // Auto-select first broker when data loads
  const activeBrokerId = selectedBrokerId ?? brokers[0]?.id ?? null;

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ['holdings', activeBrokerId],
    queryFn: () => api<BrokerHolding[]>(`/holdings/${activeBrokerId}`),
    enabled: !!activeBrokerId,
    staleTime: 10_000,
  });

  const activeBroker = brokers.find((b) => b.id === activeBrokerId);

  // Edit holding mutation — updates ticker, qty, avg_cost
  const editHoldingMut = useMutation({
    mutationFn: (vars: { oldTicker: string; ticker: string; qty: string; avgCost: string }) =>
      api(`/holdings/${activeBrokerId}/update`, {
        method: 'POST',
        body: vars,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings', activeBrokerId] });
      setEditingHolding(null);
    },
  });

  // Add new holding
  const [addModalOpen, setAddModalOpen] = useState(false);
  const addHoldingMut = useMutation({
    mutationFn: (vars: { ticker: string; qty: string; avgCost: string }) =>
      api(`/holdings/${activeBrokerId}/add`, {
        method: 'POST',
        body: vars,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings', activeBrokerId] });
      setAddModalOpen(false);
    },
  });

  // Delete holding
  const deleteHoldingMut = useMutation({
    mutationFn: (ticker: string) =>
      api(`/holdings/${activeBrokerId}/delete`, {
        method: 'POST',
        body: { ticker },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings', activeBrokerId] });
    },
  });

  // Enrich holdings with computed columns
  const enriched: EnrichedHolding[] = useMemo(() => {
    return holdings
      .filter((h) => !new Decimal(h.qty).isZero())
      .map((h) => {
        const qty = new Decimal(h.qty);
        const avgCost = new Decimal(h.avgCost);
        const currentPrice = new Decimal(h.currentPrice ?? '0');
        const prevClose = new Decimal(h.prevClose ?? '0');
        const change = currentPrice.sub(prevClose);
        const changePct = prevClose.isZero() ? new Decimal(0) : change.div(prevClose);
        const todaysPL = qty.mul(change);
        const investedCost = qty.mul(avgCost);
        const currentCost = qty.mul(currentPrice);
        const overallPL = currentCost.sub(investedCost);
        const overallChangePct = investedCost.isZero() ? new Decimal(0) : overallPL.div(investedCost);
        return {
          ticker: h.ticker,
          name: h.name ?? h.ticker,
          sector: h.sector ?? '—',
          sectorDomain: h.sectorDomain ?? '—',
          sectorId: (h as unknown as Record<string, unknown>)['sectorId'] as string | null ?? null,
          sectorDomainId: (h as unknown as Record<string, unknown>)['sectorDomainId'] as string | null ?? null,
          marketType: h.marketType ?? '—',
          qty,
          avgCost,
          currentPrice,
          prevClose,
          change,
          changePct,
          todaysPL,
          investedCost,
          currentCost,
          overallChangePct,
          overallPL,
          peRatio: h.peRatio ?? '—',
        };
      });
  }, [holdings]);

  // Portfolio-level stats
  const stats = useMemo(() => {
    let totalInvested = new Decimal(0);
    let totalCurrent = new Decimal(0);
    let totalTodayPL = new Decimal(0);
    for (const h of enriched) {
      totalInvested = totalInvested.add(h.investedCost);
      totalCurrent = totalCurrent.add(h.currentCost);
      totalTodayPL = totalTodayPL.add(h.todaysPL);
    }
    const totalPL = totalCurrent.sub(totalInvested);
    const totalPLPct = totalInvested.isZero() ? new Decimal(0) : totalPL.div(totalInvested);
    return { totalInvested, totalCurrent, totalPL, totalPLPct, totalTodayPL };
  }, [enriched]);

  return (
    <div className="grid grid-cols-[220px_1fr] h-full min-w-0">
      {/* ─── Broker Sidebar ─── */}
      <aside className="border-r border-line/60 bg-bg-soft/40 flex flex-col h-full overflow-hidden">
        <div className="p-3 border-b border-line/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Brokers</h2>
            <p className="text-2xs text-ink-muted">{brokers.length} broker{brokers.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setCreateBrokerOpen(true)}
            className="text-xs text-accent hover:underline"
            title="Add broker"
          >
            + New
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {brokers.map((b) => (
            <div
              key={b.id}
              className={cn(
                'group/broker flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                activeBrokerId === b.id
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-ink-muted hover:bg-line/40',
              )}
            >
              {renamingBrokerId === b.id ? (
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => { if (renameValue.trim() && renameValue.trim() !== b.displayName) renameBrokerMut.mutate({ id: b.id, displayName: renameValue.trim() }); else setRenamingBrokerId(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { if (renameValue.trim() && renameValue.trim() !== b.displayName) renameBrokerMut.mutate({ id: b.id, displayName: renameValue.trim() }); else setRenamingBrokerId(null); } if (e.key === 'Escape') setRenamingBrokerId(null); }}
                  autoFocus
                  className="flex-1 min-w-0 bg-bg border border-accent rounded px-1.5 py-0.5 text-xs focus:outline-none"
                />
              ) : (
                <>
                  <button onClick={() => setSelectedBrokerId(b.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <span className="text-base shrink-0">🏦</span>
                    <span className="truncate">{b.displayName}</span>
                  </button>
                  <span className="flex items-center gap-0.5 opacity-0 group-hover/broker:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => { setRenamingBrokerId(b.id); setRenameValue(b.displayName); }} title="Rename" className="text-[10px] text-ink-muted hover:text-ink px-0.5">✏️</button>
                    <button onClick={() => { if (confirm(`Delete broker "${b.displayName}"? All holdings will be removed.`)) deleteBrokerMut.mutate(b.id); }} title="Delete" className="text-[10px] text-ink-muted hover:text-loss px-0.5">✕</button>
                  </span>
                </>
              )}
            </div>
          ))}
          {brokers.length === 0 && (
            <p className="text-2xs text-ink-muted px-3 py-4">
              No brokers yet. Click "+ New" or use Portfolio Onboarding.
            </p>
          )}
        </nav>

        {/* Create broker inline */}
        {createBrokerOpen && (
          <div className="p-3 border-t border-line/60 space-y-2">
            <input
              value={createBrokerName}
              onChange={(e) => setCreateBrokerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && createBrokerName.trim()) createBrokerMut.mutate(createBrokerName.trim()); if (e.key === 'Escape') { setCreateBrokerOpen(false); setCreateBrokerName(''); } }}
              placeholder="Broker name (e.g. Groww)"
              autoFocus
              className="w-full bg-bg border border-line rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button onClick={() => { if (createBrokerName.trim()) createBrokerMut.mutate(createBrokerName.trim()); }} disabled={!createBrokerName.trim() || createBrokerMut.isPending} className="px-2.5 py-1 rounded bg-accent text-white text-2xs disabled:opacity-50">
                {createBrokerMut.isPending ? 'Creating…' : 'Create'}
              </button>
              <button onClick={() => { setCreateBrokerOpen(false); setCreateBrokerName(''); }} className="px-2.5 py-1 rounded border border-line text-2xs">Cancel</button>
            </div>
          </div>
        )}
      </aside>

      {/* ─── Holdings Table ─── */}
      <div className="flex flex-col min-w-0 overflow-hidden">
        {!activeBrokerId ? (
          <div className="p-6 text-sm text-ink-muted">Select a broker from the sidebar.</div>
        ) : (
          <>
            {/* Header + Stats */}
            <div className="p-4 border-b border-line/60 space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold">{activeBroker?.displayName ?? 'Broker'}</h1>
                <button
                  onClick={() => setAddModalOpen(true)}
                  className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90"
                >
                  + Add Stock
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Invested" value={formatMoney(stats.totalInvested.toFixed(2))} />
                <StatCard label="Current" value={formatMoney(stats.totalCurrent.toFixed(2))} />
                <StatCard label="Overall P/L" value={formatSignedMoney(stats.totalPL.toFixed(2))} tone={trendClass(stats.totalPL.toString())} sub={formatPct(stats.totalPLPct.toString())} />
                <StatCard label="Today's P/L" value={formatSignedMoney(stats.totalTodayPL.toFixed(2))} tone={trendClass(stats.totalTodayPL.toString())} />
                <StatCard label="Holdings" value={String(enriched.length)} />
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {isLoading ? (
                <div className="p-6 text-sm text-ink-muted">Loading holdings…</div>
              ) : enriched.length === 0 ? (
                <div className="p-6 text-sm text-ink-muted">No holdings in this broker.</div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-bg-soft z-10">
                    <tr className="border-b border-line/60">
                      <Th>Ticker</Th>
                      <Th>Name</Th>
                      <Th>Sector</Th>
                      <Th>Sector-Domain</Th>
                      <Th>Market Type</Th>
                      <Th align="right">Holding</Th>
                      <Th align="right">Avg Price</Th>
                      <Th align="right">Current Price</Th>
                      <Th align="right">Prev Close</Th>
                      <Th align="right">Change</Th>
                      <Th align="right">Change %</Th>
                      <Th align="right">Today's P/L</Th>
                      <Th align="right">Invested</Th>
                      <Th align="right">Current Cost</Th>
                      <Th align="right">Overall %</Th>
                      <Th align="right">Overall P/L</Th>
                      <Th align="right">PE</Th>
                      <Th align="right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((h) => (
                      <tr key={h.ticker} onClick={() => setEditingHolding(h)} className="border-b border-line/20 hover:bg-line/20 cursor-pointer">
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{h.ticker.replace(/\.(NS|BO)$/, '')}</td>
                        <td className="px-2 py-1.5 truncate max-w-[140px]">{h.name}</td>
                        <td className="px-2 py-1.5 text-ink-muted truncate max-w-[100px]">{h.sector}</td>
                        <td className="px-2 py-1.5 text-ink-muted truncate max-w-[100px]">{h.sectorDomain}</td>
                        <td className="px-2 py-1.5 text-ink-muted">{h.marketType}</td>
                        <td className="px-2 py-1.5 text-right num">{h.qty.toFixed(0)}</td>
                        <td className="px-2 py-1.5 text-right num">{formatMoney(h.avgCost.toFixed(2))}</td>
                        <td className="px-2 py-1.5 text-right num">{formatMoney(h.currentPrice.toFixed(2))}</td>
                        <td className="px-2 py-1.5 text-right num text-ink-muted">{formatMoney(h.prevClose.toFixed(2))}</td>
                        <td className={cn('px-2 py-1.5 text-right num', trendClass(h.change.toString()))}>{formatSignedMoney(h.change.toFixed(2))}</td>
                        <td className={cn('px-2 py-1.5 text-right num', trendClass(h.changePct.toString()))}>{formatPct(h.changePct.toString())}</td>
                        <td className={cn('px-2 py-1.5 text-right num', trendClass(h.todaysPL.toString()))}>{formatSignedMoney(h.todaysPL.toFixed(2))}</td>
                        <td className="px-2 py-1.5 text-right num">{formatMoney(h.investedCost.toFixed(2))}</td>
                        <td className="px-2 py-1.5 text-right num">{formatMoney(h.currentCost.toFixed(2))}</td>
                        <td className={cn('px-2 py-1.5 text-right num', trendClass(h.overallChangePct.toString()))}>{formatPct(h.overallChangePct.toString())}</td>
                        <td className={cn('px-2 py-1.5 text-right num', trendClass(h.overallPL.toString()))}>{formatSignedMoney(h.overallPL.toFixed(2))}</td>
                        <td className="px-2 py-1.5 text-right num text-ink-muted">{h.peRatio}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete ${h.ticker.replace(/\.(NS|BO)$/, '')} from this broker?`)) {
                                deleteHoldingMut.mutate(h.ticker);
                              }
                            }}
                            className="text-2xs text-ink-muted hover:text-loss"
                            title="Delete holding"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Add Stock Modal ─── */}
      {addModalOpen && (
        <AddHoldingModal
          onClose={() => setAddModalOpen(false)}
          onSave={(vars) => addHoldingMut.mutate(vars)}
          isPending={addHoldingMut.isPending}
          error={addHoldingMut.error}
          sectors={sectors}
          sectorDomains={sectorDomains}
        />
      )}

      {/* ─── Edit Holding Modal ─── */}
      {editingHolding && (
        <EditHoldingModal
          holding={editingHolding}
          onClose={() => setEditingHolding(null)}
          onSave={(vars) => editHoldingMut.mutate(vars)}
          isPending={editHoldingMut.isPending}
          error={editHoldingMut.error}
          sectors={sectors}
          sectorDomains={sectorDomains}
        />
      )}
    </div>
  );
}

// ─── Edit Holding Modal ──────────────────────────────────────────────────────
function EditHoldingModal({
  holding,
  onClose,
  onSave,
  isPending,
  error,
  sectors,
  sectorDomains,
}: {
  holding: EnrichedHolding & { sectorId?: string | null; sectorDomainId?: string | null };
  onClose: () => void;
  onSave: (vars: { oldTicker: string; ticker: string; qty: string; avgCost: string; sectorId?: string | null; sectorDomainId?: string | null }) => void;
  isPending: boolean;
  error: Error | null;
  sectors: MasterItem[];
  sectorDomains: MasterItem[];
}) {
  const [ticker, setTicker] = useState(holding.ticker);
  const [qty, setQty] = useState(holding.qty.toFixed(0));
  const [avgCost, setAvgCost] = useState(holding.avgCost.toFixed(2));
  const [sectorId, setSectorId] = useState(holding.sectorId ?? '');
  const [sectorDomainId, setSectorDomainId] = useState(holding.sectorDomainId ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim() || !qty.trim() || !avgCost.trim()) return;
    onSave({
      oldTicker: holding.ticker,
      ticker: ticker.trim(),
      qty: qty.trim(),
      avgCost: avgCost.trim(),
      sectorId: sectorId || null,
      sectorDomainId: sectorDomainId || null,
    });
  };

  return (
    <Modal open onClose={onClose} title="Edit Holding" size="md" footer={
      <>
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md border border-line text-xs hover:bg-line/40">Cancel</button>
        <button type="button" onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)} disabled={isPending} className="px-3 py-1.5 rounded-md bg-accent text-white text-xs hover:bg-accent/90 disabled:opacity-50">
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </>
    }>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Ticker (Yahoo Symbol)</label>
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Quantity</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" step="any" min="0" className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Avg Price</label>
            <input value={avgCost} onChange={(e) => setAvgCost(e.target.value)} type="number" step="any" min="0" className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Sector</label>
            <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent">
              <option value="">— None —</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Sector Domain</label>
            <select value={sectorDomainId} onChange={(e) => setSectorDomainId(e.target.value)} className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent">
              <option value="">— None —</option>
              {sectorDomains.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="text-2xs text-loss">{error.message}</p>}
      </form>
    </Modal>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={cn('px-2 py-2 text-2xs uppercase tracking-wide text-ink-muted font-medium whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left')}>
      {children}
    </th>
  );
}

function StatCard({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="bg-bg-soft/60 rounded-md px-3 py-2">
      <div className="text-2xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={cn('text-sm num font-semibold', tone)}>{value}</div>
      {sub && <div className={cn('text-2xs num', tone)}>{sub}</div>}
    </div>
  );
}

// ─── Add Holding Modal ───────────────────────────────────────────────────────
function AddHoldingModal({
  onClose,
  onSave,
  isPending,
  error,
  sectors,
  sectorDomains,
}: {
  onClose: () => void;
  onSave: (vars: { ticker: string; qty: string; avgCost: string; sectorId?: string; sectorDomainId?: string }) => void;
  isPending: boolean;
  error: Error | null;
  sectors: MasterItem[];
  sectorDomains: MasterItem[];
}) {
  const [ticker, setTicker] = useState('');
  const [qty, setQty] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [sectorDomainId, setSectorDomainId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim() || !qty.trim() || !avgCost.trim()) return;
    onSave({
      ticker: ticker.trim().toUpperCase(),
      qty: qty.trim(),
      avgCost: avgCost.trim(),
      ...(sectorId ? { sectorId } : {}),
      ...(sectorDomainId ? { sectorDomainId } : {}),
    });
  };

  return (
    <Modal open onClose={onClose} title="Add Stock" size="md" footer={
      <>
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md border border-line text-xs hover:bg-line/40">Cancel</button>
        <button type="button" onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)} disabled={isPending || !ticker.trim() || !qty.trim() || !avgCost.trim()} className="px-3 py-1.5 rounded-md bg-accent text-white text-xs hover:bg-accent/90 disabled:opacity-50">
          {isPending ? 'Adding…' : 'Add'}
        </button>
      </>
    }>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Ticker (Yahoo Symbol)</label>
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="e.g. RELIANCE.NS, TCS.NS, AAPL" autoFocus className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Quantity</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" step="any" min="0" placeholder="10" className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Avg Buy Price</label>
            <input value={avgCost} onChange={(e) => setAvgCost(e.target.value)} type="number" step="any" min="0" placeholder="2450.50" className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Sector</label>
            <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent">
              <option value="">— None —</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Sector Domain</label>
            <select value={sectorDomainId} onChange={(e) => setSectorDomainId(e.target.value)} className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent">
              <option value="">— None —</option>
              {sectorDomains.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="text-2xs text-loss">{error.message}</p>}
      </form>
    </Modal>
  );
}
