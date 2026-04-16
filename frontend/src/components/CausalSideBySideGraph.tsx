import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CausalGraph } from '../types';
import { fitTextToOval, SvgLabel } from '../lib/causalGraphTextFit';
import { warrantTextForEdge } from '../lib/causalWarrantLookup';
import { DEFAULT_SVG_THEME, VALUE_COLOURS, VALUE_SVG_THEME } from '../lib/valueGraphTheme';

const SIDE_PAD = 40;
const VERT_GAP = 84;
const TOP_PAD = 68;
const INNER_H_MIN = 200;
/** Wide gap between value ovals and claim/concern ovals — room for badges without stacking. */
const MIN_MID_CHANNEL = 320;
const STROKE_SLACK = 5;
const LINK_MARKER_PAD = 14;
const VIEW_EDGE_PAD = 44;
const BADGE_R = 13;
const BADGE_HIT_PAD = 10;
const FAN_IN_BEND_STEP = 26;
/** Spread badges along each link’s Bézier (parameter t) — stays on the curve. */
const BADGE_T_LO = 0.2;
const BADGE_T_HI = 0.78;
/** Delay before hiding so pointer can move from badge to popover without flicker. */
const POPOVER_HIDE_DELAY_MS = 140;
const CHECKBOX_SIZE = 18;
const CHECKBOX_GAP = 10;

type ValueItem = {
  id: string;
  cx: number;
  cy: number;
  lines: string[];
  fontSize: number;
  rx: number;
  ry: number;
  themeFill: string;
  themeStroke: string;
  themeLabel: string;
};

type ConcernItem = {
  id: string;
  cx: number;
  cy: number;
  lines: string[];
  fontSize: number;
  rx: number;
  ry: number;
  themeKey: string;
};

type SimpleEdge = {
  key: string;
  concernId: string;
  valueId: string;
  lineColor: string;
  strokeHex: string;
  pathD: string;
  badgeX: number;
  badgeY: number;
  labelN: number;
  warrantText: string;
  valueLabel: string;
  concernText: string;
};

type BBox = { minX: number; maxX: number; minY: number; maxY: number };

function emptyBBox(): BBox {
  return { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
}

function addPoint(b: BBox, x: number, y: number) {
  b.minX = Math.min(b.minX, x);
  b.maxX = Math.max(b.maxX, x);
  b.minY = Math.min(b.minY, y);
  b.maxY = Math.max(b.maxY, y);
}

function addEllipseBBox(b: BBox, cx: number, cy: number, rx: number, ry: number, slack: number) {
  addPoint(b, cx - rx - slack, cy - ry - slack);
  addPoint(b, cx + rx + slack, cy + ry + slack);
}

function addQuadBezierSampled(
  b: BBox,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  samples: number,
) {
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const omt = 1 - t;
    const px = omt * omt * x0 + 2 * omt * t * cx + t * t * x1;
    const py = omt * omt * y0 + 2 * omt * t * cy + t * t * y1;
    addPoint(b, px, py);
  }
}

function quadPointAt(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number) {
  const omt = 1 - t;
  return {
    x: omt * omt * x0 + 2 * omt * t * cx + t * t * x1,
    y: omt * omt * y0 + 2 * omt * t * cy + t * t * y1,
  };
}

