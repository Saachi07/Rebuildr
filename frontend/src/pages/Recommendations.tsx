import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, RecGroups } from "../api";

export default function Recommendations() {
  const { id } = useParams();
  const [groups, setGroups] = useState<RecGroups | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.getRecommendations(id, 5);
      setGroups(r.groups);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const empty = groups && Object.values(groups).every((g) => g.length === 0);

  return (
    <div className="container">
      <div className="row">
        <h1>Your recovery plan</h1>
        <span className="spacer" />
        <Link to={`/cases/${id}`}><button className="secondary">← Back to case</button></Link>
        <button style={{ marginLeft: 8 }} onClick={load} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <p className="muted">
        Generated from the data already on this case — no questions yet.
        Add more inventory or documents to sharpen the plan.
      </p>

      {err && <div className="error">{err}</div>}
      {busy && !groups && <p className="muted">Generating…</p>}

      {groups && empty && (
        <div className="card">
          <p>No recommendations yet. Try adding a few inventory items first.</p>
          <Link to={`/cases/${id}/inventory`}><button>Add inventory</button></Link>
        </div>
      )}

      {groups && !empty && Object.entries(groups).map(([category, recs]) => (
        recs.length > 0 && (
          <div key={category} className="rec-group">
            <h2>{category}</h2>
            {recs.map((r) => (
              <div key={r.resource.id} className="card rec-card">
                <div style={{ flex: 1 }}>
                  <div className="row">
                    <strong>{r.resource.title}</strong>
                    <span className="spacer" />
                    <span className="score">score {r.score.toFixed(2)}</span>
                  </div>
                  {r.resource.description && (
                    <p style={{ margin: "6px 0", fontSize: 13 }}>{r.resource.description}</p>
                  )}
                  {r.reasons?.length > 0 && (
                    <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                      Why: {r.reasons.join(" · ")}
                    </p>
                  )}
                  {r.resource.url && (
                    <a href={r.resource.url} target="_blank" rel="noreferrer">
                      <button className="secondary" style={{ marginTop: 8 }}>Open</button>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ))}
    </div>
  );
}
