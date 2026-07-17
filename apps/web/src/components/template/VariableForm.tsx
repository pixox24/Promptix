import type { PromptVariable } from '../../types/prompt';

interface VariableFormProps {
  variables: PromptVariable[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  errors?: string[];
  compact?: boolean;
}

export function VariableForm({
  variables,
  values,
  onChange,
  errors = [],
  compact = false,
}: VariableFormProps) {
  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {variables.map((variable) => {
        const hasError = errors.includes(variable.label);
        const value = values[variable.key] ?? '';

        return (
          <div key={variable.id} className={compact ? 'space-y-1.5' : 'space-y-2'}>
            <label
              htmlFor={variable.id}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800"
            >
              {variable.label}
              {variable.required && (
                <span className="text-rose-500" aria-hidden>
                  *
                </span>
              )}
            </label>
            {variable.description && (
              <p className="text-[11px] leading-4 text-slate-400">
                {variable.description}
              </p>
            )}

            {variable.type === 'select' || variable.type === 'ratio' ? (
              <div className="flex flex-wrap gap-1.5">
                {(variable.options ?? []).map((opt) => {
                  const selected = value === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onChange(variable.key, opt)}
                      className={`detail-choice-chip rounded-[10px] border px-3 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 ${
                        selected
                          ? 'border-primary/55 bg-primary/16 text-slate-950 shadow-[inset_0_0_0_1px_rgba(154,218,32,0.18)]'
                          : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                id={variable.id}
                type="text"
                value={value}
                placeholder={variable.placeholder}
                onChange={(e) => onChange(variable.key, e.target.value)}
                className={`h-10 w-full rounded-[10px] border bg-white px-3.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-300 transition-all focus:outline-none focus:ring-[3px] focus:ring-primary/25 ${
                  hasError
                    ? 'border-rose-300'
                    : 'border-slate-200 hover:border-slate-300 focus:border-primary'
                }`}
              />
            )}

            {hasError && (
              <p className="text-xs text-rose-500">请填写{variable.label}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
