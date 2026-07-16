import type { PromptVariable } from '../../types/prompt';

interface VariableFormProps {
  variables: PromptVariable[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  errors?: string[];
}

export function VariableForm({
  variables,
  values,
  onChange,
  errors = [],
}: VariableFormProps) {
  return (
    <div className="space-y-5">
      {variables.map((variable) => {
        const hasError = errors.includes(variable.label);
        const value = values[variable.key] ?? '';

        return (
          <div key={variable.id} className="space-y-2">
            <label
              htmlFor={variable.id}
              className="flex items-center gap-1.5 text-sm font-medium text-foreground"
            >
              {variable.label}
              {variable.required && (
                <span className="text-rose-500" aria-hidden>
                  *
                </span>
              )}
            </label>
            {variable.description && (
              <p className="text-xs text-muted-foreground">
                {variable.description}
              </p>
            )}

            {variable.type === 'select' || variable.type === 'ratio' ? (
              <div className="flex flex-wrap gap-2">
                {(variable.options ?? []).map((opt) => {
                  const selected = value === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onChange(variable.key, opt)}
                      className={`rounded-md border px-3.5 py-2 text-sm transition-all ${
                        selected
                          ? 'border-transparent bg-primary text-primary-foreground shadow-xs'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
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
                className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-shadow focus:outline-none focus:ring-[3px] focus:ring-primary/30 ${
                  hasError
                    ? 'border-rose-300'
                    : 'border-gray-200 focus:border-primary'
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
