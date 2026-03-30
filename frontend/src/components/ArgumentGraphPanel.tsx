import type { CausalGraph, ConcernNode, ValueNode } from '../types';

// Consistent colour palette keyed by value ID — same across all model cards
const VALUE_COLOURS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  V1: { bg: 'bg-red-50',     text: 'text-red-800',    dot: 'bg-red-500',    border: 'border-red-200'    },
  V2: { bg: 'bg-orange-50',  text: 'text-orange-800', dot: 'bg-orange-500', border: 'border-orange-200' },
  V3: { bg: 'bg-rose-50',    text: 'text-rose-800',   dot: 'bg-rose-500',   border: 'border-rose-200'   },
  V4: { bg: 'bg-purple-50',  text: 'text-purple-800', dot: 'bg-purple-500', border: 'border-purple-200' },
  V5: { bg: 'bg-blue-50',    text: 'text-blue-800',   dot: 'bg-blue-500',   border: 'border-blue-200'   },
  V6: { bg: 'bg-yellow-50',  text: 'text-yellow-800', dot: 'bg-yellow-500', border: 'border-yellow-200' },
  V7: { bg: 'bg-teal-50',    text: 'text-teal-800',   dot: 'bg-teal-500',   border: 'border-teal-200'   },
  V8: { bg: 'bg-green-50',   text: 'text-green-800',  dot: 'bg-green-500',  border: 'border-green-200'  },
};

const DEFAULT_COLOUR = { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400', border: 'border-gray-200' };

interface Props {
  graph: CausalGraph;
}

export function ArgumentGraphPanel({ graph }: Props) {
  if (graph.error) {
    return (
      <p className="text-sm text-gray-400 italic mt-1">
        Argument graph unavailable: {graph.error}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-4">

      {/* Level 1 — Values */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Values implicated
        </p>
        <div className="flex flex-wrap gap-2">
          {graph.values.map((v) => {
            const c = VALUE_COLOURS[v.id] ?? DEFAULT_COLOUR;
            return (
              <span
                key={v.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
                {v.id}: {v.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Levels 2 + 3 — Concerns and Warrants */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Concerns &amp; warrants
        </p>
        <div className="space-y-3">
          {graph.concerns.map((concern) => {
            const warrant = graph.warrants.find((w) => w.concern_id === concern.id);
            return (
              <ConcernRow
                key={concern.id}
                concern={concern}
                warrantText={warrant?.text}
                allValues={graph.values}
              />
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-400 italic">
        Graph constructed by shared judge model
      </p>
    </div>
  );
}

function ConcernRow({
  concern,
  warrantText,
  allValues,
}: {
  concern: ConcernNode;
  warrantText?: string;
  allValues: ValueNode[];
}) {
  return (
    <div className="border-l-2 border-gray-200 pl-3">
      {/* Level 2 — Concern */}
      <div className="flex items-start gap-2">
        <span className="text-gray-400 text-xs font-mono mt-0.5 flex-shrink-0">{concern.id}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 leading-snug">{concern.text}</p>

          {/* Mapped value chips */}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {concern.mapped_values.map((vid) => {
              const c = VALUE_COLOURS[vid] ?? DEFAULT_COLOUR;
              const label = allValues.find((v) => v.id === vid)?.label ?? vid;
              return (
                <span
                  key={vid}
                  className={`text-xs px-1.5 py-0.5 rounded border ${c.bg} ${c.text} ${c.border}`}
                >
                  {vid}: {label}
                </span>
              );
            })}
          </div>

          {/* Level 3 — Warrant */}
          {warrantText && (
            <div className="mt-2 border-l-2 border-dashed border-gray-200 pl-2.5">
              <p className="text-xs text-gray-500 italic leading-relaxed">{warrantText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
