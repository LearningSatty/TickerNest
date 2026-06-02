/**
 * Per-broker holdings view — the 17-column body matching the Excel sheets.
 * Includes the distribution-bucket strip + sector strip + CSV import button.
 */
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Decimal from 'decimal.js';
import {
  formatMoney,
  formatPct,
  formatQty,
  formatSignedMoney,
  trendClass,
} from '@/lib/format';
import { cn } from '@/lib/cn';
import { useBrokerHoldings, useBrokers } from '@/hooks/usePortfolio';
import { HoldingEditDialog } from '@/components/HoldingEditDialog';
import { CsvImportWizard } from '@/components/CsvImportWizard';
import type { BrokerHolding } from '@/types/api';

type Bucket = '-70' | '-50' | '-30' | '-15' | '+15' | '+30' | '+50' | '+75' | '+100';
const BUCKETS: { key: Bucket; label: string; predicate: (pnlPct: Decimal) => boolean; tone: 'gain' | 'loss' }[] = [
  { key: '-70', label: '<70% loss', predicate: (p) => p.lte(-0.7), tone: 'loss' },
  { key: '-50', label: '<50% loss', predicate: (p) => p.lte(-0.5) && p.gt(-0.7), tone: 'loss' },
  { key: '-30', label: '<30% loss', predicate: (p) => p.lte(-0.3) && p.gt(-0.5), tone: 'loss' },
  { key: '-15', label: '<15% loss', predicate: (p) => p.lt(0) && p.gt(-0.3), tone: 'loss' },
  { key: '+15', label: '>15% profit', predicate: (p) => p.gt(0.15) && p.lt(0.3), tone: 'gain' },
  { key: '+30', label: '>30% profit', predicate: (p) => p.gte(0.3) && p.lt(0.5), tone: 'gain' },
  { key: '+50', label: '>50% profit', predicate: (p) => p.gte(0.5) && p.lt(0.75), tone: 'gain' },
  { key: '+75', label: '>75% profit', predicate: (p) => p.gte(0.75) && p.lt(1), tone: 'gain' },
  { key: '+100', label: '+100%', predicate: (p) => p.gte(1), tone: 'gain' },
];

