import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Terms } from "../api";
import { SkeletonList } from "../components/Skeleton";
import { useCases } from "../lib/CasesContext";

export default function Dashboard() {
  const { cases, latest, refresh } = useCases();
  const [err, setErr] = useState<string | null>(null);
  const [terms, setTerms] = useState<Terms | null>(null);

  useEffect(() => {
    refresh().catch((e) => setErr(e.message ?? String(e)));
    api.getTerms().then(setTerms).catch(() => {});
  }, [refresh]);

  const latestCase = latest;
  const inventoryHref = latestCase ? `/cases/${latestCase.id}/inventory` : "/cases/new";
  const recommendationsHref = latestCase ? `/cases/${latestCase.id}/recommendations` : "/cases/new";

  return (
    <div className="container">
      <h1>Welcome back</h1>
      <p className="warm-note">
        Pick up wherever you left off. Nothing here is going anywhere.
      </p>
      {err && <div className="error">{err}</div>}

      <div className="grid grid-2 dashboard-tiles">
        <Link to={recommendationsHref} className="card tile big-tile">
          <h2>Your recovery plan</h2>
          <p>
            {latestCase
              ? `Your next steps for ${latestCase.case_name}, what to do and when.`
              : "Start a case and we'll suggest the next steps that matter most."}
          </p>
        </Link>

        <Link to="/documents" className="card tile big-tile">
          <h2>Documents</h2>
          <p>Your insurance, ID, and claim papers. All in one safe place.</p>
        </Link>

        <Link to={inventoryHref} className="card tile big-tile">
          <h2>What you lost</h2>
          <p>
            {latestCase
              ? `List and photograph what was damaged, room by room.`
              : "List what was damaged and we'll help estimate values for your claim."}
          </p>
        </Link>

        <Link to="/emergency" className="card tile big-tile">
          <h2>Emergency contacts</h2>
          <p>Crisis lines, Red Cross, and local support, one tap to call.</p>
        </Link>
      </div>

      <h2 style={{ marginTop: 40 }}>Your cases</h2>
      {cases === null && !err && <SkeletonList rows={2} />}
      {cases && cases.length === 0 && (
        <div className="card">
          <p className="muted-strong">
            No cases yet. When you're ready, use{" "}
            <strong>+ Start a new case</strong> up top to begin.
          </p>
        </div>
      )}
      <div className="grid grid-2">
        {cases?.map((c) => (
          <Link key={c.id} to={`/cases/${c.id}/recommendations`} className="card tile">
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
