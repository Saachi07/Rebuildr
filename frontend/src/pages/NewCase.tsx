import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const DISASTERS = ["wildfire", "flood", "hurricane", "tornado", "earthquake", "other"];

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
      nav(`/cases/${res.case.id}`);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 600 }}>
      <h1>New case</h1>
      <div className="card">
        <form onSubmit={submit}>
          <label>Name your case</label>
          <input value={form.case_name} onChange={(e) => update("case_name", e.target.value)} required />

          <label>Disaster type</label>
          <select value={form.disaster_type} onChange={(e) => update("disaster_type", e.target.value)}>
            {DISASTERS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <label>Location</label>
          <input value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="City, state" />

          <label>Incident date</label>
          <input type="date" value={form.incident_date} onChange={(e) => update("incident_date", e.target.value)} />

          {err && <div className="error">{err}</div>}
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create case"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
