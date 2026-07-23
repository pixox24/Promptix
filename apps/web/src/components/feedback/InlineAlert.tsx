import type { ReactNode } from 'react';

export type InlineAlertType = 'success' | 'info' | 'warning' | 'error';

const styles: Record<InlineAlertType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-800',
};

export function InlineAlert({
  type = 'info',
  children,
  className = '',
}: {
  type?: InlineAlertType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`rounded-lg border px-3 py-2 text-sm ${styles[type]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
