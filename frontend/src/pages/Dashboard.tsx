import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Case } from "../api";

export default function Dashboard() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listCases().then((r) => setCases(r.cases)).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="container">
      <div className="row">
        <h1>My cases</h1>
        <span className="spacer" />
        <Link to="/cases/new"><button>+ New case</button></Link>
      </div>
      {err && <div className="error">{err}</div>}
      {cases === null && !err && <p className="muted">Loading…</p>}
      {cases && cases.length === 0 && (
        <div className="card">
          <p className="muted">No cases yet. Start by creating one.</p>
        </div>
      )}
      <div className="grid grid-2">
        {cases?.map((c) => (
          <Link key={c.id} to={`/cases/${c.id}`} className="card tile">
            <h3>{c.case_name}</h3>
            <p>{c.disaster_type}{c.location ? ` · ${c.location}` : ""}</p>
            <div style={{ marginTop: 8 }}>
              <span className="badge">{c.status ?? "active"}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
