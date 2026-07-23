/**
 * Portfolio Onboarding — 6-step wizard (redesigned).
 *
 * Step 1: Upload Excel → see list of sheets
 * Step 2: Select sheet → preview raw grid → select range
 * Step 3: Map columns (ticker, qty, avg) + set broker name
 * Step 4: Transform tickers (rules + verify against Yahoo) ← NEW
 * Step 5: Preview final data with computed columns
 * Step 6: Done
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import { SERVICES } from '@/lib/services';

const BASE = SERVICES.onboarding;

async function onboardingApi<T>(path: string, opts: { method?: string; body?: unknown; formData?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const tok = sessionStorage.getItem('tn:jwt');
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body || opts.formData ? 'POST' : 'GET'),
    headers,
    ...(body !== undefined && { body }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error((payload as { message?: string })?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface SheetMeta { name: string; rowCount: number; colCount: number; }
interface SheetPreview { grid: string[][]; totalRows: number; totalCols: number; }
interface ExtractedData { headers: string[]; rows: string[][]; }
interface TransformRule { kind: 'UPPERCASE' | 'STRIP_PREFIX' | 'STRIP_SUFFIX' | 'APPEND_SUFFIX' | 'REGEX_REPLACE'; config: Record<string, unknown>; }
interface TransformPreviewRow { source: string; resolved: string; }
interface VerifyResult { sourceTicker: string; resolvedTicker: string; status: 'VERIFIED' | 'UNVERIFIED' | 'FAILED'; canonicalName?: string; }

/** Parse a range expression like "1-5, 8, 10-12" into a Set of 1-based indices. */
function parseRangeExpr(expr: string): Set<number> {
  const result = new Set<number>();
  for (const part of expr.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const dashIdx = trimmed.indexOf('-');
    if (dashIdx > 0) {
      const start = parseInt(trimmed.slice(0, dashIdx), 10);
      const end = parseInt(trimmed.slice(dashIdx + 1), 10);
      if (!isNaN(start) && !isNaN(end) && start >= 1 && end >= start) {
        for (let i = start; i <= Math.min(end, 10000); i++) result.add(i);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n) && n >= 1) result.add(n);
    }
  }
  return result;
}

type Step = 'upload' | 'preview' | 'extract' | 'transform' | 'confirm' | 'done';
const STEP_LABELS: Record<Step, string> = {
  upload: 'Upload',
  preview: 'Sheet & Range',
  extract: 'Map Columns',
  transform: 'Transform & Verify',
  confirm: 'Preview',
  done: 'Done',
};