function svgSafeLocalId(prefix: string, key: string): string {
  const p = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${p || 'mk'}-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function stackCenters(rys: number[], totalInnerH: number, stackH: number): number[] {
  const top = TOP_PAD + (totalInnerH - stackH) / 2;
  const centers: number[] = [];
  let y = top + (rys[0] ?? 0);
  for (let i = 0; i < rys.length; i++) {
    centers.push(y);
    if (i < rys.length - 1) {
      y += rys[i]! + VERT_GAP + rys[i + 1]!;
    }
  }
  return centers;
}

/**
 * Values left, claims right, numbered curved links (arrows run claim → value). Numbers sit on each curve; warrant shows on hover and hides when the pointer leaves badge + popover.
 */
export function CausalSideBySideGraph({ graph }: { graph: CausalGraph }) {
  const markerId = useId().replace(/:/g, '');
  const [selectedValueIds, setSelectedValueIds] = useState<Set<string> | null>(null);
  const [popoverKey, setPopoverKey] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelectedValueIds(new Set(graph.values.map(v => v.id)));
  }, [graph]);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHidePopover = () => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setPopoverKey(null);
      setPopoverPos(null);
    }, POPOVER_HIDE_DELAY_MS);
  };

  useEffect(() => () => clearHideTimer(), []);

  const layout = useMemo(() => {
    const selectedSet = selectedValueIds ?? new Set(graph.values.map(v => v.id));
    const values = [...graph.values].sort((a, b) => a.id.localeCompare(b.id));
    const concerns = [...graph.concerns].sort((a, b) => a.id.localeCompare(b.id));

    const valueItems: ValueItem[] = values.map(v => {
      const t = VALUE_SVG_THEME[v.id] ?? DEFAULT_SVG_THEME;
      const fit = fitTextToOval(v.label?.trim() || '—', {
        minFont: 8,
        startFont: 10,
        maxLines: 10,
        minRx: 48,
        minRy: 24,
        wrapWidthPx: 160,
        insetXPx: 16,
        insetYPx: 20,
      });
      return {
        id: v.id,
        cx: SIDE_PAD + fit.rx,
        cy: 0,
        lines: fit.lines,
        fontSize: fit.fontSize,
        rx: fit.rx,
        ry: fit.ry,
        themeFill: t.fill,
        themeStroke: t.stroke,
        themeLabel: t.label,
      };
    });

    const concernItems: ConcernItem[] = concerns.map(c => {
      const themeKey = c.mapped_values[0] ?? 'V1';
      const fit = fitTextToOval(c.text || '—', {
        minFont: 8,
        startFont: 9.5,
        maxLines: 12,
        minRx: 52,
        minRy: 26,
        wrapWidthPx: 200,
        insetXPx: 18,
        insetYPx: 26,
      });
      return {
        id: c.id,
        cx: 0,
        cy: 0,
        lines: fit.lines,
        fontSize: fit.fontSize,
        rx: fit.rx,
        ry: fit.ry,
        themeKey,
      };
    });

    const maxRxV = valueItems.length > 0 ? Math.max(...valueItems.map(v => v.rx)) : 0;
    const maxRxC = concernItems.length > 0 ? Math.max(...concernItems.map(c => c.rx)) : 0;
    const leftExtent = SIDE_PAD + 2 * maxRxV;
    const midChannel = MIN_MID_CHANNEL;
    const rightColLeft = leftExtent + midChannel;

    for (const c of concernItems) {
      c.cx = rightColLeft + c.rx;
    }

    const rysV = valueItems.map(v => v.ry);
    const rysC = concernItems.map(c => c.ry);
    const hLeft = rysV.reduce((s, r, i) => s + 2 * r + (i < rysV.length - 1 ? VERT_GAP : 0), 0);
    const hRight = rysC.reduce((s, r, i) => s + 2 * r + (i < rysC.length - 1 ? VERT_GAP : 0), 0);
    const innerH = Math.max(hLeft, hRight, INNER_H_MIN);
    const vbH = innerH + 2 * TOP_PAD;

    const cyV = stackCenters(rysV, innerH, hLeft);
    const cyC = concernItems.length === 0 ? [] : stackCenters(rysC, innerH, hRight);
    valueItems.forEach((v, i) => {
      v.cy = cyV[i] ?? v.cy;
    });
    concernItems.forEach((c, i) => {
      c.cy = cyC[i] ?? c.cy;
    });

    const vById = new Map(valueItems.map(v => [v.id, v]));

    type RawEdge = {
      key: string;
      concernId: string;
      valueId: string;
      lineColor: string;
      strokeHex: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      valueOrder: number;
    };

    const rawEdges: RawEdge[] = [];
    for (const c of concerns) {
      const cItem = concernItems.find(x => x.id === c.id);
      if (!cItem) continue;
      for (const vid of c.mapped_values) {
        if (!selectedSet.has(vid)) continue;
        const vItem = vById.get(vid);
        if (!vItem) continue;
        const vt = VALUE_SVG_THEME[vid] ?? DEFAULT_SVG_THEME;
        const x1 = SIDE_PAD + 2 * vItem.rx;
        const y1 = vItem.cy;
        const x2 = rightColLeft;
        const y2 = cItem.cy;
        const vo = valueItems.findIndex(x => x.id === vid);
        rawEdges.push({
          key: `${c.id}-${vid}`,
          concernId: c.id,
          valueId: vid,
          lineColor: vt.label,
          strokeHex: vt.stroke,
          x1,
          y1,
          x2,
          y2,
          valueOrder: vo,
        });
      }
    }

    const bendByKey = new Map<string, number>();
    const byConcern = new Map<string, RawEdge[]>();
    for (const e of rawEdges) {
      const g = byConcern.get(e.concernId) ?? [];
      g.push(e);
      byConcern.set(e.concernId, g);
    }
    for (const [, group] of byConcern) {
      if (group.length <= 1) continue;
      const sorted = [...group].sort((a, b) => a.y1 - b.y1 || a.key.localeCompare(b.key));
      const n = sorted.length;
      sorted.forEach((ge, idx) => {
        bendByKey.set(ge.key, (idx - (n - 1) / 2) * FAN_IN_BEND_STEP);
      });
    }

    const sortedForLabels = [...rawEdges].sort(
      (a, b) => a.valueOrder - b.valueOrder || a.concernId.localeCompare(b.concernId) || a.key.localeCompare(b.key),
    );
    const labelNByKey = new Map<string, number>();
    const idxByKey = new Map<string, number>();
    sortedForLabels.forEach((e, i) => {
      labelNByKey.set(e.key, i + 1);
      idxByKey.set(e.key, i);
    });

    const nEdge = sortedForLabels.length;
    const vLabel = (id: string) => graph.values.find(v => v.id === id)?.label ?? id;

    const simpleEdges: SimpleEdge[] = rawEdges.map(e => {
      const bend = bendByKey.get(e.key) ?? 0;
      const mx = (e.x1 + e.x2) / 2;
      const my = (e.y1 + e.y2) / 2;
      const dx = e.x2 - e.x1;
      const dy = e.y2 - e.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const qx = mx + nx * bend;
      const qy = my + ny * bend;
      const pathD = `M ${e.x2} ${e.y2} Q ${qx} ${qy} ${e.x1} ${e.y1}`;

      const idx = idxByKey.get(e.key) ?? 0;
      const t =
        nEdge <= 1
          ? 0.48
          : BADGE_T_LO + (idx / Math.max(1, nEdge - 1)) * (BADGE_T_HI - BADGE_T_LO);
      const pt = quadPointAt(e.x2, e.y2, qx, qy, e.x1, e.y1, 1 - t);
      const concernText = graph.concerns.find(c => c.id === e.concernId)?.text ?? e.concernId;
      return {
        key: e.key,
        concernId: e.concernId,
        valueId: e.valueId,
        lineColor: e.lineColor,
        strokeHex: e.strokeHex,
        pathD,
        badgeX: pt.x,
        badgeY: pt.y,
        labelN: labelNByKey.get(e.key) ?? 0,
        warrantText: warrantTextForEdge(graph, e.concernId, e.valueId),
        valueLabel: vLabel(e.valueId),
        concernText,
      };
    });

    const checkboxCenterX = SIDE_PAD - CHECKBOX_GAP - CHECKBOX_SIZE / 2;

    const bb = emptyBBox();
    for (const v of valueItems) {
      addEllipseBBox(bb, v.cx, v.cy, v.rx, v.ry, STROKE_SLACK);
      addPoint(bb, checkboxCenterX - CHECKBOX_SIZE / 2 - 2, v.cy - CHECKBOX_SIZE / 2 - 2);
      addPoint(bb, checkboxCenterX + CHECKBOX_SIZE / 2 + 2, v.cy + CHECKBOX_SIZE / 2 + 2);
    }
    for (const c of concernItems) {
      addEllipseBBox(bb, c.cx, c.cy, c.rx, c.ry, STROKE_SLACK);
    }
    for (const e of rawEdges) {
      const bend = bendByKey.get(e.key) ?? 0;
      const mx = (e.x1 + e.x2) / 2;
      const my = (e.y1 + e.y2) / 2;
      const dx = e.x2 - e.x1;
      const dy = e.y2 - e.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const qx = mx + nx * bend;
      const qy = my + ny * bend;
      addQuadBezierSampled(bb, e.x1, e.y1, qx, qy, e.x2, e.y2, 24);
      const lenAlong = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1;
      const ux = (e.x1 - e.x2) / lenAlong;
      const uy = (e.y1 - e.y2) / lenAlong;
      addPoint(bb, e.x1 + ux * LINK_MARKER_PAD, e.y1 + uy * LINK_MARKER_PAD);
    }
    for (const se of simpleEdges) {
      const br = BADGE_R + BADGE_HIT_PAD;
      addPoint(bb, se.badgeX - br, se.badgeY - br);
      addPoint(bb, se.badgeX + br, se.badgeY + br);
    }

    const finite = Number.isFinite(bb.minX) && Number.isFinite(bb.maxX);
    const viewX0 = finite ? bb.minX - VIEW_EDGE_PAD : 0;
    const viewY0 = finite ? bb.minY - VIEW_EDGE_PAD : TOP_PAD;
    const viewW = finite ? bb.maxX - bb.minX + 2 * VIEW_EDGE_PAD : rightColLeft + 2 * maxRxC + SIDE_PAD;
    const viewH = finite ? bb.maxY - bb.minY + 2 * VIEW_EDGE_PAD : vbH;

    const activeConcernIds = new Set(rawEdges.map(e => e.concernId));

    return {
      valueItems,
      concernItems,
      simpleEdges,
      viewX0,
      viewY0,
      viewW,
      viewH,
      checkboxCenterX,
      activeConcernIds,
    };
  }, [graph, selectedValueIds]);

  const { valueItems, concernItems, simpleEdges, viewX0, viewY0, viewW, viewH, checkboxCenterX, activeConcernIds } =
    layout;
  const selectedSet = selectedValueIds ?? new Set(graph.values.map(v => v.id));

  const warrantList = useMemo(
    () => [...simpleEdges].sort((a, b) => a.labelN - b.labelN),
    [simpleEdges],
  );
  const activeEdge = popoverKey ? simpleEdges.find(e => e.key === popoverKey) : undefined;

  useEffect(() => {
    if (popoverKey && !simpleEdges.some(e => e.key === popoverKey)) {
      clearHideTimer();
      setPopoverKey(null);
      setPopoverPos(null);
    }
  }, [popoverKey, simpleEdges]);

  function toggleValue(id: string) {
    setSelectedValueIds(prev => {
      const base = prev ?? new Set(graph.values.map(v => v.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onBadgeEnter(edge: SimpleEdge, ev: React.MouseEvent<SVGGElement>) {
    clearHideTimer();
    const r = ev.currentTarget.getBoundingClientRect();
    setPopoverPos({ left: r.left + r.width / 2, top: r.top });
    setPopoverKey(edge.key);
  }

  return (
    <div className="w-full rounded-lg bg-gradient-to-b from-slate-50/90 to-white border border-dashed border-slate-200 overflow-hidden relative">
      <div className="overflow-x-auto">
        <svg
          width="100%"
          height={viewH}
          viewBox={`${viewX0} ${viewY0} ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          className="block min-h-[260px]"
          aria-label="Values and claims with numbered links on each curve; hover a number for the warrant"
        >
          <defs>
            {simpleEdges.map(e => {
              const mid = svgSafeLocalId(markerId, e.key);
              return (
                <marker key={mid} id={mid} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M 0 0 L 7 3.5 L 0 7 Z" fill={e.lineColor} />
                </marker>
              );
            })}
          </defs>

          {simpleEdges.map(e => (
            <path
              key={`link-${e.key}`}
              d={e.pathD}
              fill="none"
              stroke={e.lineColor}
              strokeWidth={1.45}
              opacity={0.9}
              markerEnd={`url(#${svgSafeLocalId(markerId, e.key)})`}
            />
          ))}

          {simpleEdges.map(e => (
            <g
              key={`badge-${e.key}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={ev => onBadgeEnter(e, ev)}
              onMouseLeave={scheduleHidePopover}
            >
              <circle
                cx={e.badgeX}
                cy={e.badgeY}
                r={BADGE_R + BADGE_HIT_PAD}
                fill="transparent"
                pointerEvents="all"
              />
              <circle
                cx={e.badgeX}
                cy={e.badgeY}
                r={BADGE_R}
                fill="#ffffff"
                stroke={e.strokeHex}
                strokeWidth={popoverKey === e.key ? 2.8 : 2.2}
                pointerEvents="none"
              />
              <text
                x={e.badgeX}
                y={e.badgeY}
                textAnchor="middle"
                dominantBaseline="central"
                fill={e.lineColor}
                fontSize={11}
                fontWeight={700}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                pointerEvents="none"
              >
                {e.labelN}
              </text>
            </g>
          ))}

          {valueItems.map(v => {
            const checked = selectedSet.has(v.id);
            const cbx = checkboxCenterX - CHECKBOX_SIZE / 2;
            const cby = v.cy - CHECKBOX_SIZE / 2;
            return (
              <g key={v.id}>
                <g
                  role="checkbox"
                  aria-checked={checked}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  transform={`translate(${cbx}, ${cby})`}
                  onClick={e => {
                    e.stopPropagation();
                    toggleValue(v.id);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleValue(v.id);
                    }
                  }}
                >
                  <title>{checked ? 'Deselect' : 'Select'} {v.id} — show or hide warrants for this value</title>
                  <rect
                    width={CHECKBOX_SIZE}
                    height={CHECKBOX_SIZE}
                    rx={4}
                    fill="#ffffff"
                    stroke="#64748b"
                    strokeWidth={1.5}
                  />
                  {checked && (
                    <path
                      d="M 4.2 9.4 L 7.8 12.8 L 14 4.8"
                      fill="none"
                      stroke="#15803d"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </g>
                <g opacity={checked ? 1 : 0.48}>
                  <ellipse
                    cx={v.cx}
                    cy={v.cy}
                    rx={v.rx}
                    ry={v.ry}
                    fill={v.themeFill}
                    stroke={v.themeStroke}
                    strokeWidth={2.25}
                  />
                  <SvgLabel x={v.cx} y={v.cy} lines={v.lines} color={v.themeLabel} size={v.fontSize} />
                </g>
              </g>
            );
          })}

          {concernItems.map(c => {
            const t = VALUE_SVG_THEME[c.themeKey] ?? DEFAULT_SVG_THEME;
            const active = activeConcernIds.has(c.id);
            return (
              <g key={c.id} opacity={active ? 1 : 0.48}>
                <ellipse
                  cx={c.cx}
                  cy={c.cy}
                  rx={c.rx}
                  ry={c.ry}
                  fill={t.fill}
                  stroke={t.stroke}
                  strokeWidth={2}
                />
                <SvgLabel x={c.cx} y={c.cy} lines={c.lines} color={t.label} size={c.fontSize} />
              </g>
            );
          })}
        </svg>
      </div>

      {popoverKey && popoverPos && activeEdge
        && createPortal(
          <div
            ref={popoverRef}
            className="z-[200] w-[min(92vw,24rem)] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xl pointer-events-auto"
            style={{
              position: 'fixed',
              left: popoverPos.left,
              top: popoverPos.top,
              transform: 'translate(-50%, calc(-100% - 12px))',
            }}
            role="dialog"
            aria-label={`Warrant ${activeEdge.labelN}`}
            onMouseEnter={clearHideTimer}
            onMouseLeave={scheduleHidePopover}
          >
            <div className="flex items-center gap-2 mb-2 border-b border-slate-100 pb-2">
              <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold bg-white border-2 shrink-0"
                style={{
                  borderColor: activeEdge.strokeHex,
                  color: activeEdge.lineColor,
                }}
              >
                {activeEdge.labelN}
              </span>
              <p className="text-xs font-semibold text-slate-700 leading-snug">
                <span className="font-normal text-slate-600">{activeEdge.concernId}</span>
                <span className="text-slate-400 font-normal"> → </span>
                {activeEdge.valueId}: {activeEdge.valueLabel}
              </p>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{activeEdge.warrantText}</p>
          </div>,
          document.body,
        )}

      <div className="border-t border-slate-200 bg-white/95 px-4 py-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Warrants (same numbers as on the links; respects value checkboxes)
        </p>
        <ul className="space-y-4 max-h-[min(56vh,28rem)] overflow-y-auto pr-1">
          {warrantList.length === 0 ? (
            <li className="text-sm text-slate-500 italic py-2">No warrants for the current selection.</li>
          ) : (
            warrantList.map(edge => {
            const chip = VALUE_COLOURS[edge.valueId] ?? {
              border: 'border-slate-200',
              text: 'text-slate-700',
              bg: 'bg-slate-50',
            };
            const concernPreview =
              edge.concernText.length > 100 ? `${edge.concernText.slice(0, 97)}…` : edge.concernText;
            return (
              <li
                key={edge.key}
                className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold bg-white border-2 shrink-0"
                    style={{
                      borderColor: VALUE_SVG_THEME[edge.valueId]?.stroke ?? '#94a3b8',
                      color: VALUE_SVG_THEME[edge.valueId]?.label ?? '#334155',
                    }}
                  >
                    {edge.labelN}
                  </span>
                  <span className="text-xs font-medium text-slate-600">
                    {edge.concernId}: {concernPreview}
                  </span>
                  <span className="text-slate-400 text-xs">→</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${chip.bg} ${chip.text} ${chip.border}`}>
                    {edge.valueId}: {edge.valueLabel}
                  </span>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{edge.warrantText}</p>
              </li>
            );
          })
          )}
        </ul>
      </div>

      <p className="text-[10px] text-slate-400 text-center px-3 py-2 tracking-wide uppercase">
        Checkboxes filter values · Claims with no active links are greyed · Hover numbers for popup · List matches selection
      </p>
    </div>
  );
}
