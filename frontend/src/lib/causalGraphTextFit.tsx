import type { ReactNode } from 'react';

/** Approximate monospace-per-char width for ui-sans-serif fontWeight 600 */
export function charPx(fontSize: number): number {
  return fontSize * 0.58;
}

export function lineHeightPx(fontSize: number): number {
  return fontSize * 1.38;
}

export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
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

export type FitOpts = {
  minFont: number;
  startFont: number;
  maxLines: number;
  minRx: number;
  minRy: number;
  wrapWidthPx: number;
  insetXPx?: number;
  insetYPx?: number;
};

/** Choose font size and wrapping so the text block fits in a reasonably sized oval; grow rx/ry from content. */
export function fitTextToOval(text: string, opts: FitOpts): { lines: string[]; fontSize: number; rx: number; ry: number } {
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

export function SvgLabel({
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
}): ReactNode {
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
