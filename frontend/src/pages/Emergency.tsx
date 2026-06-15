import { Link } from "react-router-dom";
import { BackButton } from "../components/BackButton";
import { useAuth } from "../auth/AuthContext";

type Contact = {
  name: string;
  phone?: string;
  phoneLabel?: string;
  url?: string;
  detail: string;
  urgent?: boolean;
};

// Rebuildr currently serves Alberta, Canada, every line here must actually
// pick up for an Albertan. (US numbers like FEMA were removed: a dead-end
// phone call is the last thing someone in crisis needs.)
const CONTACTS: Contact[] = [
  {
    name: "988 Suicide Crisis Helpline",
    phone: "988",
    phoneLabel: "Call or text 988",
    detail: "24/7 crisis support across Canada. Free and confidential. It's okay to call just to talk.",
    urgent: true,
  },
  {
    name: "211 Alberta",
    phone: "211",
    url: "https://ab.211.ca",
    detail: "24/7 help finding shelter, food, financial aid, and local disaster support. Free, confidential, in 170+ languages.",
    urgent: true,
  },
  {
    name: "Alberta Mental Health Help Line",
    phone: "1-877-303-2642",
    detail: "24/7 confidential support for stress, anxiety, and crisis after a disaster.",
  },
  {
    name: "Canadian Red Cross",
    phone: "1-800-863-6582",
    url: "https://www.redcross.ca/how-we-help/emergencies-and-disasters-in-canada",
    detail: "Emergency shelter, food, supplies, and family reunification after disasters.",
  },
  {
    name: "Alberta Supports",
    phone: "1-877-644-9992",
    url: "https://www.alberta.ca/alberta-supports",
    detail: "Government programs, emergency financial assistance, income support, housing help.",
  },
  {
    name: "Poison & Drug Information Service (PADIS)",
    phone: "1-800-332-1414",
    detail: "Exposure to smoke, chemicals, or contaminated water. 24/7 for Alberta.",
  },
  {
    name: "Alberta Emergency Alerts",
    url: "https://www.alberta.ca/alberta-emergency-alert",
    detail: "Live provincial alerts, evacuations, wildfires, floods, road closures.",
  },
];

export default function Emergency() {
  const { user } = useAuth();
  return (
    <div className="container">
      <BackButton to={user ? "/dashboard" : "/"} label={user ? "Dashboard" : "Home"} />
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
                  {c.phoneLabel ?? `Call ${c.phone}`}
                </button>
              </a>
            )}
            <p className="muted-strong" style={{ margin: "4px 0 8px", fontSize: 14 }}>{c.detail}</p>
            {c.url && (
              <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: "var(--focus)", textDecoration: "underline" }}>
                {c.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
          </div>
        ))}
      </div>

      <p className="muted-strong" style={{ marginTop: 24, fontSize: 14 }}>
        {user ? (
          <>
            When you're safe, head back to{" "}
            <Link to="/dashboard" style={{ textDecoration: "underline", color: "var(--focus)" }}>
              your dashboard
            </Link>{" "}
            to keep documenting what happened.
          </>
        ) : (
          <>
            When you're safe,{" "}
            <Link to="/login" style={{ textDecoration: "underline", color: "var(--focus)" }}>sign in</Link>{" "}
            to start documenting what happened and building your plan.
          </>
        )}
      </p>
    </div>
  );
}
