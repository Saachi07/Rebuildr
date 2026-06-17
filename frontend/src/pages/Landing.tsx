import { Link } from "react-router-dom";
import DemoDropzone from "../components/DemoDropzone";

// The landing page leads with a hero and an unmissable Immediate Help block for
// anyone arriving mid-crisis, then shows the product through framed mockups
// instead of long paragraphs. Copy is kept short on purpose: a stressed reader
// should be able to scan it, not study it.

// Three product pillars, each shown with a real screenshot mockup. Detail lives
// on the inner pages, so each pillar links out rather than explaining in full.
const PILLARS = [
  {
    title: "List what you lost",
    body: "Photograph a room and our AI builds a claim-ready inventory with values.",
    // Drop a screenshot of the inventory scan result here (PNG, ~390px wide).
    img: "/landing/mockup-inventory.png",
    alt: "Rebuildr inventory: a scanned room with itemized values",
  },
  {
    title: "Read your insurance, for you",
    body: "Upload your policy and we pull out coverage, deductibles, and deadlines in plain language.",
    // Drop a screenshot of the document analysis summary here.
    img: "/landing/mockup-policy.png",
    alt: "Rebuildr policy analysis: plain-language summary with deadlines",
  },
  {
    title: "A plan, one step at a time",
    body: "Everything becomes a clear set of next steps, with the dates that matter.",
    // Drop a screenshot of the recommendations / plan view here.
    img: "/landing/mockup-plan.png",
    alt: "Rebuildr recovery plan: prioritized next steps",
  },
];

// Rebuildr is calibrated to Alberta's programs and deadlines for now (the
// Disaster Recovery Program, provincial relief, regional municipalities). A
// quiet regional anchor near the top tells a local visitor the guidance is
// built for where they are, not generic.
const ALBERTA_REGIONS = [
  "Edmonton",
  "Calgary",
  "Fort McMurray",
  "Red Deer",
  "Lethbridge",
  "Regional municipalities",
];

// Two real testimonials go here once collected. Placeholders keep the layout and
// tone in place; fill in `quote`, `name`, and `attribution` when ready.
const TESTIMONIALS = [
  {
    quote: "",
    name: "",
    attribution: "Wildfire survivor",
    placeholder: "Their words about what Rebuildr made easier will go here.",
  },
  {
    quote: "",
    name: "",
    attribution: "Flood survivor",
    placeholder: "A second short quote about getting back on their feet will go here.",
  },
];

export default function Landing() {
  // No sign-in step in demo mode, every visitor goes straight into a new case.
  const start = "/cases/new";
  return (
    <div className="container">
      <div className="hero">
        <h1>You're not doing this alone.</h1>
        <p className="warm">
          Rebuildr helps you document what you lost, understand your insurance,
          and turn it into a clear recovery plan.
        </p>
        <div className="cta-row">
          <Link to={start}><button className="big">Start when you're ready</button></Link>
        </div>
      </div>

      {/* #15: Immediate Help is the single most prominent block, sized and
          colored so a person in crisis cannot miss it. */}
      <section className="immediate-help" aria-label="Immediate help">
        <div>
          <h2>Need help right now?</h2>
          <p>
            If you or someone near you is in danger, call <strong>911</strong>.
            For shelter, food, or someone to talk to, get help lines that pick up
            24/7.
          </p>
        </div>
        <Link to="/emergency"><button className="urgent big">Get help now</button></Link>
      </section>

      {/* Regional anchor: built for Alberta's programs and deadlines. */}
      <section className="region-band" aria-label="Where Rebuildr works">
        <div className="region-band-head">
          <span className="region-tag">Alberta</span>
          <p>
            Built around Alberta's recovery programs, relief funding, and
            filing deadlines, so the guidance fits the rules where you live.
          </p>
        </div>
        <ul className="region-list">
          {ALBERTA_REGIONS.map((r) => (
            <li key={r} className="pill">{r}</li>
          ))}
        </ul>
      </section>

      {/* #2: interactive no-login demo of the AI scan. */}
      <section className="landing-section">
        <div className="section-head">
          <h2>Try it yourself</h2>
          <p className="muted-strong">
            See what our AI finds in one photo of a room. No account needed.
          </p>
        </div>
        <DemoDropzone />
      </section>

      {/* #1 + #16: show the product through framed mockups, not paragraphs. */}
      <section className="landing-section">
        <div className="section-head">
          <h2>What Rebuildr does</h2>
        </div>
        <div className="grid grid-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="pillar">
              <div className="phone-mock">
                {/* Screenshot placeholder: replace the src files in
                    /public/landing when the mockups are finalized. */}
                <img
                  src={p.img}
                  alt={p.alt}
                  onError={(e) => { (e.currentTarget.style.display = "none"); }}
                />
                <div className="phone-mock-placeholder" aria-hidden>
                  Screenshot coming soon
                </div>
              </div>
              <h3>{p.title}</h3>
              <p className="muted-strong">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* #5: testimonial placeholders. */}
      <section className="landing-section">
        <div className="section-head">
          <h2>From people who have been through it</h2>
        </div>
        <div className="grid grid-2">
          {TESTIMONIALS.map((t, i) => (
            <figure key={i} className="testimonial">
              <blockquote>
                {t.quote || <span className="muted">{t.placeholder}</span>}
              </blockquote>
              <figcaption>
                <span className="testimonial-avatar" aria-hidden />
                <span>
                  <strong>{t.name || "Name to come"}</strong>
                  <span className="muted-strong" style={{ display: "block", fontSize: 13 }}>
                    {t.attribution}
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* #3: concrete security/trust statement, true to the RLS setup. */}
      <section className="landing-section">
        <div className="card calm-card trust-badge">
          <div className="trust-mark" aria-hidden>Secured</div>
          <div>
            <h2 style={{ marginTop: 0 }}>Your information stays yours</h2>
            <p className="muted-strong" style={{ marginBottom: 6 }}>
              Your documents and photos are encrypted and isolated to your
              account, so no other user can ever reach them. We use them only to
              help your recovery, never to sell or share. You can export
              everything or delete your account at any time.
            </p>
            <p className="muted-strong" style={{ margin: 0 }}>
              Read our{" "}
              <Link to="/legal/privacy" style={{ color: "var(--focus)", textDecoration: "underline" }}>Privacy Policy</Link>{" "}
              and{" "}
              <Link to="/legal/terms" style={{ color: "var(--focus)", textDecoration: "underline" }}>Terms of Service</Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section center-cta">
        <h2>Ready when you are</h2>
        <p className="muted-strong" style={{ maxWidth: 520, margin: "0 auto 20px" }}>
          Start with a single photo or document. We will be here for the rest.
        </p>
        <div className="cta-row" style={{ justifyContent: "center" }}>
          <Link to={start}><button className="big">Start when you're ready</button></Link>
        </div>
      </section>

      <footer className="landing-footer">
        <Link to="/legal/privacy">Privacy Policy</Link>
        <span aria-hidden>·</span>
        <Link to="/legal/terms">Terms of Service</Link>
        <span aria-hidden>·</span>
        <Link to="/emergency">Get help now</Link>
      </footer>
    </div>
  );
}
