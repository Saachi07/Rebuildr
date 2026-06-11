import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Item, RoomScan, ScannedItem } from "../api";
import { BackButton } from "../components/BackButton";
import { Hint } from "../components/Hint";

const SEVERITIES = ["minor", "moderate", "severe", "destroyed"];
const DAMAGE_TYPES = ["fire", "smoke", "water", "wind", "mold", "other"];

// Default an item's damage type from the case's disaster, so the user doesn't
// re-pick fire/water/wind on every single item (#1).
const DISASTER_TO_DAMAGE: Record<string, string> = {
  wildfire: "fire",
  flood: "water",
  hurricane: "wind",
  tornado: "wind",
  earthquake: "other",
  other: "other",
};

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

function toDraft(s: ScannedItem, i: number, kind: PrePost, defaultDamage: string): Draft {
  return {
    ...s,
    draft_id: `${Date.now()}-${i}`,
    damage_type: kind === "post" ? defaultDamage : "other",
    damage_severity: kind === "post" ? "moderate" : "minor",
    estimated_value: midPrice(s),
  };
}

export default function Inventory() {
  const { id } = useParams();
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"none" | "room" | "category" | "status" | "price">("room");

  // Scan + draft-review state.
  const [kind, setKind] = useState<PrePost>("post");
  const [scan, setScan] = useState<RoomScan | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One room label for the whole batch — set once, applied to every item (#4).
  const [batchRoom, setBatchRoom] = useState("");
  // Per-item editing is collapsed by default; expand only what you want (#3/#6).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Default damage type, inferred from the case's disaster type (#1).
  const [defaultDamage, setDefaultDamage] = useState("fire");

  // Items the user has from other cases — offered as "attach to this case"
  // so they don't have to re-enter what they already documented elsewhere.
  const [library, setLibrary] = useState<Item[]>([]);
  const [attaching, setAttaching] = useState<string | null>(null);

  // Distinct rooms already in use — offered as move targets in the row menu.
  const allRooms = useMemo(
    () => Array.from(new Set(items.map((i) => i.room?.trim()).filter(Boolean) as string[])).sort(),
    [items],
  );

  function load() {
    if (!id) return;
    api.listItems(id).then((r) => setItems(r.items)).catch((e) => setErr(String(e)));
    api.listMyItems()
      .then((r) => setLibrary(r.items.filter((it) => it.case_id !== id)))
      .catch(() => setLibrary([]));
  }

  useEffect(load, [id]);

  // Fetch the case once to seed the default damage type for scanned items.
  useEffect(() => {
    if (!id) return;
    api.getCase(id)
      .then((r) => setDefaultDamage(DISASTER_TO_DAMAGE[r.case.disaster_type] ?? "other"))
      .catch(() => {});
  }, [id]);

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

  async function onScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanBusy(true);
    setScanErr(null);
    try {
      // Let Gemini decide before/after — the user only corrects it if wrong (#5).
      const result = await api.analyzeRoomPhoto(file, "auto");
      const detected: PrePost = result.detected_phase === "before" ? "pre" : "post";
      setKind(detected);
      setBatchRoom(result.room_type ?? "");
      setScan(result);
      setDrafts(result.items.map((s, i) => toDraft(s, i, detected, defaultDamage)));
      setExpanded(new Set());
    } catch (e: any) {
      setScanErr(e.message ?? String(e));
    } finally {
      setScanBusy(false);
    }
  }

  // Correcting the phase re-derives the damage defaults for every draft.
  function changePhase(next: PrePost) {
    setKind(next);
    setDrafts((ds) =>
      ds.map((d) => ({
        ...d,
        damage_type: next === "post" ? defaultDamage : "other",
        damage_severity: next === "post" ? "moderate" : "minor",
      })),
    );
  }

  function updateDraft(draft_id: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.draft_id === draft_id ? { ...d, ...patch } : d)));
  }

  function dropDraft(draft_id: string) {
    setDrafts((ds) => ds.filter((d) => d.draft_id !== draft_id));
  }

  function toggleExpand(draft_id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(draft_id) ? next.delete(draft_id) : next.add(draft_id);
      return next;
    });
  }

  async function saveAllDrafts() {
    if (!id || drafts.length === 0) return;
    setBusy(true);
    setScanErr(null);
    try {
      // One request for the whole batch — faster and atomic (#2).
      await api.createItemsBulk(
        id,
        drafts.map((d) => ({
          name: d.name,
          category: mapCategory(d.category),
          damage_type: d.damage_type,
          damage_severity: d.damage_severity,
          estimated_value: d.estimated_value,
          description: [d.visible_brand, d.approximate_size, `x${d.count}`].filter(Boolean).join(" · "),
          room: batchRoom,
        })),
      );
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
        Snap a photo of one room at a time — we'll list what we see, guess
        whether it's a before- or after-damage photo, and fill in the rest. You
        only review what you want before saving.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Scan a room from a photo</h3>
        <p className="muted-strong" style={{ marginTop: 0, fontSize: 14 }}>
          Upload a photo and we'll list what's in it with rough replacement
          prices. Nothing is saved until you say so.
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
                {busy ? "Saving…" : `Looks good — save all ${drafts.length}`}
              </button>
            </div>

            <div className="grid grid-2" style={{ marginTop: 12 }}>
              <div>
                <label>
                  Room{" "}
                  <Hint text="We set this for the whole batch from the photo. Change it once here and it applies to every item." />
                </label>
                <input
                  value={batchRoom}
                  placeholder="e.g. Living room"
                  onChange={(e) => setBatchRoom(e.target.value)}
                />
              </div>
              <div>
                <label>
                  Before or after the damage?{" "}
                  <Hint text="We guessed from the photo — change it if we got it wrong. This sets the damage defaults below." />
                </label>
                <div className="toggle-group" role="tablist" aria-label="Photo type">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={kind === "pre"}
                    className={kind === "pre" ? "active" : ""}
                    onClick={() => changePhase("pre")}
                  >
                    Before the damage
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={kind === "post"}
                    className={kind === "post" ? "active" : ""}
                    onClick={() => changePhase("post")}
                  >
                    After the damage
                  </button>
                </div>
              </div>
            </div>

            {scan.notes && <p className="muted-strong" style={{ fontSize: 14, marginTop: 8 }}>{scan.notes}</p>}

            <div className="grid grid-2" style={{ marginTop: 12 }}>
              {drafts.map((d) => {
                const open = expanded.has(d.draft_id);
                return (
                  <div key={d.draft_id} className="card" style={{ margin: 0 }}>
                    <input
                      value={d.name}
                      onChange={(e) => updateDraft(d.draft_id, { name: e.target.value })}
                    />
                    <p className="muted-strong" style={{ fontSize: 13, margin: "6px 0" }}>
                      {d.category} · {d.condition} · {d.approximate_size}
                      {d.visible_brand ? ` · ${d.visible_brand}` : ""} · x{d.count}
                    </p>
                    <div className="row" style={{ fontSize: 13 }}>
                      <span className="badge">{kind === "post" ? d.damage_type : "undamaged"}</span>
                      {kind === "post" && <span className="badge">{d.damage_severity}</span>}
                      <span className="spacer" />
                      <strong>${d.estimated_value}</strong>
                    </div>
                    <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Our estimate: ${d.canadian_retail_estimate_cad.low}–${d.canadian_retail_estimate_cad.high}
                    </p>
                    <div className="row" style={{ marginTop: 8 }}>
                      <button className="secondary" type="button" onClick={() => toggleExpand(d.draft_id)}>
                        {open ? "Done" : "Edit"}
                      </button>
                      <span className="spacer" />
                      <button className="secondary" type="button" onClick={() => dropDraft(d.draft_id)}>
                        Remove
                      </button>
                    </div>

                    {open && (
                      <div className="grid grid-2" style={{ marginTop: 12 }}>
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
                          <label>How bad?</label>
                          <select
                            value={d.damage_severity}
                            onChange={(e) => updateDraft(d.draft_id, { damage_severity: e.target.value })}
                          >
                            {SEVERITIES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label>Replacement value (CAD)</label>
                          <input
                            type="number"
                            value={d.estimated_value}
                            onChange={(e) => updateDraft(d.draft_id, { estimated_value: Number(e.target.value) })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
      {err && <div className="error">{err}</div>}
      {items.length === 0 && <p className="muted-strong">Nothing saved yet.</p>}
      {items.length > 0 && sortBy === "room" ? (
        <RoomGroupedItems items={items} caseId={id ?? ""} rooms={allRooms} onChange={load} />
      ) : items.length > 0 ? (
        <ItemTable items={sortItems(items, sortBy)} caseId={id ?? ""} rooms={allRooms} onChange={load} />
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

function RoomGroupedItems(
  { items, caseId, rooms, onChange }: { items: Item[]; caseId: string; rooms: string[]; onChange: () => void },
) {
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
          <ItemTable items={group} caseId={caseId} rooms={rooms} onChange={onChange} />
        </div>
      ))}
    </>
  );
}

function ItemTable(
  { items, caseId, rooms, onChange }: { items: Item[]; caseId: string; rooms: string[]; onChange: () => void },
) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Item</th>
          <th>Category</th>
          <th>Status</th>
          <th>Severity</th>
          <th>Est. value</th>
          <th>Photos</th>
          <th></th>
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
              <td><ItemPhotos item={it} caseId={caseId} onChange={onChange} /></td>
              <td><ItemActions item={it} caseId={caseId} rooms={rooms} onChange={onChange} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ItemActions(
  { item, caseId, rooms, onChange }: { item: Item; caseId: string; rooms: string[]; onChange: () => void },
) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [newRoom, setNewRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on any outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setMoving(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function reset() {
    setOpen(false);
    setMoving(false);
    setNewRoom("");
  }

  async function moveTo(room: string) {
    const target = room.trim();
    if (!caseId || !target || target === (item.room ?? "")) {
      reset();
      return;
    }
    setBusy(true);
    try {
      await api.updateItem(caseId, item.id, { room: target });
      onChange();
    } finally {
      setBusy(false);
      reset();
    }
  }

  async function remove() {
    if (!caseId) return;
    if (!window.confirm(`Delete "${item.name}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.deleteItem(caseId, item.id);
      onChange();
    } finally {
      setBusy(false);
      reset();
    }
  }

  const otherRooms = rooms.filter((r) => r !== (item.room ?? "").trim());

  return (
    <div ref={ref} style={{ position: "relative", textAlign: "right" }}>
      <button
        className="secondary"
        aria-label="Item actions"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        style={{ padding: "2px 8px", lineHeight: 1 }}
      >
        ⋮
      </button>
      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: "100%", zIndex: 10, marginTop: 4, minWidth: 180,
            background: "var(--card, #fff)", border: "1px solid var(--border, #ddd)",
            borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: 6, textAlign: "left",
          }}
        >
          {!moving ? (
            <>
              <button className="menu-item" style={MENU_ITEM} onClick={() => setMoving(true)}>
                Move to another room…
              </button>
              <button
                className="menu-item"
                style={{ ...MENU_ITEM, color: "var(--danger, #c0392b)" }}
                onClick={remove}
              >
                Delete item
              </button>
            </>
          ) : (
            <div style={{ padding: 4 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Move to…</div>
              {otherRooms.map((r) => (
                <button key={r} className="menu-item" style={MENU_ITEM} disabled={busy} onClick={() => moveTo(r)}>
                  {r}
                </button>
              ))}
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <input
                  value={newRoom}
                  placeholder="New room"
                  onChange={(e) => setNewRoom(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && moveTo(newRoom)}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button disabled={busy || !newRoom.trim()} onClick={() => moveTo(newRoom)}>Move</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MENU_ITEM: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
  padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 14,
};

const PHOTO_SLOTS: [string, "before_url" | "after_url"][] = [
  ["Before", "before_url"],
  ["After", "after_url"],
];

function ItemPhotos({ item, caseId, onChange }: { item: Item; caseId: string; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(key: "before_url" | "after_url", file?: File) {
    if (!file || !caseId) return;
    setBusy(key);
    try {
      const { url } = await api.uploadItemImage(file);
      await api.updateItem(caseId, item.id, { [key]: url });
      onChange();
    } catch {
      // surfaced inline below via title; keep the table resilient
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {PHOTO_SLOTS.map(([label, key]) => {
        const url = item[key];
        return (
          <label key={key} title={label} style={{ cursor: "pointer", textAlign: "center", display: "block" }}>
            {url ? (
              <img src={url} alt={label} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, display: "block" }} />
            ) : (
              <span
                className="muted"
                style={{
                  width: 40, height: 40, borderRadius: 6, border: "1px dashed var(--border, #ccc)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}
              >
                {busy === key ? "…" : "+"}
              </span>
            )}
            <span className="muted" style={{ fontSize: 10 }}>{label}</span>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                upload(key, f);
              }}
            />
          </label>
        );
      })}
    </div>
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
