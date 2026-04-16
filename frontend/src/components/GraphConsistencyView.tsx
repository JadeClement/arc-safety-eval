import { useEffect, useState } from 'react';
import { compareGraphConsistency, fetchModels } from '../api/client';
import { useApp } from '../context/AppContext';
import type { GraphConsistency, ModelConfig } from '../types';

export default function GraphConsistencyView() {
  const {
    selectedText,
    selectedModels,
    evaluationResults,
    humanReasoningBaseline,
    graphConsistencyCache,
    setStep,
    setGraphConsistencyCache,
    reset,
  } = useApp();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [compareJudgeId, setCompareJudgeId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, GraphConsistency | null>>({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchModels().then(setModels).catch(console.error);
    fetch('/api/models/values')
      .then(r => r.json())
      .then(d => setCompareJudgeId(d.graph_compare_judge_model_id ?? null))
      .catch(() => setCompareJudgeId(null));
  }, []);

  useEffect(() => {
    const ref = humanReasoningBaseline?.causal_graph;
    if (!ref || ref.error || !evaluationResults?.length) {
      setScores({});
      return;
    }

    const cacheOk =
      graphConsistencyCache &&
      selectedModels.length > 0 &&
      selectedModels.every(mid => graphConsistencyCache[mid] !== undefined);

    if (cacheOk) {
      const fromCache: Record<string, GraphConsistency | null> = {};
      for (const mid of selectedModels) {
        fromCache[mid] = graphConsistencyCache![mid];
      }
      setScores(fromCache);
      return;
    }

    let cancelled = false;
    const next: Record<string, GraphConsistency | null> = {};
    for (const mid of selectedModels) {
      next[mid] = null;
    }
    setScores(next);

    (async () => {
      const final: Record<string, GraphConsistency> = {};
      for (const modelId of selectedModels) {
        if (cancelled) return;
        const result = evaluationResults.find(r => r.model_id === modelId);
        const cand = result?.causal_graph;
        if (!cand || cand.error) {
          const err: GraphConsistency = {
            error: cand?.error ? `Model graph error: ${cand.error}` : 'No model graph for this run.',
          };
          final[modelId] = err;
          setScores(prev => ({ ...prev, [modelId]: err }));
          continue;
        }
        const cfg = models.find(m => m.model_id === modelId);
        const out = await compareGraphConsistency(ref, cand, {
          humanLabel: 'Human',
          modelDisplayName: cfg?.display_name ?? modelId,
        });
        if (cancelled) return;
        final[modelId] = out;
        setScores(prev => ({ ...prev, [modelId]: out }));
      }
      if (!cancelled) {
        setGraphConsistencyCache(final);
      }
    })();

    return () => {
      cancelled = true;
    };
    // graphConsistencyCache is read on each run (e.g. remount after step 5) but omitted from deps so filling the cache after compare does not retrigger fetches.
  }, [humanReasoningBaseline, evaluationResults, selectedModels, setGraphConsistencyCache]);

  const displayText = selectedText ?? '';
  const truncated = displayText.length > 100 ? displayText.slice(0, 100) + '...' : displayText;

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
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-indigo-500 hover:underline mt-1"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
          <button type="button" onClick={reset} className="shrink-0 text-sm text-gray-500 hover:text-gray-700">
            ← Start over
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => setStep(5)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Back to argument graph
        </button>
        <div className="text-right">
          <h2 className="text-lg font-bold text-gray-900">Graph consistency</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Step 6 · Compare judge scores human vs each model graph (0–1)
          </p>
        </div>
      </div>

      {!humanReasoningBaseline?.causal_graph || humanReasoningBaseline.causal_graph.error ? (
        <p className="text-sm text-gray-500">Human baseline graph is missing. Complete an evaluation first.</p>
      ) : (
        <div className={`grid gap-4 ${
          selectedModels.length <= 1
            ? 'grid-cols-1 max-w-xl mx-auto'
            : selectedModels.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-3'
        }`}>
          {selectedModels.map(modelId => {
            const cfg = models.find(m => m.model_id === modelId);
            const name = cfg?.display_name ?? modelId;
            const row = scores[modelId];

            return (
              <div key={modelId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs text-gray-400">{cfg?.provider}</p>
                <p className="font-semibold text-gray-800 text-sm mb-3">{name}</p>
                {row === null || row === undefined ? (
                  <div className="flex items-center gap-2 py-8 justify-center text-gray-400 text-sm">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    Running compare judge…
                  </div>
                ) : row.error ? (
                  <p className="text-sm text-red-700">{row.error}</p>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-indigo-700 tabular-nums">
                      {((row.score ?? 0) * 100).toFixed(0)}
                      <span className="text-base font-medium text-gray-500 ml-1">%</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-2 leading-relaxed">{row.explanation}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-8">
        Compare judge
        {compareJudgeId ? (
          <>
            : <code className="text-[10px] bg-gray-100 px-1 rounded">{compareJudgeId}</code>
          </>
        ) : null}{' '}
        · Override with <code className="text-[10px] bg-gray-100 px-1 rounded">GRAPH_COMPARE_JUDGE_MODEL_ID</code>
      </p>
    </div>
  );
}
