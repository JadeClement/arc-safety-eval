import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { AppState, HumanReasoningBaseline, ModelResult, GraphConsistency } from '../types';

interface AppContextType extends AppState {
  setStep: (step: 1 | 2 | 3 | 4 | 5 | 6) => void;
  setSelectedText: (text: string | null, dataset: string | null) => void;
  toggleModel: (modelId: string) => void;
  startEvaluation: (text: string, modelIds: string[], humanReasoning: string | null) => Promise<void>;
  setGraphConsistencyCache: (cache: Record<string, GraphConsistency> | null) => void;
  reset: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

function createInitialAppState(): AppState {
  return {
    step: 1,
    selectedText: null,
    selectedDataset: null,
    humanReasoningBaseline: null,
    selectedModels: [],
    evaluationResults: null,
    isLoading: false,
    loadingModels: new Set(),
    graphConsistencyCache: null,
    humanRationaleProvided: false,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(createInitialAppState);
  const stepRef = useRef(state.step);
  useEffect(() => {
    stepRef.current = state.step;
  }, [state.step]);

  const setStep = useCallback((target: 1 | 2 | 3 | 4 | 5 | 6) => {
    const current = stepRef.current;
    if (current >= 4 && target <= 3) {
      if (!window.confirm('Do you want to start again? Progress will be lost.')) {
        return;
      }
      setState({ ...createInitialAppState(), step: target });
      return;
    }
    setState(prev => ({ ...prev, step: target }));
  }, []);

  const setGraphConsistencyCache = useCallback((cache: Record<string, GraphConsistency> | null) => {
    setState(prev => ({ ...prev, graphConsistencyCache: cache }));
  }, []);

  const setSelectedText = useCallback((text: string | null, dataset: string | null) => {
    setState(prev => ({
      ...prev,
      selectedText: text,
      selectedDataset: dataset,
      humanReasoningBaseline: null,
    }));
  }, []);

  const toggleModel = useCallback((modelId: string) => {
    setState(prev => {
      const selected = prev.selectedModels;
      if (selected.includes(modelId)) {
        return { ...prev, selectedModels: selected.filter(id => id !== modelId) };
      }
      if (selected.length >= 3) {
        return prev; // cap enforced by UI
      }
      return { ...prev, selectedModels: [...selected, modelId] };
    });
  }, []);

  const startEvaluation = useCallback(async (text: string, modelIds: string[], humanReasoning: string | null) => {
    setState(prev => ({
      ...prev,
      step: 4,
      isLoading: true,
      evaluationResults: [],
      loadingModels: new Set(modelIds),
      humanReasoningBaseline: null,
      graphConsistencyCache: null,
      humanRationaleProvided: !!(humanReasoning?.trim()),
    }));

    try {
      const response = await fetch('/api/evaluate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          text,
          model_ids: modelIds,
          human_reasoning: humanReasoning?.trim() || undefined,
        }),
      });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          if (body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let streamError: Error | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trimStart();
            let payload: {
              type?: string;
              result?: ModelResult;
              message?: string;
              human_reasoning_baseline?: HumanReasoningBaseline;
            };
            try {
              payload = JSON.parse(jsonStr);
            } catch {
              continue;
            }
            if (payload.type === 'human_baseline' && payload.human_reasoning_baseline) {
              setState(prev => ({
                ...prev,
                humanReasoningBaseline: payload.human_reasoning_baseline ?? null,
              }));
            } else if (payload.type === 'result' && payload.result) {
              const result = payload.result;
              setState(prev => ({
                ...prev,
                evaluationResults: [
                  ...(prev.evaluationResults ?? []).filter(r => r.model_id !== result.model_id),
                  result,
                ],
                loadingModels: new Set([...prev.loadingModels].filter(id => id !== result.model_id)),
              }));
            } else if (payload.type === 'error') {
              streamError = new Error(payload.message || 'Stream error');
            }
          }
        }
      }

      if (streamError) throw streamError;
    } catch (err) {
      setState(prev => ({
        ...prev,
        evaluationResults: modelIds.map(mid => {
          const existing = prev.evaluationResults?.find(r => r.model_id === mid);
          if (existing) return existing;
          return {
            model_id: mid,
            stance: 'SAFE',
            justification: [],
            self_consistency: null,
            error: `Request failed: ${String(err)}`,
          };
        }),
      }));
    } finally {
      setState(prev => ({
        ...prev,
        isLoading: false,
        loadingModels: new Set(),
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState(createInitialAppState());
  }, []);

  return (
    <AppContext.Provider
      value={{ ...state, setStep, setSelectedText, toggleModel, startEvaluation, setGraphConsistencyCache, reset }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
