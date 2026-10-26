/**
 * Toasts (DESIGN.md §6): bottom-right stack, tone colors, auto-dismiss 4s,
 * aria-live polite region, manual dismiss button.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from './Icons';

export type ToastTone = 'success' | 'danger' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  push: (tone: ToastTone, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 4000;

function Toast({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const t = setTimeout(() => closeRef.current(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast.id]);
  return (
    <div className={`toast toast-${toast.tone}`} role="status">
      <span className="toast-icon" aria-hidden="true">
        <Icon
          name={toast.tone === 'success' ? 'check' : toast.tone === 'danger' ? 'alert' : 'info'}
        />
      </span>
      <span className="toast-message">{toast.message}</span>
      <button
        type="button"
        className="toast-close btn-ghost-icon"
        aria-label="Dismiss"
        onClick={() => onClose(toast.id)}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, message: string) => {
    setToasts((prev) => [...prev.slice(-4), { id: nextId.current++, tone, message }]);
  }, []);

  const close = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={close} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
