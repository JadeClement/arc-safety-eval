import type { ReasonItem } from '../types';

interface Props {
  justification: ReasonItem[];
}

function SufficiencyBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-semibold">
        ✓ Sufficient
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full font-semibold"
        title="This reason contributes but does not independently establish unsafeness. This is expected in ambiguous cases."
      >
        ⚠ Not sufficient alone
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
      — Pending
    </span>
  );
}

export default function SelfConsistencyPanel({ justification }: Props) {
  return (
    <div className="border-t border-gray-100 pt-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
        Self-Consistency
      </h3>

      {justification.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Not available.</p>
      ) : (
        <ol className="space-y-3">
          {justification.map((item, i) => (
            <li key={item.reason_id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-gray-400 font-medium text-sm shrink-0 pt-0.5">
                  Reason {i + 1}
                </span>
                <SufficiencyBadge value={item.individually_sufficient} />
              </div>
              <p className="text-xs text-gray-500 italic mb-1.5 leading-relaxed">
                "{item.text}"
              </p>
              {item.sufficiency_explanation ? (
                <p className="text-xs text-gray-600 leading-relaxed">
                  {item.sufficiency_explanation}
                </p>
              ) : (
                <p className="text-xs text-gray-400 italic">No explanation provided.</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
