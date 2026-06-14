import { useNavigate } from "react-router-dom";

// Always goes somewhere predictable. Pass `to` so "back" never depends on
// browser history, after a deep link or login redirect, history-back can
// dump a stressed user out of the app entirely.
export function BackButton({ to, label = "Back" }: { to?: string; label?: string }) {
  const nav = useNavigate();
  return (
    <button
      type="button"
      className="back-btn"
      onClick={() => (to ? nav(to) : nav(-1))}
      aria-label={to ? `Go back to ${label}` : "Go back to the previous page"}
    >
      ← {label}
    </button>
  );
}
