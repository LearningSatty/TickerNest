import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney, formatPct, formatQty, formatSignedMoney, trendClass } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { SoldShare } from '@/types/api';

export default function SoldShares() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['sold-shares'],
    queryFn: () => api<SoldShare[]>('/sold-shares'),
  });

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Sold Shares</h1>
        <p className="text-2xs text-ink-muted">
          Cost basis is frozen at sell time. Reason / Mistake fields are editable retrospective notes.
        </p>
      </header>
      <div className="card overflow-hidden">
        <table className="table-pivot w-full">
          <thead>
            <tr>
              <th className="text-left">Sold Date</th>
              <th className="text-left">Ticker</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Sold At</th>
              <th className="text-right">Cost Basis</th>
              <th className="text-right">Gross P/L</th>
              <th className="text-right">P/L %</th>
              <th className="text-left">Reason</th>
              <th className="text-left">Mistake</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="h-9 animate-pulse bg-line/30" /></tr>
            )}
            {rows.map((r) => (
              <Row key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row }: { row: SoldShare }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState(row.reason ?? '');
  const [mistake, setMistake] = useState(row.mistake ?? '');

  const mut = useMutation({
    mutationFn: (patch: { reason?: string; mistake?: string; soldPrice?: string }) =>
      api(`/sold-shares/${row.id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sold-shares'] }),
  });

  const sold = row.soldPrice ? new Decimal(row.soldPrice) : null;
  const basis = new Decimal(row.costBasisAtSell);
  const qty = new Decimal(row.qty);
  const grossPnl = sold ? sold.sub(basis).mul(qty) : null;
  const pnlPct = sold && !basis.isZero() ? sold.sub(basis).div(basis) : null;

  return (
    <tr>
      <td className="text-ink-muted">{new Date(row.soldAt).toLocaleDateString()}</td>
      <td className="font-medium">{row.ticker}</td>
      <td className="text-right">{formatQty(row.qty)}</td>
      <td className="text-right">{sold ? formatMoney(sold) : <em className="text-ink-dim">—</em>}</td>
      <td className="text-right text-ink-muted">{formatMoney(basis)}</td>
      <td className={cn('text-right', grossPnl ? trendClass(grossPnl) : 'text-ink-dim')}>
        {grossPnl ? formatSignedMoney(grossPnl) : '—'}
      </td>
      <td className={cn('text-right', pnlPct ? trendClass(pnlPct) : 'text-ink-dim')}>
        {pnlPct ? formatPct(pnlPct) : '—'}
      </td>
      <td>
        <input
          className="bg-bg border border-line rounded px-2 py-1 text-sm w-full"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => reason !== (row.reason ?? '') && mut.mutate({ reason })}
        />
      </td>
      <td>
        <input
          className="bg-bg border border-line rounded px-2 py-1 text-sm w-full"
          value={mistake}
          onChange={(e) => setMistake(e.target.value)}
          onBlur={() => mistake !== (row.mistake ?? '') && mut.mutate({ mistake })}
        />
      </td>
    </tr>
  );
}
