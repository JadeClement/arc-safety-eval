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
