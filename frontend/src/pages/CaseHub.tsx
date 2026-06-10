import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Case } from "../api";
import { Spinner } from "../components/Skeleton";
import { BackButton } from "../components/BackButton";

export default function CaseHub() {
  const { id } = useParams();
  const [c, setC] = useState<Case | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getCase(id).then((r) => setC(r.case)).catch((e) => setErr(String(e)));
  }, [id]);

  if (err) return <div className="container"><div className="error">{err}</div></div>;
  if (!c) return <div className="container"><Spinner /></div>;

  return (
    <div className="container">
      <BackButton />
      <div style={{ marginTop: 16 }}>
        <h1 style={{ marginBottom: 4 }}>{c.case_name}</h1>
        <p className="muted-strong" style={{ margin: 0 }}>
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
          <p>FEMA, Red Cross, crisis lines — one tap to call.</p>
        </Link>
      </div>
    </div>
  );
}
