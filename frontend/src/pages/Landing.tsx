import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// What Rebuildr actually does, grounded in the real features: document
// analysis, inventory, the recovery plan, local programs, claim tracking,
// and emergency help. Kept warm and plain, no jargon.
const FEATURES = [
  {
    title: "Read your insurance, for you",
    body: "Upload your policy and we pull out what is covered, your deductible, and the deadlines that matter, all in plain language.",
  },
  {
    title: "List what you lost",
    body: "Photograph each room and we help you list and value the damage, ready to attach to your claim.",
  },
  {
    title: "A plan, one step at a time",
    body: "We turn everything into a clear set of next steps, with the dates that matter, updated as your situation changes.",
  },
  {
    title: "Find local help",
    body: "We match you with disaster programs, financial aid, and support services in your area that you may qualify for.",
  },
  {
    title: "Track your claim",
    body: "Follow your claim from the first call to payout, log every conversation, and keep your living-expense receipts in one place.",
  },
  {
    title: "Help when you need it",
    body: "Crisis lines, local support, and weather alerts for your area, always one tap away.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Share what you have",
    body: "A few photos, your insurance papers, even just one document is enough to start.",
  },
  {
    n: "2",
    title: "We sort it for you",
    body: "We read your policy, list what you lost, and figure out what is covered.",
  },
  {
    n: "3",
    title: "You get a plan",
    body: "A clear next step, the deadlines that matter, and people who can help.",
  },
];

const DISASTERS = [
  "Wildfire and smoke",
  "Flood and water",
  "Hurricane and wind",
  "Tornado",
  "Earthquake",
  "Hail, winter storms, and more",
];

export default function Landing() {
  const { user } = useAuth();
  const start = user ? "/cases/new" : "/login";
  return (
    <div className="container">
      <div className="hero">
        <h1>You're not doing this alone.</h1>
        <p className="warm">
          Rebuildr is a companion for getting back on your feet after a
          disaster. We read your insurance, help you document what you lost,
          and turn it all into a clear recovery plan, one small step at a time.
        </p>
        <div className="cta-row">
          <Link to="/emergency"><button className="urgent big">I need help right now</button></Link>
          <Link to={start}><button className="big">Start when you're ready</button></Link>
        </div>
      </div>

      <section className="landing-section">
        <div className="section-head">
          <h2>What Rebuildr does</h2>
          <p className="muted-strong">
            Recovering after a fire, flood, or storm means paperwork, deadlines,
            and decisions at the worst possible time. Rebuildr carries that load
            with you.
          </p>
        </div>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <h3 style={{ marginTop: 0 }}>{f.title}</h3>
              <p className="muted-strong" style={{ margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="section-head">
          <h2>How it works</h2>
          <p className="muted-strong">
            Three steps, at your own pace. Nothing has to happen all at once.
          </p>
        </div>
        <div className="grid grid-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card">
              <div className="step-num">{s.n}</div>
              <h3 style={{ margin: "12px 0 6px" }}>{s.title}</h3>
              <p className="muted-strong" style={{ margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="section-head">
          <h2>Whatever happened, we can help</h2>
          <p className="muted-strong">
            Rebuildr supports recovery from a wide range of disasters.
          </p>
        </div>
        <ul className="pill-list">
          {DISASTERS.map((d) => (
            <li key={d} className="pill">{d}</li>
          ))}
        </ul>
      </section>

      <section className="landing-section">
        <div className="card calm-card">
          <h2 style={{ marginTop: 0 }}>Your information stays yours</h2>
          <p className="muted-strong">
            Your documents and photos are private and encrypted. We use them
            only to help with your recovery, never to sell or share. You can
            download everything you have given us, or delete your account, at
            any time.
          </p>
        </div>
      </section>

      <section className="landing-section center-cta">
        <h2>Ready when you are</h2>
        <p className="muted-strong" style={{ maxWidth: 520, margin: "0 auto 20px" }}>
          You can start with a single photo or document. We will be here for the
          rest.
        </p>
        <div className="cta-row" style={{ justifyContent: "center" }}>
          <Link to={start}><button className="big">Start when you're ready</button></Link>
        </div>
      </section>
    </div>
  );
}
