import { useRef, useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useCases } from "../lib/CasesContext";
import { useDismissable } from "../lib/useDismissable";

export function CasePicker() {
  const nav = useNavigate();
  const loc = useLocation();
  const { cases } = useCases();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDismissable(ref, open, () => setOpen(false));

  // Still loading: render nothing rather than flash an empty menu.
  if (cases === null) return null;

  // Show which case the user is currently inside, so they always know
  // where they are, "Open a case" alone gave no orientation.
  const match = matchPath("/cases/:id/*", loc.pathname) ?? matchPath("/cases/:id", loc.pathname);
  const currentId = match?.params?.id;
  const current = currentId ? cases.find((c) => c.id === currentId) : null;
  const buttonLabel = current ? (current.case_name || "Untitled case") : "Open a case";

  // Starting a case used to be a separate button in the action bar. It now
  // lives here as a menu option, so this must always be an interactive menu,
  // even with zero or one case, otherwise there'd be no way to start one.
  return (
    <div className="nav-pop" ref={ref}>
      <button
        className="case-picker"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {buttonLabel} <span className="chev">▾</span>
      </button>
      {open && (
        <div className="popover" role="menu" style={{ left: 0, right: "auto", minWidth: 280 }}>
          {cases.length > 0 && <div className="popover-header">Your cases</div>}
          {cases.map((c) => (
            <button
              key={c.id}
              className="menu-item"
              aria-current={c.id === currentId || undefined}
              onClick={() => {
                setOpen(false);
                nav(`/cases/${c.id}`);
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {c.case_name}
                {c.id === currentId && <span className="badge" style={{ marginLeft: 8 }}>current</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {c.disaster_type}{c.location ? ` · ${c.location}` : ""}
              </div>
            </button>
          ))}
          <Link to="/cases/new" onClick={() => setOpen(false)}>
            <button className="menu-item" style={{ color: "var(--focus)" }}>
              + Start a new case
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
