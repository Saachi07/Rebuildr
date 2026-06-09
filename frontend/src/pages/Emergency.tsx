import { Link } from "react-router-dom";

type Contact = {
  name: string;
  phone?: string;
  url?: string;
  detail: string;
  urgent?: boolean;
};

const CONTACTS: Contact[] = [
  {
    name: "911",
    phone: "911",
    detail: "Life-threatening emergencies — fire, medical, immediate danger.",
    urgent: true,
  },
  {
    name: "FEMA Disaster Assistance",
    phone: "1-800-621-3362",
    url: "https://www.disasterassistance.gov",
    detail: "Federal disaster aid, temporary housing, individual assistance.",
  },
  {
    name: "American Red Cross",
    phone: "1-800-733-2767",
    url: "https://www.redcross.org/get-help.html",
    detail: "Shelter, food, emergency supplies, family reconnection.",
  },
  {
    name: "Poison Control",
    phone: "1-800-222-1222",
    detail: "Exposure to smoke, chemicals, contaminated water.",
  },
  {
    name: "SAMHSA Disaster Distress Helpline",
    phone: "1-800-985-5990",
    detail: "24/7 crisis counseling for disaster survivors. Text TalkWithUs to 66746.",
  },
  {
    name: "Salvation Army Emergency Disaster Services",
    phone: "1-800-725-2769",
    url: "https://www.salvationarmyusa.org/usn/provide-disaster-relief/",
    detail: "Food, shelter, emotional and spiritual care.",
  },
];

export default function Emergency() {
  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Get help now</h1>
        <span className="spacer" />
        <Link to="/"><button className="secondary">← Home</button></Link>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        If you or someone near you is in immediate danger, call <strong>911</strong>.
      </p>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        {CONTACTS.map((c) => (
          <div key={c.name} className="card" style={c.urgent ? { borderColor: "var(--danger)" } : undefined}>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>{c.name}</h3>
            {c.phone && (
              <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}>
                <button className={c.urgent ? "danger" : ""} style={{ marginBottom: 8 }}>
                  Call {c.phone}
                </button>
              </a>
            )}
            <p className="muted" style={{ margin: "4px 0 8px", fontSize: 13 }}>{c.detail}</p>
            {c.url && (
              <a href={c.url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 13 }}>
                {c.url.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
        Once you're safe, <Link to="/login" style={{ textDecoration: "underline" }}>sign in</Link> to start
        documenting damage and your recovery plan.
      </p>
    </div>
  );
}
