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

  const latestCase = cases && cases.length > 0 ? cases[0] : null;
  const inventoryHref = latestCase ? `/cases/${latestCase.id}/inventory` : "/cases/new";
  const recommendationsHref = latestCase ? `/cases/${latestCase.id}/recommendations` : "/cases/new";

  return (
    <div className="container">
      <h1>Dashboard</h1>
      {err && <div className="error">{err}</div>}

      <div className="grid grid-2 dashboard-tiles">
        <Link to="/documents" className="card tile big-tile">
          <h2>Documents</h2>
          <p>View, upload, and manage your saved insurance, ID, and policy documents.</p>
        </Link>

        <Link to={inventoryHref} className="card tile big-tile">
          <h2>Inventory</h2>
          <p>
            {latestCase
              ? `Log and review damaged items for ${latestCase.case_name}.`
              : "Create a case first, then log damaged items room by room."}
          </p>
        </Link>

        <Link to="/emergency" className="card tile big-tile">
          <h2>Emergency Contacts</h2>
          <p>Local emergency lines, insurance hotlines, and disaster recovery services.</p>
        </Link>

        <Link to={recommendationsHref} className="card tile big-tile">
          <h2>Recommendation Plan</h2>
          <p>
            {latestCase
              ? `Personalized recovery steps and next actions for ${latestCase.case_name}.`
              : "Create a case to generate a personalized recovery plan."}
          </p>
        </Link>
      </div>

      <h2 style={{ marginTop: 40 }}>My cases</h2>
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
