import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Case } from "../api";
import { Spinner } from "../components/Skeleton";

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
      <div className="row">
        <div>
          <h1 style={{ marginBottom: 4 }}>{c.case_name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {c.disaster_type}{c.location ? ` · ${c.location}` : ""}
            {c.incident_date ? ` · ${c.incident_date}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 24 }}>
        <Link to={`/cases/${c.id}/inventory`} className="tile">
          <h3>Inventory</h3>
          <p>Log damaged items room-by-room.</p>
        </Link>
        <Link to={`/cases/${c.id}/recommendations`} className="tile">
          <h3>Recovery Plan</h3>
          <p>Generate a plan from whatever you have so far.</p>
        </Link>
        <Link to="/emergency" className="tile">
          <h3>Emergency Contacts</h3>
          <p>FEMA, Red Cross, crisis hotlines — quick dial.</p>
        </Link>
      </div>
    </div>
  );
}
