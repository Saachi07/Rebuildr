import { useEffect, useRef, useState } from "react";

export function Hint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <span className="hint-wrap" ref={ref}>
      <button
        type="button"
        className="hint-btn"
        aria-label={`Help: ${text}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
      >
        ?
      </button>
      {open && <span className="hint-bubble" role="tooltip">{text}</span>}
    </span>
  );
}
