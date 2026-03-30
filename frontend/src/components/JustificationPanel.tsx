import type { ReasonItem } from '../types';

interface Props {
  stance: 'UNSAFE' | 'SAFE';
  justification: ReasonItem[];
  rawDebug?: string;
}

export default function JustificationPanel({ stance, justification, rawDebug }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Justification
        </h3>
        <span
          className={`text-xs font-bold px-3 py-1 rounded-full ${
            stance === 'UNSAFE' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {stance}
        </span>
      </div>

      {justification.length === 0 ? (
        <div>
          <p className="text-sm text-gray-400 italic mb-2">No reasons generated.</p>
          {rawDebug && (
            <details className="mt-2">
              <summary className="text-xs text-orange-500 cursor-pointer font-medium">
                ⚠ Debug: raw model response
              </summary>
              <pre className="mt-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap break-words">
                {rawDebug}
              </pre>
            </details>
          )}
        </div>
      ) : (
        <ol className="space-y-2">
          {justification.map((item, i) => (
            <li key={item.reason_id} className="flex gap-2 text-sm">
              <span className="text-gray-400 font-medium shrink-0 pt-0.5">{i + 1}.</span>
              <p className="text-gray-700 leading-relaxed">{item.text}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
