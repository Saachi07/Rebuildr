import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const DISASTERS = ["wildfire", "flood", "hurricane", "tornado", "earthquake", "other"];

const LOCATIONS = [
  "Medicine Hat, AB",
  "Cypress County, AB",
  "Bow Island, AB",
  "Lethbridge, AB",
  "Taber, AB",
  "Warner, AB",
  "Vulcan, AB",
  "Pincher Creek, AB",
  "Cardston, AB",
  "Willow Creek, AB",
  "Acadia, AB",
  "Special Areas 2, AB",
  "Special Areas 3, AB",
  "Special Areas 4, AB",
  "Drumheller, AB",
  "Kneehill, AB",
  "Starland, AB",
  "Wheatland, AB",
  "Calgary, AB",
  "Airdrie, AB",
  "Chestermere, AB",
  "Foothills, AB",
  "Stettler, AB",
  "Wainwright, AB",
  "Provost, AB",
  "Vermilion River, AB",
  "Red Deer, AB",
  "Lacombe, AB",
  "Sylvan Lake, AB",
  "Ponoka, AB",
  "Rocky Mountain House, AB",
  "Clearwater County, AB",
  "Camrose, AB",
  "Leduc, AB",
  "Wetaskiwin, AB",
  "Beaver County, AB",
  "Edmonton, AB",
  "Sherwood Park, AB",
  "St. Albert, AB",
  "Spruce Grove, AB",
  "Cold Lake, AB",
  "Bonnyville, AB",
  "St. Paul, AB",
  "Athabasca, AB",
  "Westlock, AB",
  "Barrhead, AB",
  "Thorhild, AB",
  "Edson, AB",
  "Hinton, AB",
  "Yellowhead County, AB",
  "Banff, AB",
  "Canmore, AB",
  "Kananaskis, AB",
  "Jasper, AB",
  "Wood Buffalo, AB",
  "Fort McMurray, AB",
  "Fort Chipewyan, AB",
  "Slave Lake, AB",
  "High Prairie, AB",
  "Lesser Slave River, AB",
  "Grande Cache, AB",
  "Valleyview, AB",
  "Greenview, AB",
  "Grande Prairie, AB",
  "Peace River, AB",
  "Fairview, AB",
];

export default function NewCase() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    case_name: "",
    disaster_type: "wildfire",
    location: LOCATIONS[0],
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
          <select value={form.location} onChange={(e) => update("location", e.target.value)}>
            {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>

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
