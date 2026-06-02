/**
 * One-shot Excel onboarding — drop the user's existing My-Portfolio.xlsx
 * and the server runs each broker sheet through the diff engine in a
 * single TX.
 */
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { api } from '@/lib/api';

interface OnboardResult {
  excelImportId: string;
  perBroker: Array<{
    brokerId: string;
    brokerName: string;
    parsedRows: number;
    rejectedRows: number;
    adds: number;
    updates: number;
    unchanged: number;
    removes: number;
    tradesCreated: number;
  }>;
}

export default function ExcelOnboard() {
  const [file, setFile] = useState<File | null>(null);
  const mut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('pick a file');
      const fd = new FormData();
      fd.append('file', file);
      return api<OnboardResult>('/imports/excel', {
        formData: fd,
        idempotencyKey: uuidv4(),
      });
    },
  });

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <header>
        <h1 className="text-xl font-semibold">Excel Onboarding</h1>
        <p className="text-2xs text-ink-muted">
          Upload your existing portfolio workbook. Every broker sheet becomes a
          broker; each row becomes a holding. Wrapped in one transaction —
          partial failures roll back the whole onboarding.
        </p>
      </header>
      <div className="card p-5 space-y-4">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-white"
        />
        <button
          disabled={!file || mut.isPending}
          onClick={() => mut.mutate()}
          className="px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
        >
          {mut.isPending ? 'Onboarding…' : 'Start Onboarding'}
        </button>
        {mut.error && <p className="text-2xs text-loss">{(mut.error as Error).message}</p>}
        {mut.data && (
          <div className="border-t border-line/60 pt-4">
            <h2 className="text-sm font-semibold mb-2">Per-broker summary</h2>
            <table className="table-pivot w-full">
              <thead>
                <tr>
                  <th className="text-left">Broker</th>
                  <th className="text-right">Parsed</th>
                  <th className="text-right">Add</th>
                  <th className="text-right">Update</th>
                  <th className="text-right">Unchanged</th>
                  <th className="text-right">Remove</th>
                  <th className="text-right">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {mut.data.perBroker.map((b) => (
                  <tr key={b.brokerId}>
                    <td>{b.brokerName}</td>
                    <td className="text-right">{b.parsedRows}</td>
                    <td className="text-right text-gain">{b.adds}</td>
                    <td className="text-right text-accent">{b.updates}</td>
                    <td className="text-right text-ink-muted">{b.unchanged}</td>
                    <td className="text-right text-loss">{b.removes}</td>
                    <td className="text-right text-ink-muted">{b.rejectedRows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
