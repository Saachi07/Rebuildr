import { useEffect, useRef } from "react";

// Accessible modal wrapper: role="dialog", Escape to close, focus moves into
// the dialog on open and returns to the trigger on close, and Tab stays
// inside. Set `blocking` for gates that must not be dismissable (e.g. terms).
export function Modal({
  onClose,
  label,
  blocking = false,
  children,
  maxWidth,
}: {
  onClose?: () => void;
  label: string;
  blocking?: boolean;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previouslyFocused.current?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !blocking && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [blocking, onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (!blocking && onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={ref}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

// Small styled confirm dialog — replaces window.confirm, which is jarring
// and easy to mis-tap for someone under stress.
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel} label={title} maxWidth={420}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="muted-strong" style={{ marginTop: 0 }}>{body}</p>
      <div className="row" style={{ marginTop: 16 }}>
        <span className="spacer" />
        <button className="secondary" onClick={onCancel}>Keep it</button>
        <button className="danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
