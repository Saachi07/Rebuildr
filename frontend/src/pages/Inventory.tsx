import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Item, RoomScan, ScannedItem } from "../api";

const CATEGORIES = ["furniture", "electronics", "appliance", "clothing", "structural", "document", "other"];
const SEVERITIES = ["minor", "moderate", "severe", "destroyed"];
const DAMAGE_TYPES = ["fire", "smoke", "water", "wind", "mold", "other"];

type Draft = ScannedItem & {
  draft_id: string;
  damage_type: string;
  damage_severity: string;
  estimated_value: number;
};

function midPrice(s: ScannedItem) {
  const { low, high } = s.canadian_retail_estimate_cad ?? { low: 0, high: 0 };
  return Math.round((low + high) / 2);
}

function toDraft(s: ScannedItem, i: number): Draft {
  return {
    ...s,
    draft_id: `${Date.now()}-${i}`,
    damage_type: "fire",
    damage_severity: "moderate",
    estimated_value: midPrice(s),
  };
}

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

  const [scan, setScan] = useState<RoomScan | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"none" | "category" | "status" | "price">("none");

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

  async function onScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanBusy(true);
    setScanErr(null);
    try {
      const result = await api.analyzeRoomPhoto(file);
      setScan(result);
      setDrafts(result.items.map(toDraft));
    } catch (e: any) {
      setScanErr(e.message ?? String(e));
    } finally {
      setScanBusy(false);
    }
  }

  function updateDraft(draft_id: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.draft_id === draft_id ? { ...d, ...patch } : d)));
  }

  function dropDraft(draft_id: string) {
    setDrafts((ds) => ds.filter((d) => d.draft_id !== draft_id));
  }

  async function saveAllDrafts() {
    if (!id || drafts.length === 0) return;
    setBusy(true);
    setScanErr(null);
    try {
      for (const d of drafts) {
        await api.createItem(id, {
          name: d.name,
          category: mapCategory(d.category),
          damage_type: d.damage_type,
          damage_severity: d.damage_severity,
          estimated_value: d.estimated_value,
          description: [d.visible_brand, d.approximate_size, `x${d.count}`].filter(Boolean).join(" · "),
        });
      }
      setDrafts([]);
      setScan(null);
      load();
    } catch (e: any) {
      setScanErr(e.message ?? String(e));
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
        <h3 style={{ marginTop: 0 }}>Scan a room from a photo</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Upload a photo and we'll extract the items, categories, and rough replacement value.
          Review the draft before saving.
        </p>
        <input type="file" accept="image/*" onChange={onScan} disabled={scanBusy} />
        {scanBusy && <p className="muted" style={{ marginTop: 8 }}>Analyzing photo…</p>}
        {scanErr && <div className="error">{scanErr}</div>}

        {scan && drafts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="row">
              <strong>{scan.room_type}</strong>
              <span className="badge">{drafts.length} items</span>
              <span className="spacer" />
              <button onClick={saveAllDrafts} disabled={busy}>
                {busy ? "Saving…" : `Save all ${drafts.length} items`}
              </button>
            </div>
            {scan.notes && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{scan.notes}</p>}

            <div className="grid grid-2" style={{ marginTop: 12 }}>
              {drafts.map((d) => (
                <div key={d.draft_id} className="card" style={{ margin: 0 }}>
                  <input
                    value={d.name}
                    onChange={(e) => updateDraft(d.draft_id, { name: e.target.value })}
                  />
                  <p className="muted" style={{ fontSize: 12, margin: "6px 0" }}>
                    {d.category} · {d.condition} · {d.approximate_size}
                    {d.visible_brand ? ` · ${d.visible_brand}` : ""} · x{d.count}
                  </p>
                  <div className="grid grid-2">
                    <div>
                      <label>Damage type</label>
                      <select
                        value={d.damage_type}
                        onChange={(e) => updateDraft(d.draft_id, { damage_type: e.target.value })}
                      >
                        {DAMAGE_TYPES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Severity</label>
                      <select
                        value={d.damage_severity}
                        onChange={(e) => updateDraft(d.draft_id, { damage_severity: e.target.value })}
                      >
                        {SEVERITIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Estimated value (CAD)</label>
                      <input
                        type="number"
                        value={d.estimated_value}
                        onChange={(e) => updateDraft(d.draft_id, { estimated_value: Number(e.target.value) })}
                      />
                      <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                        AI range: ${d.canadian_retail_estimate_cad.low}–${d.canadian_retail_estimate_cad.high}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button className="secondary" onClick={() => dropDraft(d.draft_id)}>
                        Discard
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a damaged item manually</h3>
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

      <div className="row" style={{ marginTop: 8 }}>
        <h3 style={{ margin: 0 }}>Logged items ({items.length})</h3>
        <span className="spacer" />
        {items.length > 0 && (
          <>
            <label style={{ margin: 0 }}>Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              style={{ width: "auto" }}
            >
              <option value="none">Default</option>
              <option value="category">Category</option>
              <option value="status">Status (damaged first)</option>
              <option value="price">Price (high → low)</option>
            </select>
          </>
        )}
      </div>
      {items.length === 0 && <p className="muted">No items yet.</p>}
      {items.length > 0 && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Status</th>
              <th>Severity</th>
              <th>Est. price</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortItems(items, sortBy).map((it) => {
              const status = itemStatus(it);
              return (
                <tr key={it.id}>
                  <td>
                    <strong>{it.name}</strong>
                    {it.description && <div className="muted" style={{ fontSize: 12 }}>{it.description}</div>}
                  </td>
                  <td>{it.category ?? <span className="muted">—</span>}</td>
                  <td>
                    {status === "damaged" && <span className="status-damaged">Damaged</span>}
                    {status === "salvageable" && <span className="status-salvageable">Salvageable</span>}
                    {status === "unknown" && <span className="muted">—</span>}
                  </td>
                  <td>{it.damage_severity ? <span className="badge">{it.damage_severity}</span> : <span className="muted">—</span>}</td>
                  <td>{it.estimated_value ? `$${it.estimated_value}` : <span className="muted">—</span>}</td>
                  <td className="actions muted" style={{ fontSize: 12 }}>—</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {items.length > 0 && (
        <div className="row" style={{ marginTop: 24 }}>
          <span className="spacer" />
          <Link to="/documents"><button className="secondary">Next: Documents →</button></Link>
          <Link to={`/cases/${id}/recommendations`} style={{ marginLeft: 8 }}>
            <button>Next: Recommendations →</button>
          </Link>
        </div>
      )}
    </div>
  );
}

type ItemStatus = "damaged" | "salvageable" | "unknown";

function itemStatus(it: Item): ItemStatus {
  if (!it.damage_severity && !it.damage_type) return "unknown";
  if (it.damage_severity === "severe" || it.damage_severity === "destroyed") return "damaged";
  return "salvageable";
}

function sortItems(items: Item[], by: "none" | "category" | "status" | "price"): Item[] {
  if (by === "none") return items;
  const copy = [...items];
  if (by === "category") {
    copy.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""));
  } else if (by === "status") {
    const rank: Record<ItemStatus, number> = { damaged: 0, salvageable: 1, unknown: 2 };
    copy.sort((a, b) => rank[itemStatus(a)] - rank[itemStatus(b)]);
  } else if (by === "price") {
    copy.sort((a, b) => (b.estimated_value ?? 0) - (a.estimated_value ?? 0));
  }
  return copy;
}

function mapCategory(geminiCategory: string): string {
  switch (geminiCategory) {
    case "furniture":
    case "appliance":
    case "electronics":
    case "clothing":
      return geminiCategory;
    case "decor":
    case "other":
    default:
      return "other";
  }
}
