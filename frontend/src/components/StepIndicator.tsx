import { useApp } from '../context/AppContext';

const steps = [
  { number: 1, label: 'Select text' },
  { number: 2, label: 'Models' },
  { number: 3, label: 'Human rationale' },
  { number: 4, label: 'Results' },
  { number: 5, label: 'Argument graph' },
  { number: 6, label: 'Consistency' },
] as const;

export default function StepIndicator() {
  const { step } = useApp();

  return (
    <div className="flex flex-wrap items-center justify-center gap-y-4 gap-x-0 mb-8 max-w-full">
      {steps.map((s, i) => (
        <div key={s.number} className="flex items-center">
          <div className="flex flex-col items-center w-[4.5rem] sm:w-[5.5rem]">
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
              className={`mt-1 text-[10px] sm:text-xs font-medium text-center leading-tight px-0.5 ${
                step === s.number ? 'text-indigo-600' : step > s.number ? 'text-indigo-400' : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`hidden sm:block w-6 md:w-10 h-0.5 mb-4 shrink-0 ${step > s.number ? 'bg-indigo-400' : 'bg-gray-200'}`}
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>
  );
}
