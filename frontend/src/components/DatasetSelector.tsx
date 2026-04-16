import { useState, useEffect, useCallback } from 'react';
import { fetchDatasets, fetchSamples, fetchUploadedSamples, fetchHumanRationaleMatches, uploadDataset } from '../api/client';
import { useApp } from '../context/AppContext';
import type { DatasetMeta, TextSample } from '../types';

const DOMAIN_COLORS: Record<string, string> = {
  Toxicity: 'bg-red-100 text-red-700',
  'Hate Speech': 'bg-orange-100 text-orange-700',
  Bias: 'bg-amber-100 text-amber-700',
};

function HumanRationaleLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-gray-600 mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
      role="note"
    >
      <span className="flex items-start gap-2 min-w-0">
        <span className="mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-gray-800">Blue dot</span>
          {' — '}this text matches an entry in our human rationales file and has a saved human rationale (used on step 3).
        </span>
      </span>
    </div>
  );
}

function SampleTextWithRationaleDot({
  text,
  hasHumanRationale,
  textClassName,
}: {
  text: string;
  hasHumanRationale: boolean;
  textClassName?: string;
}) {
  return (
    <span className="flex items-start gap-2 min-w-0 w-full">
      <span className="mt-1.5 w-4 shrink-0 flex justify-center" aria-hidden={!hasHumanRationale}>
        {hasHumanRationale ? (
          <span
            className="w-2 h-2 rounded-full bg-blue-500"
            title="Has a saved human rationale"
          />
        ) : null}
      </span>
      <span className={`min-w-0 flex-1 ${textClassName ?? ''}`}>{text}</span>
    </span>
  );
}

