import { AppProvider, useApp } from './context/AppContext';
import StepIndicator from './components/StepIndicator';
import DatasetSelector from './components/DatasetSelector';
import ModelSelector from './components/ModelSelector';
import HumanRationaleStep from './components/HumanRationaleStep';
import EvaluationView from './components/EvaluationView';
import ArgumentGraphView from './components/ArgumentGraphView';
import GraphConsistencyView from './components/GraphConsistencyView';

function AppContent() {
  const { step } = useApp();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">Ac</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-none">ArC Safety Evaluator</h1>
            <p className="text-xs text-gray-400">Argument-based Consistency Framework</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <StepIndicator />
        {step === 1 && <DatasetSelector />}
        {step === 2 && <ModelSelector />}
        {step === 3 && <HumanRationaleStep />}
        {step === 4 && <EvaluationView />}
        {step === 5 && <ArgumentGraphView />}
        {step === 6 && <GraphConsistencyView />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
