import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Item, RoomScan, ScannedItem } from "../api";
import { BackButton } from "../components/BackButton";
import { Hint } from "../components/Hint";

const CATEGORIES = ["furniture", "electronics", "appliance", "clothing", "structural", "document", "other"];
const SEVERITIES = ["minor", "moderate", "severe", "destroyed"];
const DAMAGE_TYPES = ["fire", "smoke", "water", "wind", "mold", "other"];

type PrePost = "pre" | "post";

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

function toDraft(s: ScannedItem, i: number, kind: PrePost): Draft {
  return {
    ...s,
    draft_id: `${Date.now()}-${i}`,
    damage_type: kind === "post" ? "fire" : "other",
    damage_severity: kind === "post" ? "moderate" : "minor",
    estimated_value: midPrice(s),
  };
}

export default function Inventory() {
  const { id } = useParams();
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<PrePost>("post");
  const [form, setForm] = useState({
    name: "",
    category: "furniture",
    damage_type: "fire",
    damage_severity: "moderate",
    estimated_value: "",
    description: "",
    room: "",
  });
  const [busy, setBusy] = useState(false);

  const [scan, setScan] = useState<RoomScan | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"none" | "room" | "category" | "status" | "price">("room");

  // Items the user has from other cases — offered as "attach to this case"
  // so they don't have to re-enter what they already documented elsewhere.
  const [library, setLibrary] = useState<Item[]>([]);
  const [attaching, setAttaching] = useState<string | null>(null);

  function load() {
    if (!id) return;
    api.listItems(id).then((r) => setItems(r.items)).catch((e) => setErr(String(e)));
    api.listMyItems()
      .then((r) => setLibrary(r.items.filter((it) => it.case_id !== id)))
      .catch(() => setLibrary([]));
  }

  useEffect(load, [id]);

  async function attachFromLibrary(itemId: string) {
    if (!id) return;
    setAttaching(itemId);
    try {
      await api.attachItemToCase(itemId, id);
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setAttaching(null);
    }
  }

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
      const result = await api.analyzeRoomPhoto(file, kind);
      setScan(result);
      setDrafts(result.items.map((s, i) => toDraft(s, i, kind)));
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
      const roomLabel = scan?.room_type ?? "";
      for (const d of drafts) {
        await api.createItem(id, {
          name: d.name,
          category: mapCategory(d.category),
          damage_type: d.damage_type,
          damage_severity: d.damage_severity,
          estimated_value: d.estimated_value,
          description: [d.visible_brand, d.approximate_size, `x${d.count}`].filter(Boolean).join(" · "),
          room: roomLabel,
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
      <BackButton />
      <div className="row" style={{ marginTop: 16 }}>
        <h1 style={{ margin: 0 }}>What you lost</h1>
        <span className="spacer" />
        <Link to={`/cases/${id}/recommendations`}>
          <button>See your plan →</button>
        </Link>
      </div>
      <p className="warm-note" style={{ marginTop: 8 }}>
        Snap a photo of one room at a time — we'll list what we see. You can
        edit anything before saving.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Scan a room from a photo</h3>

        <label style={{ marginTop: 0 }}>
          Is this photo from before or after the damage?{" "}
          <Hint text="Before-photos help prove what you had. After-photos document the damage. Pick one — you can add more photos for the other later." />
        </label>
        <div className="toggle-group" role="tablist" aria-label="Photo type">
          <button
            type="button"
            role="tab"
            aria-selected={kind === "pre"}
            className={kind === "pre" ? "active" : ""}
            onClick={() => setKind("pre")}
          >
            Before the damage
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "post"}
            className={kind === "post" ? "active" : ""}
            onClick={() => setKind("post")}
          >
            After the damage
          </button>
        </div>

        <p className="muted-strong" style={{ marginTop: 14, fontSize: 14 }}>
          Upload a photo and we'll list what's in it with rough replacement
          prices. You'll get to review every item before anything is saved.
        </p>
        <input type="file" accept="image/*" onChange={onScan} disabled={scanBusy} />
        {scanBusy && <p className="muted-strong" style={{ marginTop: 8 }}>Looking at your photo…</p>}
        {scanErr && <div className="error">{scanErr}</div>}

        {scan && drafts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="row">
              <strong>{scan.room_type}</strong>
              <span className="badge">{drafts.length} items</span>
              <span className="badge">{kind === "pre" ? "Before" : "After"}</span>
              <span className="spacer" />
              <button onClick={saveAllDrafts} disabled={busy}>
                {busy ? "Saving…" : `Save all ${drafts.length} items`}
              </button>
            </div>
            {scan.notes && <p className="muted-strong" style={{ fontSize: 14, marginTop: 8 }}>{scan.notes}</p>}

            <div className="grid grid-2" style={{ marginTop: 12 }}>
              {drafts.map((d) => (
                <div key={d.draft_id} className="card" style={{ margin: 0 }}>
                  <input
                    value={d.name}
                    onChange={(e) => updateDraft(d.draft_id, { name: e.target.value })}
                  />
                  <p className="muted-strong" style={{ fontSize: 13, margin: "6px 0" }}>
                    {d.category} · {d.condition} · {d.approximate_size}
                    {d.visible_brand ? ` · ${d.visible_brand}` : ""} · x{d.count}
                  </p>
                  <div className="grid grid-2">
                    <div>
                      <label>
                        Damage type{" "}
                        <Hint text="The cause of the damage — fire, smoke, water, etc. We use this to match you with the right resources." />
                      </label>
                      <select
                        value={d.damage_type}
                        onChange={(e) => updateDraft(d.draft_id, { damage_type: e.target.value })}
                      >
                        {DAMAGE_TYPES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>
                        How bad?{" "}
                        <Hint text="Minor = surface marks. Moderate = repairable. Severe = barely usable. Destroyed = total loss." />
                      </label>
                      <select
                        value={d.damage_severity}
                        onChange={(e) => updateDraft(d.draft_id, { damage_severity: e.target.value })}
                      >
                        {SEVERITIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>
                        Replacement value (CAD){" "}
                        <Hint text="What it would cost to buy this again today, not what you originally paid." />
                      </label>
                      <input
                        type="number"
                        value={d.estimated_value}
                        onChange={(e) => updateDraft(d.draft_id, { estimated_value: Number(e.target.value) })}
                      />
                      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        Our estimate: ${d.canadian_retail_estimate_cad.low}–${d.canadian_retail_estimate_cad.high}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button className="secondary" onClick={() => dropDraft(d.draft_id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {library.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>
            From your library
            <span className="badge" style={{ marginLeft: 8 }}>{library.length}</span>
          </h3>
          <p className="muted-strong" style={{ marginTop: 0, fontSize: 14 }}>
            Items you've already documented in other cases. Add any that
            apply here too — no need to re-enter them.
          </p>
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th>Room</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {library.slice(0, 12).map((it) => (
                <tr key={it.id}>
                  <td>
                    <strong>{it.name}</strong>
                    {it.category && <span className="badge" style={{ marginLeft: 8 }}>{it.category}</span>}
                  </td>
                  <td>{it.room || <span className="muted">—</span>}</td>
                  <td>{it.estimated_value ? `$${it.estimated_value}` : <span className="muted">—</span>}</td>
                  <td className="actions">
                    <button
                      className="secondary"
                      disabled={attaching === it.id}
                      onClick={() => attachFromLibrary(it.id)}
                    >
                      {attaching === it.id ? "Adding…" : "Add to this case"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a damaged item manually</h3>
        <form onSubmit={add}>
          <div className="grid grid-2">
            <div>
              <label>Item name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label>
                Room{" "}
                <Hint text="Which room was it in? e.g. Living room, Kitchen, Garage." />
              </label>
              <input
                value={form.room}
                placeholder="e.g. Living room"
                onChange={(e) => setForm({ ...form, room: e.target.value })}
              />
            </div>
            <div>
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>
                Damage type{" "}
                <Hint text="The cause of the damage — fire, smoke, water, wind, mold, or something else." />
              </label>
              <select value={form.damage_type} onChange={(e) => setForm({ ...form, damage_type: e.target.value })}>
                {DAMAGE_TYPES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>
                How bad?{" "}
                <Hint text="Minor = surface marks. Moderate = repairable. Severe = barely usable. Destroyed = total loss." />
              </label>
              <select value={form.damage_severity} onChange={(e) => setForm({ ...form, damage_severity: e.target.value })}>
                {SEVERITIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>
                Replacement value ($){" "}
                <Hint text="What it would cost to buy this again today, not what you originally paid." />
              </label>
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
        <h3 style={{ margin: 0 }}>Saved items ({items.length})</h3>
        <span className="spacer" />
        {items.length > 0 && (
          <>
            <label style={{ margin: 0 }}>Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              style={{ width: "auto" }}
            >
              <option value="room">Room</option>
              <option value="none">When added</option>
              <option value="category">Category</option>
              <option value="status">Damage (worst first)</option>
              <option value="price">Value (high → low)</option>
            </select>
          </>
        )}
      </div>
      {items.length === 0 && <p className="muted-strong">Nothing saved yet.</p>}
      {items.length > 0 && sortBy === "room" ? (
        <RoomGroupedItems items={items} />
      ) : items.length > 0 ? (
        <ItemTable items={sortItems(items, sortBy)} />
      ) : null}

      {items.length > 0 && (
        <div className="row" style={{ marginTop: 24 }}>
          <span className="spacer" />
          <Link to="/documents"><button className="secondary">Documents →</button></Link>
          <Link to={`/cases/${id}/recommendations`} style={{ marginLeft: 8 }}>
            <button>See your plan →</button>
          </Link>
        </div>
      )}
    </div>
  );
}

function RoomGroupedItems({ items }: { items: Item[] }) {
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const key = it.room?.trim() || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const ordered = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      {ordered.map(([room, group]) => (
        <div key={room} className="room-group">
          <h3>{room} <span className="badge" style={{ marginLeft: 6 }}>{group.length}</span></h3>
          <ItemTable items={group} />
        </div>
      ))}
    </>
  );
}

function ItemTable({ items }: { items: Item[] }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Item</th>
          <th>Category</th>
          <th>Status</th>
          <th>Severity</th>
          <th>Est. value</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
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
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type ItemStatus = "damaged" | "salvageable" | "unknown";

function itemStatus(it: Item): ItemStatus {
  if (!it.damage_severity && !it.damage_type) return "unknown";
  if (it.damage_severity === "severe" || it.damage_severity === "destroyed") return "damaged";
  return "salvageable";
}

function sortItems(items: Item[], by: "none" | "room" | "category" | "status" | "price"): Item[] {
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