export default function DatasetSelector() {
  const { setSelectedText, setStep } = useApp();
  const [tab, setTab] = useState<'curated' | 'upload'>('curated');
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [activeDataset, setActiveDataset] = useState<string | null>(null);
  const [samples, setSamples] = useState<TextSample[]>([]);
  const [totalSamples, setTotalSamples] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [pickedSample, setPickedSample] = useState<TextSample | null>(null);
  const [expandedText, setExpandedText] = useState(false);
  const [uploadedSessionId, setUploadedSessionId] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<TextSample[]>([]);
  const [uploadFilename, setUploadFilename] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [rationaleBySampleId, setRationaleBySampleId] = useState<Record<string, boolean>>({});
  const [previewRationaleById, setPreviewRationaleById] = useState<Record<string, boolean>>({});
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchDatasets().then(setDatasets).catch(console.error);
  }, []);

  useEffect(() => {
    if (samples.length === 0) {
      setRationaleBySampleId({});
      return;
    }
    let cancelled = false;
    fetchHumanRationaleMatches(samples.map(s => s.text))
      .then(({ matches }) => {
        if (cancelled) return;
        const next: Record<string, boolean> = {};
        samples.forEach((s, i) => {
          next[s.id] = matches[i] ?? false;
        });
        setRationaleBySampleId(next);
      })
      .catch(e => {
        console.error(e);
        if (!cancelled) setRationaleBySampleId({});
      });
    return () => {
      cancelled = true;
    };
  }, [samples]);

  useEffect(() => {
    if (uploadPreview.length === 0) {
      setPreviewRationaleById({});
      return;
    }
    let cancelled = false;
    fetchHumanRationaleMatches(uploadPreview.map(s => s.text))
      .then(({ matches }) => {
        if (cancelled) return;
        const next: Record<string, boolean> = {};
        uploadPreview.forEach((s, i) => {
          next[s.id] = matches[i] ?? false;
        });
        setPreviewRationaleById(next);
      })
      .catch(e => {
        console.error(e);
        if (!cancelled) setPreviewRationaleById({});
      });
    return () => {
      cancelled = true;
    };
  }, [uploadPreview]);

  const loadSamples = useCallback(async (name: string, isUploaded: boolean, p: number) => {
    setLoadingSamples(true);
    try {
      const data = isUploaded
        ? await fetchUploadedSamples(name, p, PAGE_SIZE)
        : await fetchSamples(name, p, PAGE_SIZE);
      setSamples(data.samples);
      setTotalSamples(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSamples(false);
    }
  }, []);

  const handleDatasetClick = (name: string) => {
    setActiveDataset(name);
    setPage(1);
    setPickedSample(null);
    loadSamples(name, false, 1);
  };

  const handleUploadFile = async (file: File) => {
    setUploadError('');
    setUploading(true);
    try {
      const data = await uploadDataset(file);
      setUploadedSessionId(data.session_id);
      setUploadFilename(data.filename);
      setUploadPreview(data.preview);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleBrowseUploaded = () => {
    if (!uploadedSessionId) return;
    setActiveDataset(uploadedSessionId);
    setPage(1);
    setPickedSample(null);
    loadSamples(uploadedSessionId, true, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    const isUploaded = !!uploadedSessionId && activeDataset === uploadedSessionId;
    if (activeDataset) loadSamples(activeDataset, isUploaded, newPage);
  };

  const totalPages = Math.ceil(totalSamples / PAGE_SIZE);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl font-bold mb-1 text-gray-800">Step 1: Select Input Text</h2>
      <p className="text-sm text-gray-500 mb-5">Choose a text sample to evaluate across models.</p>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5">
        {(['curated', 'upload'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'curated' ? 'Curated Datasets' : 'Upload Your Own'}
          </button>
        ))}
      </div>

      {tab === 'curated' && (
        <div>
          {!activeDataset ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {datasets.map(d => (
                <button
                  key={d.name}
                  onClick={() => handleDatasetClick(d.name)}
                  className="text-left p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-semibold text-gray-800">{d.display_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DOMAIN_COLORS[d.domain] || 'bg-gray-100 text-gray-600'}`}>
                      {d.domain}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{d.sample_count} samples</p>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <button
                onClick={() => { setActiveDataset(null); setSamples([]); setPickedSample(null); }}
                className="text-sm text-indigo-600 hover:underline mb-3 inline-flex items-center gap-1"
              >
                ← Back to datasets
              </button>
              {loadingSamples ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <HumanRationaleLegend />
                  <div className="space-y-2 mb-4">
                    {samples.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setPickedSample(s)}
                        className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                          pickedSample?.id === s.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <SampleTextWithRationaleDot
                          text={s.text}
                          hasHumanRationale={!!rationaleBySampleId[s.id]}
                          textClassName="text-gray-700 whitespace-pre-wrap break-words max-h-56 overflow-y-auto text-left"
                        />
                      </button>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => handlePageChange(page - 1)}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
                      >
                        Prev
                      </button>
                      <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => handlePageChange(page + 1)}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'upload' && (
        <div>
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 space-y-2">
            <p className="font-semibold">Toxic or unsafe text only</p>
            <p className="text-xs text-amber-950/90 leading-relaxed">
              This evaluator is built for <span className="font-medium">harmful, toxic, or otherwise unsafe content</span>, aligned with our curated datasets. Upload only lines that you intend to treat as unsafe for evaluation; benign or neutral lines will not match how the tool is designed to reason about the sample.
            </p>
          </div>
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-700 space-y-3">
            <p className="font-semibold text-slate-900">JSON format (UTF-8, filename ends in <code className="text-xs bg-white border border-slate-200 px-1 rounded py-0.5">.json</code>)</p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-700 leading-relaxed pl-0.5">
              <li>
                <span className="font-medium text-slate-800">Array of rows</span> —{' '}
                <code className="text-xs bg-white border border-slate-200 px-1 rounded">[ &#123; &quot;text&quot;: &quot;...&quot; &#125;, ... ]</code>
              </li>
              <li>
                <span className="font-medium text-slate-800">Wrapped in <code className="text-xs bg-white border px-1 rounded">data</code></span> —{' '}
                <code className="text-xs bg-white border border-slate-200 px-1 rounded">&#123; &quot;data&quot;: [ ... ] &#125;</code>
              </li>
              <li>
                <span className="font-medium text-slate-800">Single object</span> —{' '}
                <code className="text-xs bg-white border border-slate-200 px-1 rounded">&#123; &quot;text&quot;: &quot;...&quot; &#125;</code>
              </li>
            </ul>
            <p className="text-xs text-slate-600">
              Each row must include only <code className="bg-white border border-slate-200 px-1 rounded">text</code> (string). Extra columns in CSV are ignored.
            </p>
            <p className="text-xs text-slate-600">
              <a
                href="/examples/upload-samples-example.json"
                download="upload-samples-example.json"
                className="text-indigo-600 font-medium hover:underline"
              >
                Download example file
              </a>
              {' — '}five toxic/unsafe examples. In the repo:{' '}
              <code className="bg-white border border-slate-200 px-1 rounded text-[11px]">frontend/public/examples/upload-samples-example.json</code>.
            </p>
            <p className="text-xs text-slate-500 border-t border-slate-200 pt-2">
              CSV: header row with a <code className="bg-white border px-1 rounded">text</code> column (required). Other columns are ignored.
            </p>
          </div>
          {!uploadedSessionId ? (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleUploadFile(f);
                }}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                  dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-white'
                }`}
              >
                <p className="text-sm text-gray-500 mb-3">Drag and drop a CSV or JSON file here</p>
                <label className="inline-block cursor-pointer bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                  Browse Files
                  <input
                    type="file"
                    accept=".csv,.json"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadFile(f);
                    }}
                  />
                </label>
                <p className="text-xs text-gray-400 mt-3">Required column / field: <code className="bg-gray-100 px-1 rounded">text</code></p>
              </div>
              {uploading && <p className="text-sm text-indigo-600 mt-3 text-center">Uploading...</p>}
              {uploadError && <p className="text-sm text-red-600 mt-3">{uploadError}</p>}
            </div>
          ) : (
            <div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-700">
                ✓ Uploaded: <strong>{uploadFilename}</strong>
              </div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Preview (first 5 rows):</p>
              <div className="space-y-2 mb-4">
                {uploadPreview.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPickedSample(s)}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                      pickedSample?.id === s.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <SampleTextWithRationaleDot
                      text={s.text}
                      hasHumanRationale={!!previewRationaleById[s.id]}
                      textClassName="text-gray-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto text-left"
                    />
                  </button>
                ))}
              </div>
              {!activeDataset && (
                <button
                  onClick={handleBrowseUploaded}
                  className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                >
                  Browse all samples
                </button>
              )}
              {activeDataset === uploadedSessionId && (
                <div>
                  {loadingSamples ? (
                    <div className="flex justify-center py-6">
                      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {samples.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setPickedSample(s)}
                          className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                            pickedSample?.id === s.id
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <SampleTextWithRationaleDot
                            text={s.text}
                            hasHumanRationale={!!rationaleBySampleId[s.id]}
                            textClassName="text-gray-700 whitespace-pre-wrap break-words max-h-56 overflow-y-auto text-left"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected text preview */}
      {pickedSample && (
        <div className="mt-5 p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
          <div>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1 flex items-center gap-2">
              {rationaleBySampleId[pickedSample.id] ? (
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Has a saved human rationale" aria-hidden />
              ) : null}
              Selected text
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
              {expandedText ? pickedSample.text : pickedSample.text.slice(0, 800) + (pickedSample.text.length > 800 ? '...' : '')}
            </p>
            {pickedSample.text.length > 800 && (
              <button
                onClick={() => setExpandedText(!expandedText)}
                className="text-xs text-indigo-600 mt-1 hover:underline"
              >
                {expandedText ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          disabled={!pickedSample}
          onClick={() => {
            if (!pickedSample) return;
            const datasetForContext =
              activeDataset ?? (tab === 'upload' ? uploadedSessionId : null);
            setSelectedText(pickedSample.text, datasetForContext);
            setStep(2);
          }}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
        >
          Next: Choose Models →
        </button>
      </div>
    </div>
  );
}