export default function BrokerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: brokers } = useBrokers();
  const { data: holdings = [], isLoading } = useBrokerHoldings(id);
  const broker = brokers?.find((b) => b.id === id);
  const [editing, setEditing] = useState<BrokerHolding | null>(null);
  const [importing, setImporting] = useState(false);

  const stats = useMemo(() => {
    let invested = new Decimal(0);
    let curValue = new Decimal(0);
    let dayChange = new Decimal(0);
    const buckets: Record<Bucket, number> = { '-70':0,'-50':0,'-30':0,'-15':0,'+15':0,'+30':0,'+50':0,'+75':0,'+100':0 };
    const sectors = new Map<string, { cur: Decimal; prev: Decimal }>();
    for (const h of holdings) {
      const qty = new Decimal(h.qty);
      if (qty.isZero()) continue;
      const avg = new Decimal(h.avgCost);
      const ltp = new Decimal(h.currentPrice ?? '0');
      const prev = new Decimal(h.prevClose ?? '0');
      const inv = qty.mul(avg);
      const cv = qty.mul(ltp);
      invested = invested.add(inv);
      curValue = curValue.add(cv);
      dayChange = dayChange.add(qty.mul(ltp.sub(prev)));
      const pnlPct = inv.isZero() ? new Decimal(0) : cv.sub(inv).div(inv);
      for (const b of BUCKETS) if (b.predicate(pnlPct)) { buckets[b.key]++; break; }
      const sec = h.sector ?? 'UNKNOWN';
      const acc = sectors.get(sec) ?? { cur: new Decimal(0), prev: new Decimal(0) };
      acc.cur = acc.cur.add(cv);
      acc.prev = acc.prev.add(qty.mul(prev));
      sectors.set(sec, acc);
    }
    const overallPnl = curValue.sub(invested);
    const overallPnlPct = invested.isZero() ? new Decimal(0) : overallPnl.div(invested);
    const dayPct = curValue.isZero() ? new Decimal(0) : dayChange.div(curValue);
    return {
      invested: invested.toFixed(2),
      curValue: curValue.toFixed(2),
      overallPnl: overallPnl.toFixed(2),
      overallPnlPct: overallPnlPct.toString(),
      dayChange: dayChange.toFixed(2),
      dayPct: dayPct.toString(),
      buckets,
      sectors: [...sectors.entries()]
        .map(([sector, v]) => ({
          sector,
          cur: v.cur.toFixed(2),
          dayChangePct: v.prev.isZero() ? '0' : v.cur.sub(v.prev).div(v.prev).toString(),
        }))
        .sort((a, b) => Number(b.cur) - Number(a.cur))
        .slice(0, 8),
    };
  }, [holdings]);

  if (!broker) return <div className="p-6 text-ink-muted">Broker not found.</div>;

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">{broker.displayName}</h1>
          <p className="text-2xs text-ink-muted">{holdings.length} positions</p>
        </div>
        <button
          className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90"
          onClick={() => setImporting(true)}
        >
          Import CSV
        </button>
      </header>

      {/* KPI strip */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="Invested" value={formatMoney(stats.invested)} />
        <Kpi label="Cur. Value" value={formatMoney(stats.curValue)} accent />
        <Kpi label="Overall P/L" value={formatSignedMoney(stats.overallPnl)} tone={trendClass(stats.overallPnl)} sub={formatPct(stats.overallPnlPct)} />
        <Kpi label="Today Δ" value={formatSignedMoney(stats.dayChange)} tone={trendClass(stats.dayChange)} sub={formatPct(stats.dayPct)} />
        <Kpi label="Tickers" value={String(holdings.filter((h) => Number(h.qty) > 0).length)} />
      </div>

      {/* Distribution buckets */}
      <div className="card p-4">
        <div className="text-2xs uppercase tracking-wide text-ink-muted mb-2">P/L Distribution</div>
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((b) => {
            const n = stats.buckets[b.key];
            return (
              <span
                key={b.key}
                className={cn(
                  'chip',
                  n === 0 ? 'chip-flat opacity-50' : (b.tone === 'gain' ? 'chip-gain' : 'chip-loss'),
                )}
              >
                {b.label} <span className="font-semibold">{n}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Sector strip */}
      <div className="card p-4">
        <div className="text-2xs uppercase tracking-wide text-ink-muted mb-2">Top sectors</div>
        <div className="flex flex-wrap gap-2">
          {stats.sectors.map((s) => (
            <span key={s.sector} className="chip bg-line/60 text-ink">
              {s.sector}{' '}
              <span className="text-ink-muted">{formatMoney(s.cur)}</span>{' '}
              <span className={trendClass(s.dayChangePct)}>{formatPct(s.dayChangePct)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* 17-column holdings table */}
      <div className="card overflow-hidden">
        <div className="overflow-auto max-h-[60vh]">
          <table className="table-pivot w-max min-w-full">
            <thead>
              <tr>
                <th className="text-left">Ticker</th>
                <th className="text-left">Name</th>
                <th className="text-left">Sector</th>
                <th className="text-left">Sub-domain</th>
                <th className="text-left">Mkt Type</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Avg.</th>
                <th className="text-right">Cur. Price</th>
                <th className="text-right">Prev. Close</th>
                <th className="text-right">Δ</th>
                <th className="text-right">Δ %</th>
                <th className="text-right">Today P/L</th>
                <th className="text-right">Invested</th>
                <th className="text-right">Cur. Cost</th>
                <th className="text-right">Overall %</th>
                <th className="text-right">Overall P/L</th>
                <th className="text-right">PE</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={17} className="h-9 animate-pulse bg-line/30" />
                    </tr>
                  ))
                : holdings.map((h) => (
                    <HoldingRow
                      key={`${h.brokerId}-${h.ticker}`}
                      h={h}
                      onEdit={() => setEditing(h)}
                    />
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <HoldingEditDialog
          brokerId={broker.id}
          brokerDisplayName={broker.displayName}
          current={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && (
        <CsvImportWizard
          broker={broker}
          onClose={() => setImporting(false)}
          onCommitted={() => setImporting(false)}
        />
      )}
    </div>
  );
}

function HoldingRow({ h, onEdit }: { h: BrokerHolding; onEdit: () => void }) {
  const qty = new Decimal(h.qty);
  const avg = new Decimal(h.avgCost);
  const ltp = new Decimal(h.currentPrice ?? '0');
  const prev = new Decimal(h.prevClose ?? '0');
  const change = ltp.sub(prev);
  const changePct = prev.isZero() ? new Decimal(0) : change.div(prev);
  const todayPnl = qty.mul(change);
  const invested = qty.mul(avg);
  const curCost = qty.mul(ltp);
  const overallPnl = curCost.sub(invested);
  const overallPct = invested.isZero() ? new Decimal(0) : overallPnl.div(invested);
  const isZero = qty.isZero();
  return (
    <tr
      onClick={onEdit}
      className={cn('cursor-pointer', isZero && 'opacity-50 italic')}
    >
      <td className="font-medium">{h.ticker}</td>
      <td className="text-ink-muted truncate max-w-[180px]">{h.name ?? ''}</td>
      <td className="text-ink-muted">{h.sector ?? ''}</td>
      <td className="text-ink-muted">{h.sectorDomain ?? ''}</td>
      <td className="text-ink-muted">{h.marketType ?? ''}</td>
      <td className="text-right">{formatQty(h.qty)}</td>
      <td className="text-right">{formatMoney(h.avgCost)}</td>
      <td className="text-right">{formatMoney(h.currentPrice ?? '0')}</td>
      <td className="text-right text-ink-muted">{formatMoney(h.prevClose ?? '0')}</td>
      <td className={cn('text-right', trendClass(change))}>{formatSignedMoney(change)}</td>
      <td className={cn('text-right', trendClass(changePct))}>{formatPct(changePct)}</td>
      <td className={cn('text-right', trendClass(todayPnl))}>{formatSignedMoney(todayPnl)}</td>
      <td className="text-right">{formatMoney(invested)}</td>
      <td className="text-right">{formatMoney(curCost)}</td>
      <td className={cn('text-right', trendClass(overallPct))}>{formatPct(overallPct)}</td>
      <td className={cn('text-right', trendClass(overallPnl))}>{formatSignedMoney(overallPnl)}</td>
      <td className="text-right text-ink-muted">{h.peRatio != null ? formatMoney(h.peRatio) : '—'}</td>
    </tr>
  );
}

function Kpi({
  label, value, tone, sub, accent,
}: { label: string; value: string; tone?: string; sub?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span className={cn('num text-lg font-semibold', tone, accent && 'text-accent')}>
        {value}
      </span>
      {sub && <span className={cn('text-2xs', tone)}>{sub}</span>}
    </div>
  );
}
