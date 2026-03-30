import { useState, useEffect, useCallback } from 'react';
import { fetchDatasets, fetchSamples, fetchUploadedSamples, uploadDataset } from '../api/client';
import { useApp } from '../context/AppContext';
import type { DatasetMeta, TextSample } from '../types';

const DOMAIN_COLORS: Record<string, string> = {
  Toxicity: 'bg-red-100 text-red-700',
  'Hate Speech': 'bg-orange-100 text-orange-700',
  Bias: 'bg-amber-100 text-amber-700',
};

export default function DatasetSelector() {
  const { setSelectedText, setStep, selectedText } = useApp();
  const [tab, setTab] = useState<'curated' | 'upload'>('curated');
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [activeDataset, setActiveDataset] = useState<string | null>(null);
  const [samples, setSamples] = useState<TextSample[]>([]);
  const [totalSamples, setTotalSamples] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [pickedText, setPickedText] = useState<string | null>(null);
  const [expandedText, setExpandedText] = useState(false);
  const [uploadedSessionId, setUploadedSessionId] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<TextSample[]>([]);
  const [uploadFilename, setUploadFilename] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchDatasets().then(setDatasets).catch(console.error);
  }, []);

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
    setPickedText(null);
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
    setPickedText(null);
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
                onClick={() => { setActiveDataset(null); setSamples([]); setPickedText(null); }}
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
                  <div className="space-y-2 mb-4">
                    {samples.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setPickedText(s.text)}
                        className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                          pickedText === s.text
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <span className="line-clamp-2 text-gray-700">{s.text}</span>
                        {s.label && <span className="text-xs text-gray-400 mt-1 block">Label: {s.label}</span>}
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
                <p className="text-xs text-gray-400 mt-3">Required column: <code className="bg-gray-100 px-1 rounded">text</code>. Optional: <code className="bg-gray-100 px-1 rounded">label</code></p>
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
                  <div key={s.id} className="p-2 bg-gray-50 rounded border border-gray-200 text-sm text-gray-700 line-clamp-2">
                    {s.text}
                  </div>
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
                          onClick={() => setPickedText(s.text)}
                          className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                            pickedText === s.text
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <span className="line-clamp-2 text-gray-700">{s.text}</span>
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
      {pickedText && (
        <div className="mt-5 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Selected text</p>
          <p className="text-sm text-gray-700">
            {expandedText ? pickedText : pickedText.slice(0, 200) + (pickedText.length > 200 ? '...' : '')}
          </p>
          {pickedText.length > 200 && (
            <button
              onClick={() => setExpandedText(!expandedText)}
              className="text-xs text-indigo-600 mt-1 hover:underline"
            >
              {expandedText ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          disabled={!pickedText}
          onClick={() => {
            if (pickedText) {
              setSelectedText(pickedText, activeDataset);
              setStep(2);
            }
          }}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
        >
          Next: Choose Models →
        </button>
      </div>
    </div>
  );
}
