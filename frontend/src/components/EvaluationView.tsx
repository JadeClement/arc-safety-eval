import { useState, useEffect } from 'react';
import { fetchModels } from '../api/client';
import { useApp } from '../context/AppContext';
import type { ModelConfig } from '../types';
import ModelOutputCard from './ModelOutputCard';


export default function EvaluationView() {
  const { selectedText, selectedModels, evaluationResults, isLoading, loadingModels, reset, setStep } = useApp();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchModels().then(setModels).catch(console.error);
  }, []);

  const displayText = selectedText ?? '';
  const truncated = displayText.length > 100 ? displayText.slice(0, 100) + '...' : displayText;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Sticky header */}
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

      {/* Argument Graph CTA — shown once all results are loaded */}
      {!isLoading && evaluationResults && evaluationResults.length > 0 && (
        <div className="mb-5 flex justify-end">
          <button
            onClick={() => setStep(5)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            View Argument Graph
            <span>→</span>
          </button>
        </div>
      )}

      {/* Model columns */}
      <div className={`grid gap-4 ${
        selectedModels.length === 1
          ? 'grid-cols-1 max-w-xl mx-auto'
          : selectedModels.length === 2
          ? 'grid-cols-1 md:grid-cols-2'
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      }`}>
        {selectedModels.map(modelId => {
          const result = evaluationResults?.find(r => r.model_id === modelId) ?? null;
          const modelConfig = models.find(m => m.model_id === modelId);
          const cardLoading = loadingModels.has(modelId);

          return (
            <ModelOutputCard
              key={modelId}
              result={result}
              model={modelConfig}
              isLoading={cardLoading}
            />
          );
        })}
      </div>

      <div className="mt-10 max-w-3xl mx-auto rounded-xl border border-gray-200 bg-gray-50/80 px-5 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What this step is doing</p>
        <p className="text-sm text-gray-700 leading-relaxed mb-3">
          Each model run is split into <strong className="font-medium text-gray-900">two phases</strong>.
        </p>
        <ol className="text-sm text-gray-700 leading-relaxed space-y-3 list-decimal list-inside marker:text-gray-500">
          <li>
            <strong className="font-medium text-gray-900">Justification</strong> — We ask the model for sufficient,
            diverse reasons that jointly support its stance on the text.
          </li>
          <li>
            <strong className="font-medium text-gray-900">Consistency</strong> — We then probe each reason. For{' '}
            <strong className="font-medium text-gray-900">UNSAFE</strong>, we test{' '}
            <em>individual sufficiency</em>: could this reason alone support toxicity, or is more needed? For{' '}
            <strong className="font-medium text-gray-900">SAFE</strong>, we test{' '}
            <em>necessity</em>: we omit that reason and ask whether any <em>additional</em> reasons are still required
            for the not-toxic verdict — if not, the omitted reason is labeled <strong>Not necessary</strong>; if so,{' '}
            <strong>Necessary</strong>.
          </li>
        </ol>
        <p className="text-xs text-gray-500 mt-3 leading-relaxed">
          Per-reason results appear under <span className="font-medium text-gray-600">Self-consistency</span> in each
          card.
        </p>
      </div>
    </div>
  );
}
