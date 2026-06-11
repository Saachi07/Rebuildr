import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Case } from "../api";

export function CasePicker() {
  const nav = useNavigate();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listCases().then((r) => setCases(r.cases)).catch(() => setCases([]));
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (cases === null) return null;
  if (cases.length === 0) return null;

  return (
    <div className="nav-pop" ref={ref}>
      <button
        className="case-picker"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        Open a case <span className="chev">▾</span>
      </button>
      {open && (
        <div className="popover" role="listbox" style={{ left: 0, right: "auto", minWidth: 280 }}>
          <div className="popover-header">Your cases</div>
          {cases.map((c) => (
            <button
              key={c.id}
              className="menu-item"
              onClick={() => {
                setOpen(false);
                nav(`/cases/${c.id}/recommendations`);
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.case_name}</div>
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
