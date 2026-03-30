import { useEffect, useState } from 'react';
import { fetchModels } from '../api/client';
import { useApp } from '../context/AppContext';
import type { ModelConfig } from '../types';
import { ArgumentGraphPanel } from './ArgumentGraphPanel';

export default function ArgumentGraphView() {
  const { selectedText, selectedModels, evaluationResults, setStep, reset } = useApp();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchModels().then(setModels).catch(console.error);
  }, []);

  const displayText = selectedText ?? '';
  const truncated = displayText.length > 100 ? displayText.slice(0, 100) + '...' : displayText;

  return (
    <div className="max-w-7xl mx-auto">

      {/* Header — same style as EvaluationView */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Evaluating</p>
            <p className="text-sm text-gray-700">
              {expanded ? displayText : truncated}
            </p>
            {displayText.length > 100 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-indigo-500 hover:underline mt-1"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
          <button
            onClick={reset}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
          >
            ← Start over
          </button>
        </div>
      </div>

      {/* Nav row */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setStep(3)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Back to results
        </button>

        <div className="text-right">
          <h2 className="text-lg font-bold text-gray-900">Argument Graph</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Three-level causal structure: Values → Concerns → Warrants
          </p>
        </div>
      </div>

      {/* One column per model */}
      <div className={`grid gap-4 ${
        selectedModels.length === 1
          ? 'grid-cols-1 max-w-xl mx-auto'
          : selectedModels.length === 2
          ? 'grid-cols-1 md:grid-cols-2'
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      }`}>
        {selectedModels.map(modelId => {
          const result = evaluationResults?.find(r => r.model_id === modelId);
          const modelConfig = models.find(m => m.model_id === modelId);
          const displayName = modelConfig?.display_name ?? modelId;
          const provider = modelConfig?.provider ?? '';
          const graph = result?.causal_graph;

          return (
            <div key={modelId} className="bg-white rounded-xl border border-gray-200 shadow-sm">
              {/* Model header */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-400">{provider}</p>
                <p className="font-semibold text-gray-800 text-sm">{displayName}</p>
              </div>

              <div className="p-4">
                {!graph ? (
                  <p className="text-sm text-gray-400 italic">No graph data available.</p>
                ) : (
                  <ArgumentGraphPanel graph={graph} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Judge attribution footer */}
      <p className="text-center text-xs text-gray-400 mt-8">
        All graphs constructed by shared judge model · Toulmin argumentation structure
      </p>
    </div>
  );
}
