import { useApp } from '../context/AppContext';

const steps = [
  { number: 1, label: 'Select Text' },
  { number: 2, label: 'Choose Models' },
  { number: 3, label: 'Compare Results' },
  { number: 4, label: 'Argument Graph' },
];

export default function StepIndicator() {
  const { step } = useApp();

  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.number} className="flex items-center">
          <div className="flex flex-col items-center">
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
              className={`mt-1 text-xs font-medium ${
                step === s.number ? 'text-indigo-600' : step > s.number ? 'text-indigo-400' : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-16 h-0.5 mb-4 mx-1 ${step > s.number ? 'bg-indigo-400' : 'bg-gray-200'}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
