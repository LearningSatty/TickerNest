import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useConsolidated } from '@/hooks/usePortfolio';
import { formatMoney, formatPct, formatSignedMoney, trendClass } from '@/lib/format';
import { cn } from '@/lib/cn';

interface Mover {
  ticker: string;
  changePct: string;
  ltp: string;
}
interface MoversResp {
  gainers: Mover[];
  losers: Mover[];
}

export default function Dashboard() {
  const { data: portfolio } = useConsolidated();
  const { data: movers } = useQuery({
    queryKey: ['movers'],
    queryFn: () => api<MoversResp>('/movers?threshold=0.10'),
    staleTime: 5_000,
  });

  return (
    <div className="p-6 space-y-4">
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

