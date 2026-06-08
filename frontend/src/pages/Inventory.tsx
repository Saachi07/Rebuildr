import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Item } from "../api";

const CATEGORIES = ["furniture", "electronics", "appliance", "clothing", "structural", "document", "other"];
const SEVERITIES = ["minor", "moderate", "severe", "destroyed"];
const DAMAGE_TYPES = ["fire", "smoke", "water", "wind", "mold", "other"];

export default function Inventory() {
  const { id } = useParams();
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "furniture",
    damage_type: "fire",
    damage_severity: "moderate",
    estimated_value: "",
    description: "",
  });
  const [busy, setBusy] = useState(false);

  function load() {
    if (!id) return;
    api.listItems(id).then((r) => setItems(r.items)).catch((e) => setErr(String(e)));
  }

  useEffect(load, [id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createItem(id, {
        ...form,
        estimated_value: form.estimated_value ? Number(form.estimated_value) : undefined,
      });
      setForm({ ...form, name: "", estimated_value: "", description: "" });
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="row">
        <h1>Inventory</h1>
        <span className="spacer" />
        <Link to={`/cases/${id}`}><button className="secondary">← Back</button></Link>
        <Link to={`/cases/${id}/recommendations`} style={{ marginLeft: 8 }}>
          <button>Generate plan</button>
        </Link>
      </div>

      <div className="card">
        <h3>Add a damaged item</h3>
        <form onSubmit={add}>
          <div className="grid grid-2">
            <div>
              <label>Item name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>Damage type</label>
              <select value={form.damage_type} onChange={(e) => setForm({ ...form, damage_type: e.target.value })}>
                {DAMAGE_TYPES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>Severity</label>
              <select value={form.damage_severity} onChange={(e) => setForm({ ...form, damage_severity: e.target.value })}>
                {SEVERITIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>Estimated value ($)</label>
              <input type="number" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
            </div>
            <div>
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          {err && <div className="error">{err}</div>}
          <div style={{ marginTop: 12 }}>
            <button type="submit" disabled={busy}>{busy ? "Adding…" : "Add item"}</button>
          </div>
        </form>
      </div>

      <h3>Logged items ({items.length})</h3>
      {items.length === 0 && <p className="muted">No items yet.</p>}
      <div className="grid grid-2">
        {items.map((it) => (
          <div key={it.id} className="card">
            <strong>{it.name}</strong>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              {it.category} · {it.damage_type} · {it.damage_severity}
              {it.estimated_value ? ` · $${it.estimated_value}` : ""}
            </p>
            {it.description && <p style={{ marginTop: 6, fontSize: 13 }}>{it.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
