import type { ModelResult, ModelConfig } from '../types';
import JustificationPanel from './JustificationPanel';
import SelfConsistencyPanel from './SelfConsistencyPanel';

interface Props {
  result: ModelResult | null;
  model: ModelConfig | undefined;
  isLoading: boolean;
}

export default function ModelOutputCard({ result, model, isLoading }: Props) {
  const displayName = model?.display_name ?? result?.model_id ?? 'Model';
  const provider = model?.provider ?? '';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs text-gray-400">{provider}</p>
        <p className="font-semibold text-gray-800 text-sm">{displayName}</p>
      </div>

      <div className="p-4 flex-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Running ArC pipeline…</p>
          </div>
        ) : result?.error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3.5 text-sm text-red-700 leading-relaxed">
            <p className="m-0">
              <strong className="font-semibold">{displayName} failed:</strong>{' '}
              <span className="font-normal">{result.error}</span>
            </p>
          </div>
        ) : result ? (
          <>
            {/* Stage 1 — Justification: stance + reasons list */}
            <JustificationPanel
              stance={result.stance}
              justification={result.justification}
              rawDebug={result.raw_response_debug}
            />

            {/* Stage 2 — Self-Consistency: per-reason sufficiency + explanation */}
            <SelfConsistencyPanel justification={result.justification} stance={result.stance} />
          </>
        ) : (
          <p className="text-sm text-gray-400 italic">Pending…</p>
        )}
      </div>
    </div>
  );
}
