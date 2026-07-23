import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

const TOAST_DURATION_MS: Record<ToastType, number> = {
  success: 3000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastId;
    setItems((prev) => [
      ...prev.filter((item) => item.message !== message),
      { id, message, type },
    ].slice(-3));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS[type]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 md:left-auto md:right-6 md:translate-x-0 md:px-0"
        aria-label="通知"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.type === 'error' ? 'alert' : 'status'}
            aria-live={item.type === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            className={`pointer-events-auto animate-toast-in rounded-[6px] border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${
              item.type === 'error'
                ? 'border-red-200 bg-red-50/95 text-red-800'
                : item.type === 'warning' ? 'border-amber-200 bg-amber-50/95 text-amber-800'
                : item.type === 'info'
                  ? 'border-gray-200 bg-white/95 text-gray-700'
                  : 'border-primary/40 bg-primary/20 text-foreground'
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