export default function PortfolioOnboarding() {
  const [step, setStep] = useState<Step>('upload');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [rowsExpr, setRowsExpr] = useState('');
  const [colsExpr, setColsExpr] = useState('');
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);

  // Step 3: column mapping + broker
  const [tickerCol, setTickerCol] = useState(0);
  const [qtyCol, setQtyCol] = useState(1);
  const [avgCol, setAvgCol] = useState(2);
  const [brokerName, setBrokerName] = useState('');
  const [exchangeDefault, setExchangeDefault] = useState<'NSE' | 'BSE' | 'NASDAQ' | 'NYSE'>('NSE');

  // Step 4: transform
  const [rules, setRules] = useState<TransformRule[]>([
    { kind: 'UPPERCASE', config: {} },
    { kind: 'APPEND_SUFFIX', config: { suffix: '.NS' } },
  ]);
  const [transformPreview, setTransformPreview] = useState<TransformPreviewRow[]>([]);
  const [verifyResults, setVerifyResults] = useState<Map<string, VerifyResult>>(new Map());

  // ─── Mutations ───────────────────────────────────────────────────────────
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return onboardingApi<{ uploadId: string; sheets: SheetMeta[] }>('/upload', { formData: fd });
    },
    onSuccess: (data) => {
      setUploadId(data.uploadId);
      setSheets(data.sheets);
      setStep('preview');
      if (data.sheets.length === 1) handleSelectSheet(data.uploadId, data.sheets[0]!.name);
    },
  });

  const previewMut = useMutation({
    mutationFn: (vars: { uploadId: string; sheetName: string }) =>
      onboardingApi<SheetPreview>(`/upload/${vars.uploadId}/sheet/${encodeURIComponent(vars.sheetName)}`),
    onSuccess: (data) => {
      setPreview(data);
      setRowsExpr(`1-${data.totalRows}`);
      setColsExpr(`1-${data.totalCols}`);
    },
  });

  const extractMut = useMutation({
    mutationFn: () =>
      onboardingApi<ExtractedData>(`/upload/${uploadId}/extract`, {
        body: { sheetName: selectedSheet, rows: rowsExpr, cols: colsExpr },
      }),
    onSuccess: (data) => {
      setExtracted(data);
      autoDetectMapping(data.headers);
      setStep('extract');
    },
  });

  const transformPreviewMut = useMutation({
    mutationFn: () => {
      const tickers = extracted!.rows
        .map((r) => String(r[tickerCol] ?? '').trim())
        .filter(Boolean)
        .filter((t) => !t.includes('[object')); // skip broken cells
      return onboardingApi<{ results: TransformPreviewRow[] }>(`/upload/${uploadId}/transform-preview`, {
        body: { tickers, rules },
      });
    },
    onSuccess: (data) => {
      setTransformPreview(data.results);
      setStep('transform');
    },
  });

  const verifyMut = useMutation({
    mutationFn: () => {
      const tickers = transformPreview.map((t) => t.resolved);
      const unique = [...new Set(tickers)];
      return onboardingApi<{ results: VerifyResult[] }>(`/upload/${uploadId}/verify-tickers`, {
        body: { tickers: unique },
      });
    },
    onSuccess: (data) => {
      const map = new Map<string, VerifyResult>();
      for (const r of data.results) map.set(r.resolvedTicker, r);
      setVerifyResults(map);
    },
  });

  const saveMut = useMutation({
    mutationFn: () => {
      // Send the full ticker mapping (user's final edits from Step 4)
      // This is the authoritative source→resolved map for every row.
      const tickerMap: Array<{ source: string; resolved: string }> = transformPreview.map((t) => ({
        source: t.source,
        resolved: t.resolved,
      }));
      return onboardingApi<{ portfolioId: string; brokerId: string; holdingsCreated: number }>(`/upload/${uploadId}/save`, {
        body: {
          brokerName: brokerName.trim(),
          exchangeDefault,
          sheetName: selectedSheet,
          rows: rowsExpr,
          cols: colsExpr,
          columnMapping: { ticker: tickerCol, qty: qtyCol, avgCost: avgCol },
          transformRules: rules,
          tickerMap,
        },
      });
    },
    onSuccess: () => setStep('done'),
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const handleSelectSheet = (uid: string, name: string) => {
    setSelectedSheet(name);
    previewMut.mutate({ uploadId: uid, sheetName: name });
  };

  const autoDetectMapping = (headers: string[]) => {
    const lower = headers.map((h) => h.toLowerCase());
    const tickerIdx = lower.findIndex((h) => h.includes('ticker') || h.includes('symbol') || h.includes('stock') || h.includes('scrip'));
    const qtyIdx = lower.findIndex((h) => h.includes('qty') || h.includes('quantity') || h.includes('shares') || h.includes('units'));
    const avgIdx = lower.findIndex((h) => h.includes('avg') || h.includes('average') || h.includes('cost') || h.includes('price') || h.includes('buy'));
    if (tickerIdx >= 0) setTickerCol(tickerIdx);
    if (qtyIdx >= 0) setQtyCol(qtyIdx);
    if (avgIdx >= 0) setAvgCol(avgIdx);
  };

  /** Apply transform rules locally (client-side) — mirrors backend logic. */
  const applyRulesLocal = (source: string): string => {
    let result = source.trim();
    for (const rule of rules) {
      switch (rule.kind) {
        case 'UPPERCASE': result = result.toUpperCase(); break;
        case 'STRIP_PREFIX':
          for (const p of ((rule.config['prefixes'] as string[]) ?? []))
            if (result.startsWith(p)) { result = result.slice(p.length); break; }
          break;
        case 'STRIP_SUFFIX':
          for (const s of ((rule.config['suffixes'] as string[]) ?? []))
            if (result.endsWith(s)) { result = result.slice(0, -s.length); break; }
          break;
        case 'APPEND_SUFFIX': {
          const suffix = (rule.config['suffix'] as string) ?? '';
          if (suffix && !result.endsWith(suffix)) result += suffix;
          break;
        }
        case 'REGEX_REPLACE': {
          const pattern = rule.config['pattern'] as string;
          const replacement = (rule.config['replacement'] as string) ?? '';
          if (pattern) try { result = result.replace(new RegExp(pattern), replacement); } catch { /* skip */ }
          break;
        }
      }
    }
    return result;
  };

  const addRule = (kind: TransformRule['kind']) => {
    const defaults: Record<string, Record<string, unknown>> = {
      UPPERCASE: {},
      STRIP_PREFIX: { prefixes: ['NSE:', 'BOM:'] },
      STRIP_SUFFIX: { suffixes: ['-EQ', '-BE'] },
      APPEND_SUFFIX: { suffix: '.NS' },
      REGEX_REPLACE: { pattern: '', replacement: '' },
    };
    setRules([...rules, { kind, config: defaults[kind] ?? {} }]);
  };

  const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));

  const updateRuleConfig = (idx: number, config: Record<string, unknown>) => {
    setRules(rules.map((r, i) => i === idx ? { ...r, config } : r));
  };

  const reset = () => {
    setStep('upload');
    setUploadId(null);
    setSheets([]);
    setSelectedSheet(null);
    setPreview(null);
    setExtracted(null);
    setBrokerName('');
    setTransformPreview([]);
    setVerifyResults(new Map());
  };

  // Computed preview for Step 5
  // We pair transformPreview entries with qty/avg from extracted.rows.
  // transformPreview was built from non-empty ticker cells in order, so we rebuild
  // the same filtered list to get the corresponding qty/avg.
  const confirmData = useMemo(() => {
    if (!extracted || transformPreview.length === 0) return [];

    // Build the same filtered row list that was sent to transform-preview
    const dataRows = extracted.rows
      .map((row, idx) => ({ row, idx, rawTicker: String(row[tickerCol] ?? '').trim() }))
      .filter((r) => r.rawTicker && !r.rawTicker.includes('[object'));

    return transformPreview.slice(0, 50).map((tp, i) => {
      const dataRow = dataRows[i];
      const qtyStr = dataRow ? String(dataRow.row[qtyCol] ?? '0') : '0';
      const avgStr = dataRow ? String(dataRow.row[avgCol] ?? '0') : '0';
      const qty = parseFloat(qtyStr.replace(/,/g, ''));
      const avg = parseFloat(avgStr.replace(/,/g, ''));
      const verify = verifyResults.get(tp.resolved);
      return {
        idx: i,
        source: tp.source,
        resolved: tp.resolved,
        status: verify?.status ?? 'UNVERIFIED',
        name: verify?.canonicalName,
        qty: isNaN(qty) ? 0 : qty,
        avg: isNaN(avg) ? 0 : avg,
      };
    });
  }, [extracted, transformPreview, verifyResults, tickerCol, qtyCol, avgCol]);

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <header>
        <h1 className="text-xl font-semibold">Portfolio Onboarding</h1>
        <p className="text-2xs text-ink-muted">
          Upload Excel → select sheet → map columns → transform tickers → save as broker.
        </p>
      </header>

      {/* Manage Sectors (collapsible) */}
      <SectorManager />

      {/* Step indicator */}
      <div className="flex items-center gap-1 text-2xs flex-wrap">
        {(Object.keys(STEP_LABELS) as Step[]).map((s, i) => (
          <span key={s} className={cn('px-2 py-0.5 rounded', step === s ? 'bg-accent text-white' : 'bg-line/40 text-ink-muted')}>
            {i + 1}. {STEP_LABELS[s]}
          </span>
        ))}
      </div>

      {/* ═══════════════ Step 1: Upload ═══════════════ */}
      {step === 'upload' && (
        <div className="card p-5 space-y-4">
          <p className="text-sm text-ink-muted">Upload your portfolio Excel (.xlsx). One sheet = one broker.</p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); }}
            className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-white file:cursor-pointer"
          />
          {uploadMut.isPending && <p className="text-2xs text-ink-muted">Parsing Excel…</p>}
          {uploadMut.error && <p className="text-2xs text-loss">{(uploadMut.error as Error).message}</p>}
        </div>
      )}

      {/* ═══════════════ Step 2: Sheet & Range ═══════════════ */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <h2 className="text-sm font-semibold">Select a sheet</h2>
            <div className="flex flex-wrap gap-2">
              {sheets.map((s) => (
                <button key={s.name} onClick={() => handleSelectSheet(uploadId!, s.name)}
                  className={cn('px-3 py-1.5 rounded-md text-xs border transition-colors', selectedSheet === s.name ? 'border-accent bg-accent/10 text-accent font-medium' : 'border-line hover:border-accent/50 text-ink-muted')}>
                  {s.name} <span className="text-2xs text-ink-muted ml-1">({s.rowCount}×{s.colCount})</span>
                </button>
              ))}
            </div>
          </div>
          {previewMut.isPending && <p className="text-2xs text-ink-muted">Loading sheet…</p>}
          {preview && selectedSheet && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-line/60 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Preview: {selectedSheet}</h2>
                  <span className="text-2xs text-ink-muted">{preview.totalRows} rows × {preview.totalCols} cols</span>
                </div>
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <label className="flex items-center gap-1.5">
                    <span className="text-ink-muted">Rows:</span>
                    <input value={rowsExpr} onChange={(e) => setRowsExpr(e.target.value)} placeholder="e.g. 1-50 or 1-5, 8" className="w-40 bg-bg border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-accent" />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="text-ink-muted">Cols:</span>
                    <input value={colsExpr} onChange={(e) => setColsExpr(e.target.value)} placeholder="e.g. 1-6 or 1, 2, 5-7" className="w-40 bg-bg border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-accent" />
                  </label>
                  <span className="text-2xs text-ink-muted/70">Selected: {parseRangeExpr(rowsExpr).size} rows × {parseRangeExpr(colsExpr).size} cols</span>
                </div>
              </div>
              <div className="overflow-auto max-h-[350px]">
                <PreviewGrid grid={preview.grid} rowsExpr={rowsExpr} colsExpr={colsExpr} />
              </div>
              <div className="px-4 py-3 border-t border-line/60 flex items-center justify-between">
                <button onClick={reset} className="text-2xs text-ink-muted hover:text-ink">← Start over</button>
                <button onClick={() => extractMut.mutate()} disabled={extractMut.isPending || parseRangeExpr(rowsExpr).size === 0}
                  className="px-4 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50">
                  {extractMut.isPending ? 'Extracting…' : 'Next →'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ Step 3: Map Columns ═══════════════ */}
      {step === 'extract' && extracted && (
        <div className="space-y-4">
          <div className="card p-4 space-y-4">
            <h2 className="text-sm font-semibold">Map Columns & Name Broker</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Ticker / Symbol</label>
                <select value={tickerCol} onChange={(e) => setTickerCol(+e.target.value)} className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm">
                  {extracted.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Quantity</label>
                <select value={qtyCol} onChange={(e) => setQtyCol(+e.target.value)} className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm">
                  {extracted.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Avg Cost / Buy Price</label>
                <select value={avgCol} onChange={(e) => setAvgCol(+e.target.value)} className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm">
                  {extracted.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Broker Name</label>
                <input value={brokerName} onChange={(e) => setBrokerName(e.target.value)} placeholder="e.g. Zerodha, Groww, Angel One" className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-2xs uppercase tracking-wide text-ink-muted mb-1">Exchange</label>
                <select value={exchangeDefault} onChange={(e) => setExchangeDefault(e.target.value as typeof exchangeDefault)} className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm">
                  <option value="NSE">NSE (Indian)</option>
                  <option value="BSE">BSE (Indian)</option>
                  <option value="NASDAQ">NASDAQ (US)</option>
                  <option value="NYSE">NYSE (US)</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => setStep('preview')} className="text-2xs text-ink-muted hover:text-ink">← Back</button>
            <button onClick={() => transformPreviewMut.mutate()} disabled={transformPreviewMut.isPending || !brokerName.trim()}
              className="px-4 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50">
              {transformPreviewMut.isPending ? 'Transforming…' : 'Next: Transform Tickers →'}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════ Step 4: Transform & Verify ═══════════════ */}
      {step === 'transform' && (
        <div className="space-y-4">
          <div className="card p-4 space-y-4">
            <h2 className="text-sm font-semibold">Ticker Transformation Rules</h2>
            <p className="text-2xs text-ink-muted">
              Rules transform your source tickers (e.g. "RELIANCE") into Yahoo-compatible format (e.g. "RELIANCE.NS").
              Edit, add or remove rules and verify the results.
            </p>

            {/* Rules list */}
            <div className="space-y-2">
              {rules.map((rule, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-bg-soft/60 rounded-md px-3 py-2">
                  <span className="text-2xs text-ink-muted w-5">{idx + 1}.</span>
                  <span className="text-xs font-medium w-32">{rule.kind}</span>
                  <RuleConfigEditor rule={rule} onChange={(config) => updateRuleConfig(idx, config)} />
                  <button onClick={() => removeRule(idx)} className="text-2xs text-ink-muted hover:text-loss ml-auto shrink-0">✕</button>
                </div>
              ))}
            </div>

            {/* Add rule */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xs text-ink-muted">+ Add:</span>
              {(['UPPERCASE', 'APPEND_SUFFIX', 'STRIP_PREFIX', 'STRIP_SUFFIX', 'REGEX_REPLACE'] as const).map((kind) => (
                <button key={kind} onClick={() => addRule(kind)} className="px-2 py-0.5 rounded border border-line text-2xs hover:border-accent/50">
                  {kind}
                </button>
              ))}
            </div>

            {/* Quick presets */}
            <div className="flex items-center gap-2 flex-wrap border-t border-line/40 pt-3">
              <span className="text-2xs text-ink-muted">Presets:</span>
              <button onClick={() => setRules([{ kind: 'UPPERCASE', config: {} }, { kind: 'APPEND_SUFFIX', config: { suffix: '.NS' } }])} className="px-2 py-0.5 rounded bg-line/40 text-2xs hover:bg-accent/10">Google Sheets (NSE)</button>
              <button onClick={() => setRules([{ kind: 'STRIP_SUFFIX', config: { suffixes: ['-EQ', '-BE'] } }, { kind: 'UPPERCASE', config: {} }, { kind: 'APPEND_SUFFIX', config: { suffix: '.NS' } }])} className="px-2 py-0.5 rounded bg-line/40 text-2xs hover:bg-accent/10">Groww</button>
              <button onClick={() => setRules([{ kind: 'UPPERCASE', config: {} }])} className="px-2 py-0.5 rounded bg-line/40 text-2xs hover:bg-accent/10">US Stocks</button>
              <button onClick={() => setRules([{ kind: 'UPPERCASE', config: {} }, { kind: 'APPEND_SUFFIX', config: { suffix: '.BO' } }])} className="px-2 py-0.5 rounded bg-line/40 text-2xs hover:bg-accent/10">BSE</button>
            </div>
          </div>

          {/* Transform preview table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Transform Preview ({transformPreview.length} tickers)</h3>
              <button onClick={() => verifyMut.mutate()} disabled={verifyMut.isPending}
                className="px-3 py-1 rounded-md border border-accent text-accent text-xs font-medium hover:bg-accent/10 disabled:opacity-50">
                {verifyMut.isPending ? 'Verifying…' : '🔍 Verify All Against Yahoo'}
              </button>
            </div>
            <div className="overflow-auto max-h-[300px]">
              <table className="table-pivot w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left">Source (editable)</th>
                    <th className="text-left">→ Resolved (editable)</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {transformPreview.slice(0, 100).map((t, i) => {
                    const v = verifyResults.get(t.resolved);
                    return (
                      <tr key={i} className={cn(v?.status === 'FAILED' && 'bg-loss/5')}>
                        <td>
                          <input
                            value={t.source}
                            onChange={(e) => {
                              const newSource = e.target.value;
                              const newResolved = applyRulesLocal(newSource);
                              const updated = [...transformPreview];
                              updated[i] = { source: newSource, resolved: newResolved };
                              setTransformPreview(updated);
                              // Clear old verification since resolved changed
                              setVerifyResults((prev) => { const next = new Map(prev); next.delete(t.resolved); return next; });
                            }}
                            className="w-full bg-transparent border-b border-transparent hover:border-line focus:border-accent focus:outline-none text-xs px-0 py-0.5"
                          />
                        </td>
                        <td>
                          <input
                            value={t.resolved}
                            onChange={(e) => {
                              const updated = [...transformPreview];
                              updated[i] = { ...updated[i]!, resolved: e.target.value };
                              setTransformPreview(updated);
                              // Clear old verification for this ticker
                              setVerifyResults((prev) => { const next = new Map(prev); next.delete(t.resolved); return next; });
                            }}
                            className="w-full bg-transparent border-b border-transparent hover:border-line focus:border-accent focus:outline-none text-xs font-medium px-0 py-0.5"
                          />
                        </td>
                        <td>
                          {!v && <span className="text-ink-muted">—</span>}
                          {v?.status === 'VERIFIED' && <span className="text-gain">✓ OK</span>}
                          {v?.status === 'FAILED' && <span className="text-loss">✗ Failed</span>}
                          {v?.status === 'UNVERIFIED' && <span className="text-yellow-500">⚠ Check</span>}
                        </td>
                        <td className="text-ink-muted truncate max-w-[200px]">{v?.canonicalName ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-line/60 flex items-center justify-between">
              <div className="flex gap-3">
                <button onClick={() => setStep('extract')} className="text-2xs text-ink-muted hover:text-ink">← Back to mapping</button>
                <button onClick={() => { transformPreviewMut.mutate(); }} className="text-2xs text-accent hover:underline">↻ Re-apply rules</button>
              </div>
              <button onClick={() => setStep('confirm')} className="px-4 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90">
                Next: Confirm & Save →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ Step 5: Confirm & Save ═══════════════ */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <div className="card p-4 space-y-2">
            <h2 className="text-sm font-semibold">Final Preview</h2>
            <p className="text-2xs text-ink-muted">
              Broker: <span className="font-medium text-ink">{brokerName}</span> · Exchange: {exchangeDefault} · {confirmData.length} holdings
            </p>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-auto max-h-[400px]">
              <table className="table-pivot w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left">Yahoo Symbol</th>
                    <th className="text-left">Name</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Avg Cost</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmData.map((row) => (
                    <tr key={row.idx}>
                      <td className="font-medium">{row.resolved}</td>
                      <td className="text-ink-muted truncate max-w-[200px]">{row.name ?? '—'}</td>
                      <td className="text-right num">{row.qty}</td>
                      <td className="text-right num">{row.avg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td className="text-center">
                        {row.status === 'VERIFIED' && <span className="text-gain text-2xs">✓</span>}
                        {row.status === 'FAILED' && <span className="text-loss text-2xs">✗</span>}
                        {row.status === 'UNVERIFIED' && <span className="text-yellow-500 text-2xs">⚠</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-line/60 flex items-center justify-between">
              <button onClick={() => setStep('transform')} className="text-2xs text-ink-muted hover:text-ink">← Back to transform</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !brokerName.trim()}
                className="px-4 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50">
                {saveMut.isPending ? 'Saving…' : `Save "${brokerName}" with ${confirmData.length} holdings →`}
              </button>
            </div>
          </div>
          {saveMut.error && <p className="text-2xs text-loss">{(saveMut.error as Error).message}</p>}
        </div>
      )}

      {/* ═══════════════ Step 6: Done ═══════════════ */}
      {step === 'done' && saveMut.data && (
        <div className="card p-6 space-y-4 text-center">
          <div className="text-4xl">✅</div>
          <h2 className="text-lg font-semibold">Onboarding Complete!</h2>
          <p className="text-sm text-ink-muted">
            Broker <span className="font-medium text-ink">"{brokerName}"</span> created with{' '}
            <span className="font-medium text-accent">{saveMut.data.holdingsCreated}</span> holdings.
          </p>
          <p className="text-2xs text-ink-muted">
            Tickers transformed using {rules.length} rule{rules.length !== 1 ? 's' : ''} and saved with Yahoo-compatible symbols.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <button onClick={reset} className="px-4 py-2 rounded-md border border-line text-sm hover:bg-line/40">
              Upload another broker
            </button>
            <a href="/portfolio" className="px-4 py-2 rounded-md bg-accent text-white text-sm hover:bg-accent/90">
              View Portfolio →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rule config editor (inline) ─────────────────────────────────────────────
function RuleConfigEditor({ rule, onChange }: { rule: TransformRule; onChange: (config: Record<string, unknown>) => void }) {
  switch (rule.kind) {
    case 'UPPERCASE':
      return <span className="text-2xs text-ink-muted italic">→ convert to UPPERCASE</span>;
    case 'APPEND_SUFFIX':
      return (
        <input
          value={(rule.config['suffix'] as string) ?? ''}
          onChange={(e) => onChange({ suffix: e.target.value })}
          placeholder=".NS"
          className="w-20 bg-bg border border-line rounded px-2 py-0.5 text-xs"
        />
      );
    case 'STRIP_PREFIX':
      return (
        <input
          value={((rule.config['prefixes'] as string[]) ?? []).join(', ')}
          onChange={(e) => onChange({ prefixes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="NSE:, BOM:"
          className="w-40 bg-bg border border-line rounded px-2 py-0.5 text-xs"
        />
      );
    case 'STRIP_SUFFIX':
      return (
        <input
          value={((rule.config['suffixes'] as string[]) ?? []).join(', ')}
          onChange={(e) => onChange({ suffixes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="-EQ, -BE"
          className="w-40 bg-bg border border-line rounded px-2 py-0.5 text-xs"
        />
      );
    case 'REGEX_REPLACE':
      return (
        <div className="flex gap-1">
          <input value={(rule.config['pattern'] as string) ?? ''} onChange={(e) => onChange({ ...rule.config, pattern: e.target.value })} placeholder="pattern" className="w-24 bg-bg border border-line rounded px-2 py-0.5 text-xs" />
          <span className="text-ink-muted">→</span>
          <input value={(rule.config['replacement'] as string) ?? ''} onChange={(e) => onChange({ ...rule.config, replacement: e.target.value })} placeholder="replacement" className="w-24 bg-bg border border-line rounded px-2 py-0.5 text-xs" />
        </div>
      );
    default:
      return null;
  }
}

// ─── Preview grid with range highlighting ────────────────────────────────────
function PreviewGrid({ grid, rowsExpr, colsExpr }: { grid: string[][]; rowsExpr: string; colsExpr: string }) {
  const selectedRows = parseRangeExpr(rowsExpr);
  const selectedCols = parseRangeExpr(colsExpr);
  return (
    <table className="text-xs border-collapse w-full">
      <tbody>
        {grid.slice(0, 100).map((row, ri) => {
          const rowNum = ri + 1;
          const rowSelected = selectedRows.has(rowNum);
          return (
            <tr key={ri} className={cn(rowSelected ? 'bg-accent/5' : 'opacity-40')}>
              <td className={cn('px-1.5 py-0.5 border border-line/30 text-2xs w-8 text-center sticky left-0', rowSelected ? 'bg-accent/10 text-accent font-medium' : 'bg-bg-soft/60 text-ink-muted')}>
                {rowNum}
              </td>
              {row.map((cell, ci) => {
                const colNum = ci + 1;
                const isSelected = rowSelected && selectedCols.has(colNum);
                return (
                  <td key={ci} className={cn('px-1.5 py-0.5 border border-line/30 truncate max-w-[150px]', isSelected ? 'bg-accent/10' : 'opacity-40')}>
                    {cell || <span className="text-ink-muted/40">—</span>}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Sector & Domain Manager (collapsible) ───────────────────────────────────
interface MasterItem { id: string; name: string; }

function SectorManager() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newSector, setNewSector] = useState('');
  const [newDomain, setNewDomain] = useState('');

  const { data: sectors = [] } = useQuery({
    queryKey: ['master-sectors'],
    queryFn: () => api<MasterItem[]>('/master/sectors'),
    staleTime: 300_000,
  });
  const { data: domains = [] } = useQuery({
    queryKey: ['master-sector-domains'],
    queryFn: () => api<MasterItem[]>('/master/sector-domains'),
    staleTime: 300_000,
  });

  const addSectorMut = useMutation({
    mutationFn: (name: string) => api<MasterItem>('/master/sectors', { method: 'POST', body: { name } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['master-sectors'] }); setNewSector(''); },
  });
  const deleteSectorMut = useMutation({
    mutationFn: (id: string) => api(`/master/sectors/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master-sectors'] }),
  });
  const addDomainMut = useMutation({
    mutationFn: (name: string) => api<MasterItem>('/master/sector-domains', { method: 'POST', body: { name } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['master-sector-domains'] }); setNewDomain(''); },
  });
  const deleteDomainMut = useMutation({
    mutationFn: (id: string) => api(`/master/sector-domains/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master-sector-domains'] }),
  });

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-sm hover:bg-line/20"
      >
        <span className="font-medium">Manage Sectors & Domains</span>
        <span className={cn('text-ink-muted transition-transform', open && 'rotate-180')}>▼</span>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-line/40 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sectors */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">Sectors ({sectors.length})</h3>
            <div className="flex gap-1.5">
              <input value={newSector} onChange={(e) => setNewSector(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newSector.trim()) addSectorMut.mutate(newSector.trim()); }}
                placeholder="e.g. Technology, Banking" className="flex-1 bg-bg border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-accent" />
              <button onClick={() => { if (newSector.trim()) addSectorMut.mutate(newSector.trim()); }} disabled={!newSector.trim()} className="px-2 py-1 rounded bg-accent text-white text-2xs disabled:opacity-50">Add</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
              {sectors.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-line/40 text-2xs">
                  {s.name}
                  <button onClick={() => deleteSectorMut.mutate(s.id)} className="text-ink-muted hover:text-loss">✕</button>
                </span>
              ))}
            </div>
          </div>
          {/* Sector Domains */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">Sector Domains ({domains.length})</h3>
            <div className="flex gap-1.5">
              <input value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newDomain.trim()) addDomainMut.mutate(newDomain.trim()); }}
                placeholder="e.g. Cloud, EV, Fintech" className="flex-1 bg-bg border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-accent" />
              <button onClick={() => { if (newDomain.trim()) addDomainMut.mutate(newDomain.trim()); }} disabled={!newDomain.trim()} className="px-2 py-1 rounded bg-accent text-white text-2xs disabled:opacity-50">Add</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
              {domains.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-line/40 text-2xs">
                  {d.name}
                  <button onClick={() => deleteDomainMut.mutate(d.id)} className="text-ink-muted hover:text-loss">✕</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
