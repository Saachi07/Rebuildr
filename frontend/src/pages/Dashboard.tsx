import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Case, Terms } from "../api";
import { SkeletonList } from "../components/Skeleton";

export default function Dashboard() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [terms, setTerms] = useState<Terms | null>(null);

  useEffect(() => {
    api.listCases().then((r) => setCases(r.cases)).catch((e) => setErr(String(e)));
    api.getTerms().then(setTerms).catch(() => {});
  }, []);

  return (
    <div className="container">
      <div className="row">
        <h1>My cases</h1>
        <span className="spacer" />
        <Link to="/documents"><button className="secondary">View saved documents</button></Link>
      </div>
      {err && <div className="error">{err}</div>}
      {cases === null && !err && <SkeletonList rows={2} />}
      {cases && cases.length === 0 && (
        <div className="card">
          <p className="muted">No cases yet. Use the "+ Create case" button up top to start one.</p>
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

      {terms?.encryption_notice && (
        <div className="notice" style={{ marginTop: 32 }}>
          <strong>Your data is encrypted</strong>
          <span className="muted">{terms.encryption_notice}</span>
        </div>
      )}
    </div>
  );
}
