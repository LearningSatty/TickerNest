/**
 * Lightweight SVG line chart — no external libs.
 *
 * Features
 *   • Gridlines + Y-axis labels (5 horizontal levels)
 *   • X-axis date labels (4-6 evenly spaced ticks, format depends on range)
 *   • Hover guideline + dot + tooltip with date/price
 *   • Optional reference line (e.g. previous close on 1D charts)
 *   • onHover callback so the parent (StockDetail) can flip the hero stats
 *     to reflect the hovered point
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface ChartPoint {
  t: number;
  close: number | null;
}

export type ChartRange = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '5y' | 'max';

interface Props {
  points: ChartPoint[];
  /** Drives X-axis label format ("HH:MM" for 1D, "MMM DD" for 5D-1M, etc.) */
  range?: ChartRange;
  /** Reference line value — typically previous close for 1D charts. */
  reference?: number | null;
  /** Defaults to 'auto' — green if last >= first, red otherwise. */
  tone?: 'auto' | 'gain' | 'loss' | 'neutral';
  /** Currency for the hover tooltip; defaults to INR. */
  currency?: 'INR' | 'USD';
  /** Fired on hover so the parent can update the hero label. */
  onHover?: (point: { t: number; close: number; index: number } | null) => void;
  height?: number;
}

const COLOURS = {
  gain: '#22c55e',
  loss: '#ef4444',
  neutral: '#7c5cff',
};

