/**
 * Consolidated portfolio pivot — the Excel "Summary" sheet.
 *
 * Columns are dynamic: one (qty, avgPrice) pair per broker, in broker.sortOrder.
 * Aggregate columns + sticky-left ticker/name. Header strip above shows the
 * KPIs (Value Invested / Cur. Value / Overall % / per-broker chips).
 *
 * Virtualized with @tanstack/react-virtual so 1000+ rows feel instant.
 */
import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  formatMoney,
  formatPct,
  formatQty,
  formatSignedMoney,
  trendClass,
} from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Broker, ConsolidatedResponse, ConsolidatedRow } from '@/types/api';

interface Props {
  data: ConsolidatedResponse;
}

export function ConsolidatedPivot({ data }: Props) {
  const brokers = useMemo(
    () => [...data.brokers].sort((a, b) => a.sortOrder - b.sortOrder),
    [data.brokers],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirt = useVirtualizer({
    count: data.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  return (
    <div className="card flex flex-col overflow-hidden">
      <KpiStrip data={data} brokers={brokers} />
      <div ref={parentRef} className="overflow-auto h-[70vh]">
        <table className="table-pivot w-max min-w-full">
          <thead>
            <tr>
              <th className="text-left sticky left-0 z-20 bg-bg-soft min-w-[160px]">Ticker / Name</th>
              <th className="text-right">Total Qty</th>
              <th className="text-right">Curr. Price</th>
              <th className="text-right">Curr. Value</th>
              {brokers.flatMap((b) => [
                <th key={`${b.id}-q`} className="text-right text-accent/80">{b.displayName}</th>,
                <th key={`${b.id}-a`} className="text-right text-ink-dim">Avg.</th>,
              ])}
              <th className="text-right">Final Avg</th>
              <th className="text-right">Today Δ</th>
              <th className="text-right">Today %</th>
              <th className="text-right">Invested</th>
              <th className="text-right">Total P/L</th>
              <th className="text-right">Total P/L %</th>
              <th className="text-right">% Portfolio</th>
            </tr>
          </thead>
          <tbody style={{ position: 'relative', height: rowVirt.getTotalSize() }}>
            {rowVirt.getVirtualItems().map((vrow) => {
              const r = data.rows[vrow.index];
              if (!r) return null;
              return (
                <tr
                  key={r.ticker}
                  data-index={vrow.index}
                  ref={rowVirt.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vrow.start}px)`,
                  }}
                >
                  <PivotRow row={r} brokers={brokers} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PivotRow({ row, brokers }: { row: ConsolidatedRow; brokers: Broker[] }) {
  const cellByBroker = useMemo(() => {
    const m = new Map(row.perBroker.map((c) => [c.brokerId, c] as const));
    return m;
  }, [row.perBroker]);

  return (
    <>
      <td className="sticky left-0 bg-bg-soft">
        <div className="flex flex-col">
          <span className="font-medium">{row.ticker}</span>
          <span className="text-2xs text-ink-muted truncate max-w-[180px]">
            {row.name ?? ''}
          </span>
        </div>
      </td>
      <td className="text-right">{formatQty(row.totalQty)}</td>
      <td className="text-right">{formatMoney(row.currentPrice)}</td>
      <td className="text-right">{formatMoney(row.currentValue)}</td>
      {brokers.flatMap((b) => {
        const c = cellByBroker.get(b.id);
        const has = !!c && Number(c.qty) > 0;
        return [
          <td key={`${row.ticker}-${b.id}-q`} className={cn('text-right', !has && 'text-ink-dim')}>
            {has ? formatQty(c!.qty) : '—'}
          </td>,
          <td key={`${row.ticker}-${b.id}-a`} className={cn('text-right text-ink-dim')}>
            {has ? formatMoney(c!.avgCost) : '—'}
          </td>,
        ];
      })}
      <td className="text-right">{formatMoney(row.finalAvgValue)}</td>
      <td className={cn('text-right', trendClass(row.todaysChange))}>
        {formatSignedMoney(row.todaysChange)}
      </td>
      <td className={cn('text-right', trendClass(row.todaysChangePct))}>
        {formatPct(row.todaysChangePct)}
      </td>
      <td className="text-right">{formatMoney(row.investedValue)}</td>
      <td className={cn('text-right', trendClass(row.totalPnl))}>
        {formatSignedMoney(row.totalPnl)}
      </td>
      <td className={cn('text-right', trendClass(row.totalPnlPct))}>
        {formatPct(row.totalPnlPct)}
      </td>
      <td className="text-right text-ink-muted">{formatPct(row.percentOfPortfolio)}</td>
    </>
  );
}

function KpiStrip({ data, brokers }: { data: ConsolidatedResponse; brokers: Broker[] }) {
  return (
    <div className="border-b border-line/60 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-8 gap-y-2 items-baseline">
        <Kpi label="Value Invested" value={formatMoney(data.totalInvested)} />
        <Kpi label="Total Asset Value" value={formatMoney(data.totalCurrentValue)} accent />
        <Kpi
          label="Overall Profit"
          value={formatSignedMoney(data.overallProfit)}
          tone={Number(data.overallProfit) >= 0 ? 'gain' : 'loss'}
        />
        <Kpi
          label="Today's P/L"
          value={formatSignedMoney(data.todaysTotalProfit)}
          tone={Number(data.todaysTotalProfit) >= 0 ? 'gain' : 'loss'}
        />
        <Kpi
          label="Overall %"
          value={formatPct(data.overallProfitPct)}
          tone={Number(data.overallProfitPct) >= 0 ? 'gain' : 'loss'}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {brokers.map((b) => (
          <div key={b.id} className="chip bg-line/60 text-ink-muted">
            <span className="text-ink">{b.displayName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  label, value, tone = 'ink', accent = false,
}: { label: string; value: string; tone?: 'ink' | 'gain' | 'loss'; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span className={cn(
        'num text-lg font-semibold',
        tone === 'gain' && 'text-gain',
        tone === 'loss' && 'text-loss',
        accent && tone === 'ink' && 'text-accent',
      )}>{value}</span>
    </div>
  );
}
