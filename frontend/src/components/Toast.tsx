import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";

// Lightweight toast system. Supports an optional action ("Undo") so we can
// delete things immediately and let the user take it back, instead of
// scaring them with "this can't be undone" confirms.

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastValue = {
  show: (message: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number }) => void;
};

const Ctx = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastValue["show"]>((message, opts) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts, { id, message, actionLabel: opts?.actionLabel, onAction: opts?.onAction }]);
    window.setTimeout(() => dismiss(id), opts?.duration ?? 6500);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.actionLabel && (
              <button
                className="toast-action"
                onClick={() => { t.onAction?.(); dismiss(t.id); }}
              >
                {t.actionLabel}
              </button>
            )}
            <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}
