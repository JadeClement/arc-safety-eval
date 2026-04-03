import type { CausalGraph, GraphConsistency } from '../types';

export async function fetchDatasets() {
  const res = await fetch('/api/datasets');
  if (!res.ok) throw new Error('Failed to fetch datasets');
  return res.json();
}

export async function fetchSamples(datasetName: string, page = 1, pageSize = 20) {
  const res = await fetch(`/api/datasets/${datasetName}/samples?page=${page}&page_size=${pageSize}`);
  if (!res.ok) throw new Error('Failed to fetch samples');
  return res.json();
}

export async function fetchUploadedSamples(sessionId: string, page = 1, pageSize = 20) {
  const res = await fetch(`/api/datasets/uploaded/${sessionId}/samples?page=${page}&page_size=${pageSize}`);
  if (!res.ok) throw new Error('Failed to fetch uploaded samples');
  return res.json();
}

export async function uploadDataset(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/datasets/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

export async function fetchModels() {
  const res = await fetch('/api/models');
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export interface ValueTaxonomyEntry {
  id: string;
  label: string;
  description: string;
}

export async function fetchValueTaxonomy(): Promise<{ taxonomy: ValueTaxonomyEntry[] }> {
  const res = await fetch('/api/models/values');
  if (!res.ok) throw new Error('Failed to fetch value taxonomy');
  return res.json();
}

export async function compareGraphConsistency(
  referenceGraph: CausalGraph,
  candidateGraph: CausalGraph,
): Promise<GraphConsistency> {
  const res = await fetch('/api/graph-consistency/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reference_graph: referenceGraph,
      candidate_graph: candidateGraph,
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    return { error: msg };
  }
  return res.json() as Promise<GraphConsistency>;
}

export async function fetchHumanRationaleSuggest(text: string) {
  const res = await fetch('/api/human-rationale/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to fetch rationale suggestion');
  return res.json() as Promise<{ matched: boolean; rationale: string | null }>;
}

export async function fetchHumanRationaleMatches(texts: string[]) {
  const res = await fetch('/api/human-rationale/match-texts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) throw new Error('Failed to match human rationales');
  return res.json() as Promise<{ matches: boolean[] }>;
}
