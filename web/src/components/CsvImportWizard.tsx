/**
 * CSV import wizard. Two screens:
 *   1. File pick + mode toggle (REPLACE / MERGE).
 *   2. Diff preview with row-level kind classification; user clicks Commit
 *      to write trades.
 *
 * Mapping is applied server-side via the saved broker.csv_profile; the user
 * can override mappings on the broker page (not here).
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney, formatQty } from '@/lib/format';
import type { Broker, CsvImportPreview } from '@/types/api';

interface Props {
  broker: Broker;
  onClose: () => void;
  onCommitted: () => void;
}

type Mode = 'REPLACE' | 'MERGE';

export function CsvImportWizard({ broker, onClose, onCommitted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('REPLACE');
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [filter, setFilter] = useState<
    'ALL' | 'ADD' | 'UPDATE' | 'UNCHANGED' | 'REMOVE'
  >('ALL');

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('pick a file');
      const fd = new FormData();
      fd.append('file', file);
      return api<CsvImportPreview>(`/imports/${broker.id}/preview`, {
        formData: fd,
        idempotencyKey: uuidv4(),
      });
    },
    onSuccess: (p) => setPreview(p),
  });

  const commitMut = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error('preview first');
      return api<{ rowsApplied: number }>(`/imports/${preview.importId}/commit`, {
        method: 'POST',
        body: { mode },
        idempotencyKey: uuidv4(),
      });
    },
    onSuccess: () => onCommitted(),
  });

  const visibleRows = (preview?.rows ?? []).filter(
    (r) => filter === 'ALL' || r.kind === filter,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <header className="flex items-baseline justify-between p-5 border-b border-line/60">
          <div>
            <h2 className="text-lg font-semibold">Import CSV — {broker.displayName}</h2>
            <p className="text-2xs text-ink-muted">Exchange: {broker.exchangeDefault}</p>
          </div>
          <button
            className="text-ink-muted hover:text-ink"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {!preview ? (
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-2xs uppercase tracking-wide text-ink-muted">
                CSV File
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-2xs uppercase tracking-wide text-ink-muted">
                Mode
              </label>
              <div className="flex gap-2">
                <ModeToggle current={mode} target="REPLACE" set={setMode}>
                  Replace<br/>
                  <span className="text-2xs text-ink-muted">Tickers missing from CSV become full exits</span>
                </ModeToggle>
                <ModeToggle current={mode} target="MERGE" set={setMode}>
                  Merge<br/>
                  <span className="text-2xs text-ink-muted">Only update tickers in the CSV</span>
                </ModeToggle>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                className="px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                disabled={!file || previewMut.isPending}
                onClick={() => previewMut.mutate()}
              >
                {previewMut.isPending ? 'Parsing…' : 'Preview Diff'}
              </button>
            </div>
            {previewMut.error && (
              <p className="text-2xs text-loss">{(previewMut.error as Error).message}</p>
            )}
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b border-line/60 flex items-center gap-3 text-2xs">
              <CountChip kind="ADD" n={preview.adds} active={filter === 'ADD'} onClick={() => setFilter(filter === 'ADD' ? 'ALL' : 'ADD')} />
              <CountChip kind="UPDATE" n={preview.updates} active={filter === 'UPDATE'} onClick={() => setFilter(filter === 'UPDATE' ? 'ALL' : 'UPDATE')} />
              <CountChip kind="REMOVE" n={preview.removes} active={filter === 'REMOVE'} onClick={() => setFilter(filter === 'REMOVE' ? 'ALL' : 'REMOVE')} />
              <CountChip kind="UNCHANGED" n={preview.unchanged} active={filter === 'UNCHANGED'} onClick={() => setFilter(filter === 'UNCHANGED' ? 'ALL' : 'UNCHANGED')} />
              {preview.rejected > 0 && (
                <span className="chip chip-loss">Rejected {preview.rejected}</span>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              <table className="table-pivot w-full">
                <thead>
                  <tr>
                    <th className="text-left">Ticker</th>
                    <th className="text-left">Action</th>
                    <th className="text-right">Cur. Qty</th>
                    <th className="text-right">Cur. Avg</th>
                    <th className="text-right">→ Qty</th>
                    <th className="text-right">→ Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.ticker}>
                      <td className="font-medium">{r.ticker}</td>
                      <td>
                        <span className={cn(
                          'chip',
                          r.kind === 'ADD' && 'chip-gain',
                          r.kind === 'UPDATE' && 'bg-accent/15 text-accent',
                          r.kind === 'REMOVE' && 'chip-loss',
                          r.kind === 'UNCHANGED' && 'chip-flat',
                        )}>{r.kind}</span>
                      </td>
                      <td className="text-right">{r.current ? formatQty(r.current.qty) : '—'}</td>
                      <td className="text-right text-ink-muted">{r.current ? formatMoney(r.current.avgCost) : '—'}</td>
                      <td className="text-right">{r.staged ? formatQty(r.staged.qty) : '—'}</td>
                      <td className="text-right text-ink-muted">{r.staged ? formatMoney(r.staged.avgCost) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="p-4 border-t border-line/60 flex justify-between items-center">
              <p className="text-2xs text-ink-muted">
                Mode: <span className="text-ink font-medium">{mode}</span> · {visibleRows.length} of {preview.rows.length} rows shown
              </p>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 text-sm rounded-md border border-line hover:bg-line/40"
                  onClick={() => setPreview(null)}
                >
                  Back
                </button>
                <button
                  className="px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                  disabled={commitMut.isPending}
                  onClick={() => commitMut.mutate()}
                >
                  {commitMut.isPending ? 'Committing…' : 'Commit Import'}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function ModeToggle({
  current, target, set, children,
}: { current: Mode; target: Mode; set: (m: Mode) => void; children: React.ReactNode }) {
  const active = current === target;
  return (
    <button
      onClick={() => set(target)}
      className={cn(
        'flex-1 text-left px-3 py-2 rounded-md border text-sm',
        active ? 'border-accent bg-accent/10' : 'border-line hover:bg-line/40',
      )}
    >
      {children}
    </button>
  );
}

function CountChip({
  kind, n, active, onClick,
}: { kind: 'ADD' | 'UPDATE' | 'UNCHANGED' | 'REMOVE'; n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'chip cursor-pointer',
        kind === 'ADD' && (active ? 'chip-gain ring-1 ring-gain' : 'chip-gain'),
        kind === 'UPDATE' && (active ? 'bg-accent/30 text-accent ring-1 ring-accent' : 'bg-accent/15 text-accent'),
        kind === 'REMOVE' && (active ? 'chip-loss ring-1 ring-loss' : 'chip-loss'),
        kind === 'UNCHANGED' && (active ? 'chip-flat ring-1 ring-flat' : 'chip-flat'),
      )}
    >
      {kind} {n}
    </button>
  );
}
