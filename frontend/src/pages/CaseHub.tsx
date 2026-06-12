import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Case } from "../api";
import { Spinner } from "../components/Skeleton";
import { BackButton } from "../components/BackButton";
import { useCases } from "../lib/CasesContext";

export default function CaseHub() {
  const { id } = useParams();
  const { refresh } = useCases();
  const [c, setC] = useState<Case | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getCase(id).then((r) => { setC(r.case); setName(r.case.case_name); }).catch((e) => setErr(e.message ?? String(e)));
  }, [id]);

  async function saveName() {
    if (!id || !c) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === c.case_name) { setRenaming(false); setName(c.case_name); return; }
    setSaving(true);
    try {
      const r = await api.updateCase(id, { case_name: trimmed });
      setC(r.case);
      setRenaming(false);
      refresh();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (err) return <div className="container"><div className="error">{err}</div></div>;
  if (!c) return <div className="container"><Spinner /></div>;

  return (
    <div className="container">
      <BackButton to="/dashboard" label="Dashboard" />
      <div style={{ marginTop: 16 }}>
        {renaming ? (
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setRenaming(false); setName(c.case_name); } }}
              aria-label="Case name"
              style={{ maxWidth: 360 }}
              autoFocus
            />
            <button onClick={saveName} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button className="secondary" onClick={() => { setRenaming(false); setName(c.case_name); }} disabled={saving}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>{c.case_name}</h1>
            <button className="secondary" style={{ minHeight: 32, padding: "4px 12px", fontSize: 13 }} onClick={() => setRenaming(true)}>
              Rename
            </button>
          </div>
        )}
        <p className="muted-strong" style={{ margin: "6px 0 0" }}>
          {c.disaster_type}{c.location ? ` · ${c.location}` : ""}
          {c.incident_date ? ` · ${c.incident_date}` : ""}
        </p>
      </div>

      <div className="grid grid-2" style={{ marginTop: 24 }}>
        <Link to={`/cases/${c.id}/recommendations`} className="tile">
          <h3>Your recovery plan</h3>
          <p>Your next steps — what to do, when, and who to call.</p>
        </Link>
        <Link to={`/cases/${c.id}/inventory`} className="tile">
          <h3>What you lost</h3>
          <p>List and photograph damaged items, room by room.</p>
        </Link>
        <Link to="/documents" className="tile">
          <h3>Documents</h3>
          <p>Your insurance, ID, and claim papers.</p>
        </Link>
        <Link to="/emergency" className="tile">
          <h3>Emergency contacts</h3>
          <p>Crisis lines, 211 Alberta, Red Cross — one tap to call.</p>
        </Link>
      </div>
    </div>
  );
}
