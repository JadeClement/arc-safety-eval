import { useId, useMemo } from 'react';
import type { CausalGraph } from '../types';
import { DEFAULT_SVG_THEME, VALUE_SVG_THEME } from '../lib/valueGraphTheme';

/** Approximate monospace-per-char width for ui-sans-serif fontWeight 600 */
function charPx(fontSize: number): number {
  return fontSize * 0.58;
}

function lineHeightPx(fontSize: number): number {
  return fontSize * 1.38;
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const t = text.trim();
  if (!t) return ['—'];
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length + 3) {
    const last = lines[maxLines - 1];
    if (!last.endsWith('…')) lines[maxLines - 1] = last.length > 2 ? `${last.slice(0, Math.max(0, last.length - 2))}…` : '…';
  }
  return lines;
}

function measureBlock(lines: string[], fontSize: number): { w: number; h: number } {
  const cp = charPx(fontSize);
  const lh = lineHeightPx(fontSize);
  const w = Math.max(...lines.map(l => l.length * cp), fontSize * 2);
  const n = lines.length;
  const h = n <= 0 ? lh : (n - 1) * lh + fontSize * 1.25;
  return { w, h };
}

type FitOpts = {
  minFont: number;
  startFont: number;
  maxLines: number;
  minRx: number;
  minRy: number;
  /** Target max single-line width in px before wrapping grows vertically */
  wrapWidthPx: number;
  /** Extra half-padding inside oval horizontally / vertically (px added beyond half text bounds). */
  insetXPx?: number;
  insetYPx?: number;
};

/** Choose font size and wrapping so the text block fits in a reasonably sized oval; grow rx/ry from content. */
function fitTextToOval(text: string, opts: FitOpts): { lines: string[]; fontSize: number; rx: number; ry: number } {
  let fontSize = opts.startFont;
  const wrapSlack = 20;
  const insetX = opts.insetXPx ?? 20;
  const insetY = opts.insetYPx ?? 24;

  for (;;) {
    const maxChars = Math.max(6, Math.floor((opts.wrapWidthPx - wrapSlack) / charPx(fontSize)));
    const lines = wrapLines(text, maxChars, opts.maxLines);
    const { w, h } = measureBlock(lines, fontSize);
    const rx = Math.max(opts.minRx, w / 2 + insetX);
    const ry = Math.max(opts.minRy, h / 2 + insetY);

    const tooWide = w > opts.wrapWidthPx && fontSize > opts.minFont;
    if (!tooWide || fontSize <= opts.minFont) {
      return { lines, fontSize, rx, ry };
    }
    fontSize = Math.max(opts.minFont, fontSize - 0.5);
  }
}

