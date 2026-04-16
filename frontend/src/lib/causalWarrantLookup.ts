import type { CausalGraph } from '../types';

/** Fixed taxonomy labels (must match backend VALUE_TAXONOMY). */
const VALUE_CODE_LABELS: Record<string, string> = {
  V1: 'Human Dignity',
  V2: 'Non-Discrimination',
  V3: 'Physical Safety',
  V4: 'Psychological Safety',
  V5: 'Autonomy',
  V6: 'Honesty & Epistemic Integrity',
  V7: 'Privacy & Consent',
  V8: 'Social Cohesion',
};

/** Replace V1–V8 tokens in warrant prose with full value names (UI + legacy judge output). */
export function expandValueCodesInWarrantText(text: string): string {
  return text.replace(/\b(V[1-8])\b/g, code => VALUE_CODE_LABELS[code] ?? code);
}

/** Warrant copy for one value→concern edge (prefers value-specific, then legacy per-concern). */
export function warrantTextForEdge(graph: CausalGraph, concernId: string, valueId: string): string {
  const forPair = graph.warrants.find(w => w.concern_id === concernId && w.value_id === valueId);
  let raw: string | undefined;
  if (forPair?.text?.trim()) raw = forPair.text.trim();
  else {
    const legacy = graph.warrants.find(w => w.concern_id === concernId && (w.value_id == null || w.value_id === ''));
    if (legacy?.text?.trim()) raw = legacy.text.trim();
    else raw = graph.warrants.find(w => w.concern_id === concernId)?.text?.trim();
  }
  if (!raw) return '(No warrant)';
  return expandValueCodesInWarrantText(raw);
}

/** Combined text for the single warrant oval under a concern in the tiered graph. */
export function warrantBlockForConcernOval(graph: CausalGraph, concernId: string, mappedValues: string[]): string {
  if (mappedValues.length === 0) return '(No warrant)';
  const multi = mappedValues.length > 1;
  const parts: string[] = [];
  for (const vid of mappedValues) {
    const t = warrantTextForEdge(graph, concernId, vid);
    if (multi) {
      const vl = graph.values.find(v => v.id === vid)?.label ?? vid;
      parts.push(`${vl}: ${t}`);
    } else {
      parts.push(t);
    }
  }
  return parts.join('\n\n');
}
