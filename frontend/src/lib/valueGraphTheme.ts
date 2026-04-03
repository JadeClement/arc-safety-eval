/** Tailwind-aligned chips (for pills) */
export const VALUE_COLOURS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  V1: { bg: 'bg-red-50', text: 'text-red-800', dot: 'bg-red-500', border: 'border-red-200' },
  V2: { bg: 'bg-orange-50', text: 'text-orange-800', dot: 'bg-orange-500', border: 'border-orange-200' },
  V3: { bg: 'bg-rose-50', text: 'text-rose-800', dot: 'bg-rose-500', border: 'border-rose-200' },
  V4: { bg: 'bg-purple-50', text: 'text-purple-800', dot: 'bg-purple-500', border: 'border-purple-200' },
  V5: { bg: 'bg-blue-50', text: 'text-blue-800', dot: 'bg-blue-500', border: 'border-blue-200' },
  V6: { bg: 'bg-yellow-50', text: 'text-yellow-800', dot: 'bg-yellow-500', border: 'border-yellow-200' },
  V7: { bg: 'bg-teal-50', text: 'text-teal-800', dot: 'bg-teal-500', border: 'border-teal-200' },
  V8: { bg: 'bg-green-50', text: 'text-green-800', dot: 'bg-green-500', border: 'border-green-200' },
};

export const DEFAULT_COLOUR = {
  bg: 'bg-gray-50',
  text: 'text-gray-700',
  dot: 'bg-gray-400',
  border: 'border-gray-200',
};

/** Fills/strokes for SVG nodes (Tailwind palette) */
export const VALUE_SVG_THEME: Record<string, { fill: string; stroke: string; label: string; edge: string }> = {
  V1: { fill: '#fef2f2', stroke: '#fecaca', label: '#991b1b', edge: '#94a3b8' },
  V2: { fill: '#fff7ed', stroke: '#fed7aa', label: '#9a3412', edge: '#94a3b8' },
  V3: { fill: '#fff1f2', stroke: '#fecdd3', label: '#9f1239', edge: '#94a3b8' },
  V4: { fill: '#faf5ff', stroke: '#e9d5ff', label: '#6b21a8', edge: '#94a3b8' },
  V5: { fill: '#eff6ff', stroke: '#bfdbfe', label: '#1e40af', edge: '#94a3b8' },
  V6: { fill: '#fefce8', stroke: '#fde047', label: '#854d0e', edge: '#94a3b8' },
  V7: { fill: '#f0fdfa', stroke: '#99f6e4', label: '#115e59', edge: '#94a3b8' },
  V8: { fill: '#f0fdf4', stroke: '#bbf7d0', label: '#166534', edge: '#94a3b8' },
};

export const DEFAULT_SVG_THEME = {
  fill: '#f9fafb',
  stroke: '#e5e7eb',
  label: '#374151',
  edge: '#94a3b8',
};