export default function StockChart({
  points,
  range = '1mo',
  reference,
  tone = 'auto',
  currency = 'INR',
  onHover,
  height = 280,
}: Props) {
  const valid = useMemo(
    () => points.filter((p): p is { t: number; close: number } => p.close != null),
    [points],
  );

  if (valid.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-ink-muted"
        style={{ height }}
      >
        Not enough data points to draw chart.
      </div>
    );
  }

  const minClose = Math.min(...valid.map((p) => p.close));
  const maxClose = Math.max(...valid.map((p) => p.close));
  const range01 = maxClose - minClose || 1;
  const padPct = 0.08;
  const yMin = Math.max(0, minClose - range01 * padPct);
  const yMax = maxClose + range01 * padPct;
  const yRange = yMax - yMin || 1;

  const tMin = valid[0]!.t;
  const tMax = valid[valid.length - 1]!.t;
  const tRangeS = tMax - tMin || 1;

  // Layout constants — leave room for axis labels.
  const W = 800;
  const H = height;
  const padL = 56;        // y-axis label area
  const padR = 8;
  const padT = 8;
  const padB = 22;        // x-axis label area
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (t: number) => padL + ((t - tMin) / tRangeS) * innerW;
  const y = (c: number) => padT + (1 - (c - yMin) / yRange) * innerH;

  const pathD =
    `M ${x(valid[0]!.t).toFixed(2)} ${y(valid[0]!.close).toFixed(2)}` +
    valid
      .slice(1)
      .map((p) => ` L ${x(p.t).toFixed(2)} ${y(p.close).toFixed(2)}`)
      .join('');

  const areaD =
    `${pathD} L ${x(tMax).toFixed(2)} ${(padT + innerH).toFixed(2)}` +
    ` L ${x(tMin).toFixed(2)} ${(padT + innerH).toFixed(2)} Z`;

  const last = valid[valid.length - 1]!.close;
  const first = valid[0]!.close;
  const computedTone =
    tone !== 'auto' ? tone : last >= first ? 'gain' : 'loss';
  const stroke = COLOURS[computedTone];

  // ── Hover tracking ─────────────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<{
    t: number;
    close: number;
    sx: number;
    sy: number;
    index: number;
  } | null>(null);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      // Map screen-space x → SVG viewBox x.
      const vx = ((e.clientX - rect.left) / rect.width) * W;
      if (vx < padL || vx > padL + innerW) {
        setHover(null);
        onHover?.(null);
        return;
      }
      // Find the data index whose x is closest to vx.
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < valid.length; i++) {
        const d = Math.abs(x(valid[i]!.t) - vx);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const p = valid[best]!;
      setHover({
        t: p.t,
        close: p.close,
        sx: x(p.t),
        sy: y(p.close),
        index: best,
      });
      onHover?.({ t: p.t, close: p.close, index: best });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valid, range, yMin, yMax, tMin, tMax],
  );

  const onMouseLeave = useCallback(() => {
    setHover(null);
    onHover?.(null);
  }, [onHover]);

  // Notify parent that hover ended when component unmounts / range changes.
  useEffect(() => {
    return () => onHover?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // ── Y-axis labels (5 evenly spaced levels) ─────────────────────────────────
  const yTicks = niceYTicks(yMin, yMax, 5);

  // ── X-axis labels (4-6 evenly spaced) ──────────────────────────────────────
  const xTickCount = range === '1d' ? 4 : range === '5d' ? 4 : range === '1mo' || range === '3mo' ? 5 : 6;
  const xTickIndices = pickXTickIndices(valid.length, xTickCount);

  const fmtAxisDate = (epoch: number) => formatAxisDate(epoch, range);
  const fmtTooltipDate = (epoch: number) => formatTooltipDate(epoch, range);
  const fmtPrice = (n: number) =>
    new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(n);
  const symbol = currency === 'USD' ? '$' : '₹';

  return (
    <div className="w-full relative" style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        className="block"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <defs>
          <linearGradient id="tn-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines + labels */}
        {yTicks.map((v) => {
          const yp = y(v);
          if (yp < padT - 0.5 || yp > padT + innerH + 0.5) return null;
          return (
            <g key={`y-${v}`}>
              <line
                x1={padL}
                x2={padL + innerW}
                y1={yp}
                y2={yp}
                stroke="#1f242c"
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={yp + 3}
                fontSize="10"
                textAnchor="end"
                fill="#9aa3b2"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {fmtPrice(v)}
              </text>
            </g>
          );
        })}

        {/* Reference line (e.g. previous close on 1D) */}
        {reference != null && reference >= yMin && reference <= yMax && (
          <g>
            <line
              x1={padL}
              x2={padL + innerW}
              y1={y(reference)}
              y2={y(reference)}
              stroke="#9aa3b2"
              strokeDasharray="3 4"
              strokeWidth={1}
              opacity={0.7}
            />
            <text
              x={padL + innerW - 4}
              y={y(reference) - 3}
              fontSize="9.5"
              textAnchor="end"
              fill="#9aa3b2"
              fontFamily="Inter, system-ui, sans-serif"
            >
              Prev close
            </text>
          </g>
        )}

        {/* Area + line */}
        <path d={areaD} fill="url(#tn-chart-fill)" />
        <path
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* X-axis labels */}
        {xTickIndices.map((idx) => {
          const t = valid[idx]!.t;
          return (
            <text
              key={`x-${idx}`}
              x={x(t)}
              y={padT + innerH + 14}
              fontSize="10"
              textAnchor="middle"
              fill="#9aa3b2"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {fmtAxisDate(t)}
            </text>
          );
        })}

        {/* Hover crosshair + dot */}
        {hover && (
          <g>
            <line
              x1={hover.sx}
              x2={hover.sx}
              y1={padT}
              y2={padT + innerH}
              stroke="#9aa3b2"
              strokeDasharray="3 3"
              strokeWidth={1}
              opacity={0.6}
            />
            <circle
              cx={hover.sx}
              cy={hover.sy}
              r={4.5}
              fill={stroke}
              stroke="#0b0d10"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>

      {/* HTML tooltip — positioned over the SVG.  Using HTML (not SVG <text>)
          because the chart uses preserveAspectRatio="none" which would warp text. */}
      {hover && (
        <Tooltip
          containerWidth={svgRef.current?.clientWidth ?? 0}
          containerHeight={svgRef.current?.clientHeight ?? height}
          xPctInSvg={hover.sx / W}
          yPctInSvg={hover.sy / H}
          symbol={symbol}
          price={fmtPrice(hover.close)}
          date={fmtTooltipDate(hover.t)}
        />
      )}
    </div>
  );
}

function Tooltip({
  containerWidth,
  containerHeight,
  xPctInSvg,
  yPctInSvg,
  symbol,
  price,
  date,
}: {
  containerWidth: number;
  containerHeight: number;
  xPctInSvg: number;
  yPctInSvg: number;
  symbol: string;
  price: string;
  date: string;
}) {
  // Convert SVG-space percentages → pixel offsets in the container.
  const left = xPctInSvg * containerWidth;
  const top = yPctInSvg * containerHeight;
  // Place tooltip 12px above the dot; flip below if too close to top.
  const showAbove = top > 60;
  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    left,
    top,
    transform: showAbove
      ? 'translate(-50%, calc(-100% - 12px))'
      : 'translate(-50%, 12px)',
    pointerEvents: 'none',
    zIndex: 5,
  };
  // Clamp to container edges so it doesn't escape.
  if (left < 80) tooltipStyle.transform = (tooltipStyle.transform as string).replace('-50%', '0%').replace('translate(0%', 'translate(0%');
  if (left > containerWidth - 80) tooltipStyle.transform = (tooltipStyle.transform as string).replace('-50%', '-100%');
  return (
    <div style={tooltipStyle}>
      <div className="bg-bg-soft border border-line rounded-md px-2.5 py-1.5 text-2xs shadow-lg whitespace-nowrap">
        <div className="font-medium num">
          {symbol}
          {price}
        </div>
        <div className="text-ink-muted">{date}</div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function niceYTicks(min: number, max: number, count: number): number[] {
  const range = max - min;
  if (range <= 0) return [min];
  const rawStep = range / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm =
    norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const step = niceNorm * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  return ticks;
}

function pickXTickIndices(len: number, count: number): number[] {
  if (len <= count) return Array.from({ length: len }, (_, i) => i);
  // Skip the very first and last so labels don't crowd the edges.
  const usable = len - 2;
  const step = usable / (count - 1);
  const out = new Set<number>();
  for (let i = 0; i < count; i++) {
    out.add(Math.round(1 + i * step));
  }
  return [...out].sort((a, b) => a - b);
}

function formatAxisDate(epoch: number, range: ChartRange): string {
  const d = new Date(epoch * 1000);
  if (range === '1d') {
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  if (range === '5d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (range === '1mo' || range === '3mo') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (range === '6mo' || range === '1y') {
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  // 5y / max
  return d.toLocaleDateString('en-US', { year: 'numeric' });
}

function formatTooltipDate(epoch: number, range: ChartRange): string {
  const d = new Date(epoch * 1000);
  if (range === '1d' || range === '5d') {
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
