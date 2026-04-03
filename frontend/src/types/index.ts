export interface ReasonItem {
  reason_id: string;
  text: string;
  individually_sufficient: boolean | null;
  sufficiency_explanation: string;
}

export interface SelfConsistency {
  prompts_required: number;
  max_prompts: number;
  stabilized: boolean;
  stability_label: string;
}

export interface ValueNode {
  id: string;    // e.g. "V1"
  label: string; // e.g. "Human Dignity"
}

export interface ConcernNode {
  id: string;             // e.g. "C1"
  text: string;
  mapped_values: string[]; // e.g. ["V1", "V2"]
}

export interface WarrantNode {
  concern_id: string; // references ConcernNode.id
  text: string;
}

export interface CausalGraph {
  values: ValueNode[];
  concerns: ConcernNode[];
  warrants: WarrantNode[];
  error?: string;
}

/** Second judge: human vs model causal graph alignment in [0, 1]. */
export interface GraphConsistency {
  score?: number;
  explanation?: string;
  error?: string;
}

export interface ModelResult {
  model_id: string;
  stance: 'UNSAFE' | 'SAFE';
  justification: ReasonItem[];
  self_consistency: SelfConsistency | null;
  causal_graph?: CausalGraph;
  graph_consistency?: GraphConsistency;
  error?: string;
  raw_response_debug?: string;
}

export interface ModelConfig {
  model_id: string;
  display_name: string;
  provider: string;
  context_window: number;
  description: string;
  /** Shown in the picker when set (e.g. OpenRouter privacy prerequisites). */
  notice?: string;
}

export interface DatasetMeta {
  name: string;
  display_name: string;
  domain: string;
  sample_count: number;
}

export interface TextSample {
  id: string;
  text: string;
  label: string;
}

export interface HumanReasoningBaseline {
  text: string;
  source: 'repo' | 'manual' | 'fallback';
  causal_graph: CausalGraph;
}

export interface AppState {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  selectedText: string | null;
  selectedDataset: string | null;
  humanReasoningBaseline: HumanReasoningBaseline | null;
  selectedModels: string[];
  evaluationResults: ModelResult[] | null;
  isLoading: boolean;
  loadingModels: Set<string>;
}
