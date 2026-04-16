import { useEffect, useMemo, useState } from 'react';
import { fetchModels } from '../api/client';
import { useApp } from '../context/AppContext';
import type { CausalGraph, ModelConfig } from '../types';
import { CausalSideBySideGraph } from './CausalSideBySideGraph';

type SourceId = 'human' | string;

export default function ArgumentGraphView() {
  const { selectedText, selectedModels, evaluationResults, humanReasoningBaseline, humanRationaleProvided, setStep, reset } =
    useApp();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeSource, setActiveSource] = useState<SourceId | null>(null);

  useEffect(() => {
    fetchModels().then(setModels).catch(console.error);
  }, []);

  const displayText = selectedText ?? '';
  const truncated = displayText.length > 100 ? displayText.slice(0, 100) + '...' : displayText;

  const activeGraph = useMemo((): CausalGraph | null => {
    if (activeSource === 'human') {
      return humanReasoningBaseline?.causal_graph ?? null;
    }
    if (activeSource && activeSource !== 'human') {
      const r = evaluationResults?.find(x => x.model_id === activeSource);
      return r?.causal_graph ?? null;
    }
    return null;
  }, [activeSource, humanReasoningBaseline, evaluationResults]);

  useEffect(() => {
    const humanOk =
      humanRationaleProvided &&
      !!humanReasoningBaseline?.causal_graph &&
      !humanReasoningBaseline.causal_graph.error;
    const firstModel = selectedModels.find(mid => {
      const g = evaluationResults?.find(r => r.model_id === mid)?.causal_graph;
      return g && !g.error;
    });

    if (activeSource === null) {
      if (humanOk) setActiveSource('human');
      else if (firstModel) setActiveSource(firstModel);
      return;
    }

    if (activeSource === 'human' && !humanOk) {
      setActiveSource(firstModel ?? null);
      return;
    }
    if (activeSource !== 'human' && !selectedModels.includes(activeSource)) {
      setActiveSource(humanOk ? 'human' : firstModel ?? null);
    }
  }, [activeSource, humanRationaleProvided, humanReasoningBaseline, evaluationResults, selectedModels]);

  return (
    <div className="max-w-7xl mx-auto">
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

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <button
          type="button"
          onClick={() => setStep(4)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Back to results
        </button>

        <div className="flex flex-col sm:items-end gap-2">
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-900">Argument Graph</h2>
            <p className="text-xs text-gray-400 mt-0.5 max-w-md">
              Pick a source on the left — values and claims with numbered links, checkboxes to filter values, hover for
              warrants, and the full list below.
            </p>
          </div>
          {humanRationaleProvided && humanReasoningBaseline && evaluationResults && evaluationResults.length > 0 && (
            <button
              type="button"
              onClick={() => setStep(6)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm self-end"
            >
              Graph consistency (Step 6)
              <span>→</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <aside className="w-full lg:w-56 shrink-0 lg:sticky lg:top-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Source</p>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden divide-y divide-gray-100">
            {humanRationaleProvided &&
              (humanReasoningBaseline ? (
                <button
                  type="button"
                  onClick={() => setActiveSource('human')}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    activeSource === 'human'
                      ? 'bg-amber-50/90 ring-2 ring-inset ring-amber-200/80'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="font-semibold text-gray-900 text-sm">Human reasoning</p>
                  {humanReasoningBaseline.causal_graph?.error && (
                    <p className="text-xs text-red-600 mt-1">Graph error</p>
                  )}
                </button>
              ) : (
                <div className="px-4 py-3 text-sm text-gray-400 italic">No human baseline loaded.</div>
              ))}

            {selectedModels.map(modelId => {
              const result = evaluationResults?.find(r => r.model_id === modelId);
              const modelConfig = models.find(m => m.model_id === modelId);
              const displayName = modelConfig?.display_name ?? modelId;
              const provider = modelConfig?.provider ?? '';
              const g = result?.causal_graph;
              const hasGraph = g && !g.error;

              return (
                <button
                  key={modelId}
                  type="button"
                  onClick={() => setActiveSource(modelId)}
                  disabled={!hasGraph}
                  className={`w-full text-left px-4 py-3 transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                    activeSource === modelId ? 'bg-indigo-50/90 ring-2 ring-inset ring-indigo-200/80' : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="text-xs text-gray-400">{provider}</p>
                  <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
                  {!hasGraph && <p className="text-xs text-gray-400 mt-1">No graph for this run</p>}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-h-[360px]">
            {!activeGraph ? (
              <p className="text-sm text-gray-400 italic">Select a source with graph data.</p>
            ) : activeGraph.error ? (
              <p className="text-sm text-red-600">Argument graph unavailable: {activeGraph.error}</p>
            ) : activeGraph.values.length === 0 ? (
              <p className="text-sm text-gray-400 italic">This source did not implicate any values in the judge output.</p>
            ) : (
              <CausalSideBySideGraph graph={activeGraph} />
            )}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-8 max-w-2xl mx-auto leading-relaxed">
        {humanRationaleProvided ? (
          <>
            Graph judge builds these structures. Run{' '}
            <strong className="font-medium text-gray-500">Step 6 — Graph consistency</strong> to score alignment vs the
            human baseline with the compare judge.
          </>
        ) : (
          <>Graph judge builds these model argument structures from the justification phase.</>
        )}
      </p>
    </div>
  );
}
