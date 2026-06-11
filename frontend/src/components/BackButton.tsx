import { useNavigate } from "react-router-dom";

export function BackButton({ label = "Back" }: { label?: string }) {
  const nav = useNavigate();
  return (
    <button
      type="button"
      className="back-btn"
      onClick={() => nav(-1)}
      aria-label="Go back to the previous page"
    >
      ← {label}
    </button>
  );
}
