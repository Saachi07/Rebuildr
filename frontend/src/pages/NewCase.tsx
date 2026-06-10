import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { BackButton } from "../components/BackButton";
import { Hint } from "../components/Hint";
import { LocationAutocomplete } from "../components/LocationAutocomplete";

const DISASTERS = [
  { value: "wildfire", label: "Wildfire / smoke" },
  { value: "flood", label: "Flood / water" },
  { value: "hurricane", label: "Hurricane / wind" },
  { value: "tornado", label: "Tornado" },
  { value: "earthquake", label: "Earthquake" },
  { value: "other", label: "Something else" },
];

export default function NewCase() {
  const nav = useNavigate();
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await api.createCase(form);
      nav(`/cases/${res.case.id}/recommendations`);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 620 }}>
      <BackButton />
      <h1 style={{ marginTop: 16 }}>Tell us what happened</h1>
      <p className="warm-note">
        Just the basics for now. You can add photos and documents in the next step.
      </p>
      <div className="card">
        <form onSubmit={submit}>
          <label>
            What would you like to call this?{" "}
            <Hint text="Just a name to find it later — e.g. 'Our house fire' or 'June flood'. You can change it anytime." />
          </label>
          <input
            value={form.case_name}
            placeholder="e.g. Our house fire"
            onChange={(e) => update("case_name", e.target.value)}
            required
          />

          <label>What kind of disaster was it?</label>
          <select value={form.disaster_type} onChange={(e) => update("disaster_type", e.target.value)}>
            {DISASTERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>

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
            <Hint text="Optional — but it helps us flag insurance deadlines that are coming up soon." />
          </label>
          <input
            type="date"
            value={form.incident_date}
            onChange={(e) => update("incident_date", e.target.value)}
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
