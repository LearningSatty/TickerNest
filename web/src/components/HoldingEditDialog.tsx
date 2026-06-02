/**
 * Holding edit dialog. The single write surface: user supplies (qty, avgCost),
 * optionally (soldPrice, reason, mistake) when reducing qty. The server
 * snapshots cost_basis_at_sell from the OLD avg automatically.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  formatMoney,
  formatPct,
  formatSignedMoney,
  trendClass,
} from '@/lib/format';
import type {
  BrokerHolding,
  UpsertHoldingPayload,
  UpsertHoldingResponse,
} from '@/types/api';

interface Props {
  brokerId: string;
  brokerDisplayName: string;
  current: BrokerHolding;
  onClose: () => void;
}

export function HoldingEditDialog({
  brokerId,
  brokerDisplayName,
  current,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(current.qty);
  const [avgCost, setAvgCost] = useState(current.avgCost);
  const [soldPrice, setSoldPrice] = useState('');
  const [reason, setReason] = useState('');
  const [mistake, setMistake] = useState('');

  const isReducing =
    new Decimal(qty || '0').lt(new Decimal(current.qty)) &&
    !new Decimal(qty || '0').isZero();
  const isFullExit = !!qty && new Decimal(qty).isZero();
  const showSellMeta = isReducing || isFullExit;

  // preview math
  const preview = (() => {
    try {
      const newQty = new Decimal(qty || '0');
      const newAvg = new Decimal(avgCost || '0');
      const ltp = new Decimal(current.currentPrice ?? '0');
      const investedNew = newQty.mul(newAvg);
      const currentValueNew = newQty.mul(ltp);
      const pnl = currentValueNew.sub(investedNew);
      const pnlPct = investedNew.isZero() ? new Decimal(0) : pnl.div(investedNew);
      return {
        invested: investedNew.toFixed(2),
        currentValue: currentValueNew.toFixed(2),
        pnl: pnl.toFixed(2),
        pnlPct: pnlPct.toString(),
      };
    } catch {
      return null;
    }
  })();

  const mut = useMutation({
    mutationFn: (payload: UpsertHoldingPayload) =>
      api<UpsertHoldingResponse>(
        `/holdings/${brokerId}/${current.ticker}`,
        {
          method: 'PUT',
          body: payload,
          idempotencyKey: uuidv4(),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings', brokerId] });
      qc.invalidateQueries({ queryKey: ['portfolio', 'consolidated'] });
      qc.invalidateQueries({ queryKey: ['sold-shares'] });
      onClose();
    },
  });

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const submit = () => {
    const payload: UpsertHoldingPayload = {
      qty,
      avgCost,
      ...(soldPrice && { soldPrice }),
      ...(reason && { reason }),
      ...(mistake && { mistake }),
    };
    mut.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{current.ticker}</h2>
            <p className="text-2xs text-ink-muted">
              {current.name ?? ''} · {brokerDisplayName}
            </p>
          </div>
          <span className="chip chip-flat">
            {showSellMeta ? (isFullExit ? 'Full Exit' : 'Reduce') : 'Update'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Quantity" value={qty} onChange={setQty} />
          <Field label="Avg. Price" value={avgCost} onChange={setAvgCost} />
        </div>

        {showSellMeta && (
          <div className="mt-4 border-t border-line/60 pt-4 space-y-3">
            <p className="text-xs text-ink-muted">
              Cost basis snapshotted at <span className="num text-ink">{formatMoney(current.avgCost)}</span> on sell — immutable.
            </p>
            <Field
              label="Sold Price (optional)"
              value={soldPrice}
              onChange={setSoldPrice}
            />
            <Textarea label="Reason" value={reason} onChange={setReason} />
            <Textarea label="Mistake (retrospective)" value={mistake} onChange={setMistake} />
          </div>
        )}

        {preview && (
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-line/40 p-3 text-2xs">
            <PreviewCell label="Invested" value={formatMoney(preview.invested)} />
            <PreviewCell label="Curr. Value" value={formatMoney(preview.currentValue)} />
            <PreviewCell
              label="P/L"
              value={formatSignedMoney(preview.pnl)}
              tone={trendClass(preview.pnl)}
              sub={formatPct(preview.pnlPct)}
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-sm rounded-md border border-line hover:bg-line/40"
            onClick={onClose}
            disabled={mut.isPending}
          >
            Cancel
          </button>
          <button
            className={cn(
              'px-3 py-1.5 text-sm rounded-md font-medium',
              showSellMeta
                ? 'bg-loss/20 text-loss hover:bg-loss/30'
                : 'bg-accent text-white hover:bg-accent/90',
            )}
            onClick={submit}
            disabled={mut.isPending}
          >
            {mut.isPending ? 'Saving…' : showSellMeta ? 'Save & Record Sell' : 'Save'}
          </button>
        </div>

        {mut.error && (
          <p className="mt-3 text-2xs text-loss">
            {(mut.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs uppercase tracking-wide text-ink-muted">{label}</span>
      <input
        className="num bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs uppercase tracking-wide text-ink-muted">{label}</span>
      <textarea
        className="bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent min-h-[60px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
    </label>
  );
}

function PreviewCell({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-ink-muted">{label}</span>
      <span className={cn('num text-sm font-medium', tone)}>{value}</span>
      {sub && <span className={cn('text-2xs', tone ?? 'text-ink-muted')}>{sub}</span>}
    </div>
  );
}