function SvgLabel({
  x,
  y,
  lines,
  color,
  size = 11,
}: {
  x: number;
  y: number;
  lines: string[];
  color: string;
  size?: number;
}) {
  const lh = lineHeightPx(size);
  const startY = y - ((lines.length - 1) * lh) / 2;
  return (
    <text x={x} y={startY} textAnchor="middle" fill={color} fontSize={size} fontWeight={600} fontFamily="ui-sans-serif, system-ui, sans-serif">
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

const NODE_GAP = 32;
const LAYER_GAP = 36;
const SIDE_PAD = 56;

type ValueLayout = {
  id: string;
  x: number;
  lines: string[];
  fontSize: number;
  rx: number;
  ry: number;
  themeFill: string;
  themeStroke: string;
  themeLabel: string;
};

type ConcernLayoutFull = {
  concern: CausalGraph['concerns'][number];
  cx: number;
  rawCx: number;
  themeKey: string;
  lines: string[];
  fontSize: number;
  rx: number;
  ry: number;
};

type WarrantLayout = {
  concernId: string;
  cx: number;
  lines: string[];
  fontSize: number;
  rx: number;
  ry: number;
};

type EdgeSeg = { d: string; key: string; stroke: string };

/**
 * Single SVG per source: all values on one top band, concerns and warrants below,
 * with edges warrant → concern → value(s). Ovals size to contained label text.
 */
export function CausalFullGraph({ graph }: { graph: CausalGraph }) {
  const markerId = useId().replace(/:/g, '');

  const layout = useMemo(() => {
    const values = [...graph.values].sort((a, b) => a.id.localeCompare(b.id));
    const concerns = [...graph.concerns];
    const empty = {
      width: 520,
      vbH: 120,
      valueNodes: [] as ValueLayout[],
      concernLayouts: [] as ConcernLayoutFull[],
      warrantLayouts: [] as WarrantLayout[],
      edges: [] as EdgeSeg[],
      cv: 0,
      cc: 0,
      cw: 0,
    };

    if (values.length === 0 && concerns.length === 0) return empty;

    const valueLayouts: ValueLayout[] = values.map(v => {
      const t = VALUE_SVG_THEME[v.id] ?? DEFAULT_SVG_THEME;
      const fit = fitTextToOval(`${v.id}: ${v.label}`, {
        minFont: 8,
        startFont: 11,
        maxLines: 10,
        minRx: 52,
        minRy: 28,
        wrapWidthPx: 200,
        insetXPx: 18,
        insetYPx: 24,
      });
      return {
        id: v.id,
        x: 0,
        lines: fit.lines,
        fontSize: fit.fontSize,
        rx: fit.rx,
        ry: fit.ry,
        themeFill: t.fill,
        themeStroke: t.stroke,
        themeLabel: t.label,
      };
    });

    if (valueLayouts.length > 0) {
      let cx = SIDE_PAD + valueLayouts[0]!.rx;
      for (let i = 0; i < valueLayouts.length; i++) {
        const v = valueLayouts[i]!;
        v.x = cx;
        const next = valueLayouts[i + 1];
        if (next) {
          cx = v.x + v.rx + NODE_GAP + next.rx;
        }
      }
    }

    let widthLocal =
      valueLayouts.length > 0
        ? valueLayouts[valueLayouts.length - 1]!.x + valueLayouts[valueLayouts.length - 1]!.rx + SIDE_PAD
        : 520;
    widthLocal = Math.max(480, widthLocal);

    const valueXById = new Map(valueLayouts.map(v => [v.id, v.x]));

    const concernSized: ConcernLayoutFull[] = concerns.map(c => {
      const xs = c.mapped_values.map(vid => valueXById.get(vid)).filter((n): n is number => n !== undefined);
      const rawCx = xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : widthLocal / 2;
      const themeKey = c.mapped_values[0] ?? 'V1';
      const fit = fitTextToOval(c.text || '—', {
        minFont: 8,
        startFont: 10,
        maxLines: 12,
        minRx: 50,
        minRy: 26,
        wrapWidthPx: 220,
        insetXPx: 20,
        insetYPx: 28,
      });
      return {
        concern: c,
        cx: rawCx,
        rawCx,
        themeKey,
        lines: fit.lines,
        fontSize: fit.fontSize,
        rx: fit.rx,
        ry: fit.ry,
      };
    });

    concernSized.sort((a, b) => a.rawCx - b.rawCx);
    let lastEdge = -1e9;
    for (const cl of concernSized) {
      const need = lastEdge + cl.rx + NODE_GAP;
      cl.cx = Math.max(cl.rawCx, need);
      const maxR = widthLocal - SIDE_PAD - cl.rx;
      const minR = SIDE_PAD + cl.rx;
      cl.cx = Math.min(Math.max(cl.cx, minR), maxR);
      lastEdge = cl.cx + cl.rx;
    }

    const maxConcRight = concernSized.length > 0 ? Math.max(...concernSized.map(cl => cl.cx + cl.rx)) + SIDE_PAD : widthLocal;
    widthLocal = Math.max(widthLocal, maxConcRight);

    const warrantLayouts: WarrantLayout[] = concernSized.map(cl => {
      const wy = graph.warrants.find(w => w.concern_id === cl.concern.id);
      const wText = wy?.text?.trim() ? wy.text : '(No warrant)';
      const fit = fitTextToOval(wText, {
        minFont: 7.5,
        startFont: 9.5,
        maxLines: 12,
        minRx: 48,
        minRy: 26,
        wrapWidthPx: 240,
        insetXPx: 20,
        insetYPx: 34,
        minRy: 22,
        wrapWidthPx: 240,
      });
      return {
        concernId: cl.concern.id,
        cx: cl.cx,
        lines: fit.lines,
        fontSize: fit.fontSize,
        rx: fit.rx,
        ry: fit.ry,
      };
    });

    const maxRyV = valueLayouts.length > 0 ? Math.max(...valueLayouts.map(v => v.ry)) : 0;
    const maxRyC = concernSized.length > 0 ? Math.max(...concernSized.map(c => c.ry)) : 0;
    const maxRyW = warrantLayouts.length > 0 ? Math.max(...warrantLayouts.map(w => w.ry)) : 0;

    const cv = SIDE_PAD + maxRyV;
    const cc = cv + maxRyV + LAYER_GAP + maxRyC;
    const cw = cc + maxRyC + LAYER_GAP + maxRyW;
    const vbH = cw + maxRyW + SIDE_PAD;

    const vById = new Map(valueLayouts.map(v => [v.id, v] as const));

    const edges: EdgeSeg[] = [];
    for (let i = 0; i < concernSized.length; i++) {
      const cl = concernSized[i]!;
      const c = cl.concern;
      const theme = VALUE_SVG_THEME[cl.themeKey] ?? DEFAULT_SVG_THEME;
      const warr = warrantLayouts[i]!;

      const topWarrant = cw - warr.ry;
      const bottomConcern = cc + cl.ry;
      edges.push({
        key: `w-c-${c.id}`,
        d: `M ${cl.cx} ${topWarrant} L ${cl.cx} ${bottomConcern}`,
        stroke: theme.edge,
      });

      const topConcern = cc - cl.ry;
      for (const vid of c.mapped_values) {
        const vn = vById.get(vid);
        if (!vn) continue;
        const bottomValue = cv + vn.ry;
        edges.push({
          key: `c-v-${c.id}-${vid}`,
          d: `M ${cl.cx} ${topConcern} L ${vn.x} ${bottomValue}`,
          stroke: theme.edge,
        });
      }
    }

    return {
      width: widthLocal,
      vbH,
      valueNodes: valueLayouts.map(v => ({ ...v })),
      concernLayouts: concernSized.map(c => ({ ...c, cx: c.cx })),
      warrantLayouts,
      edges,
      cv,
      cc,
      cw,
    };
  }, [graph]);

  if (graph.values.length === 0 && graph.concerns.length === 0) {
    return (
      <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-8 text-center text-sm text-amber-900">
        No graph nodes in this response.
      </div>
    );
  }

  const { width, vbH, valueNodes, concernLayouts, warrantLayouts, edges, cv, cc, cw } = layout;

  return (
    <div className="w-full overflow-x-auto rounded-lg bg-gradient-to-b from-slate-50/90 to-white border border-slate-100">
      <svg
        width="100%"
        height={vbH}
        viewBox={`0 0 ${width} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        className="block min-h-[320px]"
        aria-label="Full causal argument graph for this source"
      >
        <defs>
          <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 Z" fill="#94a3b8" />
          </marker>
        </defs>

        {edges.map(e => (
          <path
            key={e.key}
            d={e.d}
            fill="none"
            stroke={e.stroke}
            strokeWidth={1.35}
            markerEnd={`url(#${markerId})`}
          />
        ))}

        {valueNodes.map(v => (
          <g key={v.id}>
            <ellipse
              cx={v.x}
              cy={cv}
              rx={v.rx}
              ry={v.ry}
              fill={v.themeFill}
              stroke={v.themeStroke}
              strokeWidth={2.5}
            />
            <SvgLabel x={v.x} y={cv} lines={v.lines} color={v.themeLabel} size={v.fontSize} />
          </g>
        ))}

        {concernLayouts.map(cl => {
          const t = VALUE_SVG_THEME[cl.themeKey] ?? DEFAULT_SVG_THEME;
          return (
            <g key={cl.concern.id}>
              <ellipse
                cx={cl.cx}
                cy={cc}
                rx={cl.rx}
                ry={cl.ry}
                fill={t.fill}
                stroke={t.stroke}
                strokeWidth={2}
              />
              <SvgLabel x={cl.cx} y={cc} lines={cl.lines} color={t.label} size={cl.fontSize} />
            </g>
          );
        })}

        {warrantLayouts.map(w => (
          <g key={`w-${w.concernId}`}>
            <ellipse
              cx={w.cx}
              cy={cw}
              rx={w.rx}
              ry={w.ry}
              fill="#ffffff"
              stroke="#cbd5e1"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
            <SvgLabel x={w.cx} y={cw} lines={w.lines} color="#475569" size={w.fontSize} />
          </g>
        ))}
      </svg>

      <p className="text-[10px] text-slate-400 text-center px-3 pb-2 tracking-wide uppercase">
        One graph per source — warrants support concerns, concerns link to value(s)
      </p>
    </div>
  );
}
