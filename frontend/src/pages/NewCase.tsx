import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { BackButton } from "../components/BackButton";
import { Hint } from "../components/Hint";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { useCases } from "../lib/CasesContext";

// Big tappable cards instead of a dropdown: every option visible at once,
// no fine motor control needed. Text only — no emoji.
const DISASTERS = [
  { value: "wildfire", label: "Wildfire / smoke", detail: "Fire, smoke, or ash damage" },
  { value: "flood", label: "Flood / water", detail: "Flooding, sewer backup, burst pipes" },
  { value: "hurricane", label: "Hurricane / wind", detail: "Severe wind or storm damage" },
  { value: "tornado", label: "Tornado", detail: "Tornado or funnel-cloud damage" },
  { value: "earthquake", label: "Earthquake", detail: "Structural or shaking damage" },
  { value: "other", label: "Something else", detail: "Hail, winter storm, or anything else" },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function NewCase() {
  const nav = useNavigate();
  const { refresh } = useCases();
  const [form, setForm] = useState({
    case_name: "",
    disaster_type: "wildfire",
    location: "",
    incident_date: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm({ ...form, [k]: v });
  }

  // Naming a case is a creative task nobody in crisis needs. Suggest one
  // from what we already know; the user can change it any time.
  function suggestedName(): string {
    const label = DISASTERS.find((d) => d.value === form.disaster_type)?.label ?? "Recovery";
    const place = form.location ? form.location.split(",")[0].trim() : "";
    const when = (form.incident_date ? new Date(form.incident_date + "T00:00:00") : new Date())
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return [label.split(" /")[0], place, when].filter(Boolean).join(" — ");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const payload = { ...form, case_name: form.case_name.trim() || suggestedName() };
      const res = await api.createCase(payload);
      refresh();
      nav(`/cases/${res.case.id}/recommendations`);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 620 }}>
      <BackButton to="/dashboard" label="Dashboard" />
      <h1 style={{ marginTop: 16 }}>Tell us what happened</h1>
      <p className="warm-note">
        Just the basics for now. You can add photos and documents in the next step.
      </p>
      <div className="card">
        <form onSubmit={submit}>
          <label id="disaster-label">What kind of disaster was it?</label>
          <div className="choice-grid" role="radiogroup" aria-labelledby="disaster-label">
            {DISASTERS.map((d) => (
              <button
                key={d.value}
                type="button"
                role="radio"
                aria-checked={form.disaster_type === d.value}
                className={`choice-card${form.disaster_type === d.value ? " selected" : ""}`}
                onClick={() => update("disaster_type", d.value)}
              >
                <span className="choice-title">{d.label}</span>
                <span className="choice-detail">{d.detail}</span>
              </button>
            ))}
          </div>

          <label>
            Where did it happen?{" "}
            <Hint text="We use this to match you with local emergency services and resources. We currently know Alberta best." />
          </label>
          <LocationAutocomplete
            value={form.location}
            onChange={(v) => update("location", v)}
          />

          <label>
            When did it happen?{" "}
            <Hint text="Optional - an estimate is fine. It helps us flag insurance deadlines that are coming up soon." />
          </label>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <button type="button" className="secondary chip-btn" onClick={() => update("incident_date", isoDaysAgo(0))}>
              Today
            </button>
            <button type="button" className="secondary chip-btn" onClick={() => update("incident_date", isoDaysAgo(1))}>
              Yesterday
            </button>
            <button type="button" className="secondary chip-btn" onClick={() => update("incident_date", isoDaysAgo(7))}>
              About a week ago
            </button>
          </div>
          <input
            type="date"
            value={form.incident_date}
            aria-label="Date of the incident"
            onChange={(e) => update("incident_date", e.target.value)}
          />

          <label>
            Name for this case (optional){" "}
            <Hint text="Just a label to find it later. We'll pick a sensible one if you leave this blank, and you can change it anytime." />
          </label>
          <input
            value={form.case_name}
            placeholder={suggestedName()}
            onChange={(e) => update("case_name", e.target.value)}
          />

          {err && <div className="error">{err}</div>}
          <div style={{ marginTop: 20 }}>
            <button type="submit" disabled={busy} className="big">
              {busy ? "Setting things up…" : "Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
