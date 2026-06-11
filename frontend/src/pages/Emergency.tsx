import { Link } from "react-router-dom";
import { BackButton } from "../components/BackButton";

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
    name: "Disaster Distress Helpline",
    phone: "1-800-985-5990",
    detail: "24/7 crisis counseling for disaster survivors. Free and confidential. Text TalkWithUs to 66746.",
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
    name: "Salvation Army Emergency Disaster Services",
    phone: "1-800-725-2769",
    url: "https://www.salvationarmyusa.org/usn/provide-disaster-relief/",
    detail: "Food, shelter, emotional and spiritual care.",
  },
];

export default function Emergency() {
  return (
    <div className="container">
      <BackButton label="Back" />
      <div style={{ marginTop: 16 }}>
        <h1 style={{ margin: 0 }}>Get help now</h1>
      </div>
      <p className="warm-note" style={{ marginTop: 8 }}>
        If you or someone near you is in immediate danger, call{" "}
        <strong>911</strong>. The other lines below are free, and most are
        24/7. It's okay to call just to talk.
      </p>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        {CONTACTS.map((c) => (
          <div key={c.name} className="card" style={c.urgent ? { borderColor: "var(--danger)" } : undefined}>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>{c.name}</h3>
            {c.phone && (
              <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}>
                <button className={c.urgent ? "danger big" : "big"} style={{ marginBottom: 8 }}>
                  Call {c.phone}
                </button>
              </a>
            )}
            <p className="muted-strong" style={{ margin: "4px 0 8px", fontSize: 14 }}>{c.detail}</p>
            {c.url && (
              <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: "var(--focus)", textDecoration: "underline" }}>
                {c.url.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        ))}
      </div>

      <p className="muted-strong" style={{ marginTop: 24, fontSize: 14 }}>
        When you're safe, <Link to="/login" style={{ textDecoration: "underline", color: "var(--focus)" }}>sign in</Link> to start
        documenting what happened and building your plan.
      </p>
    </div>
  );
}
