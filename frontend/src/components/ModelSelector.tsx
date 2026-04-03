import { useState, useEffect } from 'react';
import { fetchModels } from '../api/client';
import { useApp } from '../context/AppContext';
import type { ModelConfig } from '../types';

const PROVIDER_COLORS: Record<string, string> = {
  Meta: 'bg-blue-50 border-blue-200',
  Mistral: 'bg-purple-50 border-purple-200',
  Google: 'bg-green-50 border-green-200',
  NVIDIA: 'bg-emerald-50 border-emerald-200',
  Qwen: 'bg-cyan-50 border-cyan-200',
  'Nous Research': 'bg-orange-50 border-orange-200',
  OpenAI: 'bg-teal-50 border-teal-200',
  MiniMax: 'bg-violet-50 border-violet-200',
  StepFun: 'bg-sky-50 border-sky-200',
  'Z.AI': 'bg-amber-50 border-amber-200',
  Arcee: 'bg-rose-50 border-rose-200',
  'Venice / Cognitive Computations': 'bg-fuchsia-50 border-fuchsia-200',
};

function formatContext(n: number) {
  if (n >= 1000) return `${Math.round(n / 1000)}k ctx`;
  return `${n} ctx`;
}

export default function ModelSelector() {
  const { selectedModels, toggleModel, setStep, selectedText } = useApp();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [capWarning, setCapWarning] = useState(false);

  useEffect(() => {
    fetchModels().then(setModels).catch(console.error);
  }, []);

  const handleToggle = (modelId: string) => {
    if (!selectedModels.includes(modelId) && selectedModels.length >= 3) {
      setCapWarning(true);
      setTimeout(() => setCapWarning(false), 3000);
      return;
    }
    setCapWarning(false);
    toggleModel(modelId);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-800">Step 2: Choose Models</h2>
        <span className="text-sm text-gray-500">{selectedModels.length} of 3 selected</span>
      </div>
      <p className="text-sm text-gray-500 mb-1">Select up to 3 models to compare. All models are free via OpenRouter.</p>
      <p className="text-xs text-gray-400 mb-5">Free models · 200 req/day limit</p>

      {capWarning && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          You can compare up to 3 models at a time.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {models.map(m => {
          const selected = selectedModels.includes(m.model_id);
          const colorClass = PROVIDER_COLORS[m.provider] || 'bg-gray-50 border-gray-200';
          return (
            <button
              key={m.model_id}
              onClick={() => handleToggle(m.model_id)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                selected
                  ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                  : `border ${colorClass} hover:border-gray-300`
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <span className="text-xs font-medium text-gray-500">{m.provider}</span>
                {selected && (
                  <span className="text-indigo-600 text-sm font-bold">✓</span>
                )}
              </div>
              <p className="font-semibold text-gray-800 text-sm mb-1">{m.display_name}</p>
              <p className="text-xs text-gray-500 mb-1 line-clamp-2">{m.description}</p>
              {m.notice && (
                <p className="text-[11px] leading-snug text-amber-800 bg-amber-50/80 border border-amber-100 rounded px-2 py-1.5 mb-2">
                  {m.notice}
                </p>
              )}
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                {formatContext(m.context_window)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep(1)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back
        </button>
        <button
          disabled={selectedModels.length === 0 || !selectedText?.trim()}
          onClick={() => setStep(3)}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
        >
          Next: Human rationale →
        </button>
      </div>
    </div>
  );
}
