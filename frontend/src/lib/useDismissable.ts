import { useEffect } from "react";

// Shared dismiss behavior for popovers/menus: close on outside click AND on
// Escape (the original popovers were mouse-only, stranding keyboard users).
export function useDismissable(
  ref: React.RefObject<HTMLElement>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, ref]);
}
