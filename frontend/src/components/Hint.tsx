import { useRef, useState } from "react";
import { useDismissable } from "../lib/useDismissable";

// On touch devices the browser fires synthetic mouseenter before click,
// which used to open-then-immediately-toggle the bubble closed. Only wire
// hover behavior when the device actually supports hovering.
const CAN_HOVER =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(hover: hover)").matches
    : true;

export function Hint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useDismissable(ref, open, () => setOpen(false));

  return (
    <span className="hint-wrap" ref={ref}>
      <button
        type="button"
        className="hint-btn"
        aria-label={`Help: ${text}`}
        aria-expanded={open}
        onMouseEnter={CAN_HOVER ? () => setOpen(true) : undefined}
        onMouseLeave={CAN_HOVER ? () => setOpen(false) : undefined}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
      >
        ?
      </button>
      {open && <span className="hint-bubble" role="tooltip">{text}</span>}
    </span>
  );
}
