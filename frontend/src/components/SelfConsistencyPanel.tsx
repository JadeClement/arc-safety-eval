import type { ReasonItem } from '../types';

interface Props {
  justification: ReasonItem[];
  stance: 'SAFE' | 'UNSAFE';
}

function SufficiencyBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-semibold"
        title="This reason suffices to support the toxic classification."
      >
        ✓ Sufficient
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full font-semibold"
        title="This reason contributes but does not independently establish unsafeness (more reasons needed)."
      >
        ⚠ Not sufficient
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
      — Pending
    </span>
  );
}

function NecessityBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-semibold"
        title="With this reason omitted, the remaining set does not fully support not-toxic without further reasons."
      >
        Necessary
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-semibold"
        title="The other reasons (or the text alone) already suffice; this reason is redundant for the joint case."
      >
        Not necessary
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
      — Pending
    </span>
  );
}

export default function SelfConsistencyPanel({ justification, stance }: Props) {
  const heading =
    stance === 'UNSAFE' ? 'Self-consistency (sufficiency)' : 'Self-consistency (necessity)';

  return (
    <div className="border-t border-gray-100 pt-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{heading}</h3>

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
                {stance === 'UNSAFE' ? (
                  <SufficiencyBadge value={item.individually_sufficient} />
                ) : (
                  <NecessityBadge value={item.reason_necessary ?? null} />
                )}
              </div>
              <p className="text-xs text-gray-500 italic mb-1.5 leading-relaxed">
                "{item.text}"
              </p>
              {stance === 'UNSAFE' ? (
                item.sufficiency_explanation ? (
                  <p className="text-xs text-gray-600 leading-relaxed">{item.sufficiency_explanation}</p>
                ) : (
                  <p className="text-xs text-gray-400 italic">No explanation provided.</p>
                )
              ) : item.necessity_explanation ? (
                <p className="text-xs text-gray-600 leading-relaxed">{item.necessity_explanation}</p>
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
