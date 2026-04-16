import { useMemo } from 'react';
import { useApp } from '../context/AppContext';

const allSteps = [
  { number: 1 as const, label: 'Select text' },
  { number: 2 as const, label: 'Models' },
  { number: 3 as const, label: 'Human rationale' },
  { number: 4 as const, label: 'Results' },
  { number: 5 as const, label: 'Argument graph' },
  { number: 6 as const, label: 'Consistency' },
];

export default function StepIndicator() {
  const { step, setStep, humanRationaleProvided, evaluationResults } = useApp();

  const steps = useMemo(() => {
    const afterEval = evaluationResults !== null;
    const showConsistency = !afterEval || humanRationaleProvided;
    return showConsistency ? allSteps : allSteps.slice(0, 5);
  }, [evaluationResults, humanRationaleProvided]);

  return (
    <div className="flex flex-nowrap items-center justify-start sm:justify-center gap-y-2 mb-8 w-full max-w-full overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:thin]">
      {steps.map((s, i) => (
        <div key={s.number} className="flex items-center shrink-0">
          <div className="flex flex-col items-center min-w-[7.75rem] sm:min-w-[8rem]">
            <button
              type="button"
              disabled={s.number > step}
              onClick={() => setStep(s.number)}
              title={
                s.number > step
                  ? 'Complete earlier steps first'
                  : s.number === step
                    ? 'Current step'
                    : `Go to ${s.label}`
              }
              className={`flex flex-col items-center rounded-lg p-0.5 -m-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-100 ${
                s.number <= step && s.number !== step ? 'hover:bg-indigo-50/80 cursor-pointer' : ''
              }`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  step === s.number
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : step > s.number
                      ? 'bg-indigo-100 border-indigo-400 text-indigo-600'
                      : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {step > s.number ? '✓' : s.number}
              </div>
              <span
                className={`mt-1 text-[10px] sm:text-xs font-medium text-center leading-tight whitespace-nowrap px-0.5 ${
                  step === s.number ? 'text-indigo-600' : step > s.number ? 'text-indigo-400' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </button>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-6 sm:w-10 md:w-14 h-0.5 mb-4 shrink-0 ${step > s.number ? 'bg-indigo-400' : 'bg-gray-200'}`}
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>
  );
}
