import { useEffect, useState } from 'react';
import { fetchHumanRationaleSuggest } from '../api/client';
import { useApp } from '../context/AppContext';

export default function HumanRationaleStep() {
  const { selectedText, selectedModels, setStep, startEvaluation } = useApp();
  const [draft, setDraft] = useState('');
  const [loadingSuggest, setLoadingSuggest] = useState(true);
  const [expanded, setExpanded] = useState(false);
  /** True after fetch: selected text matched an entry in human_rationales.json */
  const [matchedBundledEntry, setMatchedBundledEntry] = useState<boolean | null>(null);
  /** Snapshot of the bundled rationale so we can tell if the user edited it */
  const [bundledSnapshot, setBundledSnapshot] = useState<string | null>(null);

  useEffect(() => {
    const t = selectedText?.trim();
    if (!t) {
      setDraft('');
      setLoadingSuggest(false);
      setMatchedBundledEntry(null);
      setBundledSnapshot(null);
      return;
    }
    let cancelled = false;
    setLoadingSuggest(true);
    setMatchedBundledEntry(null);
    setBundledSnapshot(null);
    fetchHumanRationaleSuggest(t)
      .then(data => {
        if (cancelled) return;
        if (data.matched && data.rationale) {
          setDraft(data.rationale);
          setMatchedBundledEntry(true);
          setBundledSnapshot(data.rationale);
        } else {
          setDraft('');
          setMatchedBundledEntry(false);
          setBundledSnapshot(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDraft('');
          setMatchedBundledEntry(false);
          setBundledSnapshot(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedText]);

  const displayText = selectedText ?? '';
  const truncated = displayText.length > 120 ? displayText.slice(0, 120) + '…' : displayText;

  if (!selectedText?.trim()) {
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <p className="text-sm text-gray-600 mb-4">Select a text sample first.</p>
        <button
          type="button"
          onClick={() => setStep(1)}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Back to step 1
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Step 3: Human rationale</h2>
      <p className="text-sm text-gray-500 mb-5">
        Write why this text is unsafe (for the human baseline graph). If your input matches{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">human_rationales.json</code>, the field is filled automatically;
        you can edit it or replace it entirely.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Selected text</p>
        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
          {expanded ? displayText : truncated}
        </p>
        {displayText.length > 120 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-indigo-500 hover:underline mt-1"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {!loadingSuggest && matchedBundledEntry === true && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold text-emerald-950">Matched your project JSON</p>
          <p className="mt-1 text-emerald-900/90 leading-snug">
            This input text matches an entry in{' '}
            <code className="text-xs bg-white/80 border border-emerald-200/80 px-1 rounded py-0.5">
              backend/data/human_rationales.json
            </code>
            . The rationale below is the <span className="font-medium">human_reasoning</span> /{' '}
            <span className="font-medium">rationale</span> field from that entry—you can edit it before running the evaluation.
          </p>
          {bundledSnapshot != null && draft !== bundledSnapshot && (
            <p className="mt-2 text-xs text-emerald-800/90 italic">You’ve changed the text from the bundled version.</p>
          )}
        </div>
      )}

      {!loadingSuggest && matchedBundledEntry === false && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <p className="font-medium text-gray-800">No bundled match for this text</p>
          <p className="mt-1 leading-snug">
            Nothing in{' '}
            <code className="text-xs bg-white border border-gray-200 px-1 rounded">human_rationales.json</code> lines up
            after the server normalizes smart quotes, invisible characters, and spacing, or uses your text as a prefix of
            a longer stored line. Add or fix a row, or write a rationale below.
          </p>
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-gray-700 mb-1.5 block">Your human reasoning</span>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          disabled={loadingSuggest}
          rows={10}
          placeholder={
            loadingSuggest
              ? 'Checking for a matching bundled rationale…'
              : 'Explain why this content is unsafe (norms, harms, targets, slurs, etc.).'
          }
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
        />
      </label>
      <p className="text-xs text-gray-400 mt-2">
        If you leave this empty and run evaluation, the server uses a bundled rationale when the text matches{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">human_rationales.json</code>, otherwise a short generic baseline.
        If you type anything, that wording is used for the human baseline graph (edits count as your own unless unchanged from the file).
      </p>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep(2)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to models
        </button>
        <button
          type="button"
          disabled={!selectedText?.trim() || selectedModels.length === 0 || loadingSuggest}
          onClick={() => {
            const t = selectedText?.trim();
            if (!t) return;
            const reasoning = draft.trim();
            startEvaluation(t, selectedModels, reasoning ? reasoning : null);
          }}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
        >
          Run evaluation →
        </button>
      </div>
    </div>
  );
}
