import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Item, RoomScan, ScannedItem } from "../api";
import { BackButton } from "../components/BackButton";
import { Hint } from "../components/Hint";
import { useToast } from "../components/Toast";
import { useDismissable } from "../lib/useDismissable";

const SEVERITIES = ["minor", "moderate", "severe", "destroyed"];
const DAMAGE_TYPES = ["fire", "smoke", "water", "wind", "mold", "other"];
const CATEGORIES = ["furniture", "appliance", "electronics", "clothing", "other"];

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

// The Gemini scan takes a while; an explained wait feels far shorter than a
// silent one. These rotate while the request is in flight.
const SCAN_STAGES = [
  "Reading your photo…",
  "Identifying the items in it…",
  "Estimating replacement values…",
  "Almost there — putting the list together…",
];

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

// Unsaved drafts survive accidental navigation: one back-swipe used to wipe
// an entire reviewed room scan with no warning.
type PersistedDrafts = {
  scan: RoomScan;
  drafts: Draft[];
  batchRoom: string;
  kind: PrePost;
};

function draftsKey(caseId: string) {
  return `rebuildr.drafts.${caseId}`;
}

function loadPersistedDrafts(caseId: string): PersistedDrafts | null {
  try {
    const raw = localStorage.getItem(draftsKey(caseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDrafts;
    if (!parsed?.drafts?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Inventory() {
  const { id } = useParams();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"none" | "room" | "category" | "status" | "price">("room");

  // Scan + draft-review state.
  const [kind, setKind] = useState<PrePost>("post");
  const [scan, setScan] = useState<RoomScan | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanStage, setScanStage] = useState(0);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [scanEmpty, setScanEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  // Photos picked but not yet scanned — people walk room to room and shoot
  // several at once; we process them one at a time.
  const [queue, setQueue] = useState<File[]>([]);
  // One room label for the whole batch — set once, applied to every item (#4).
  const [batchRoom, setBatchRoom] = useState("");
  // Per-item editing is collapsed by default; expand only what you want (#3/#6).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Default damage type, inferred from the case's disaster type (#1).
  const [defaultDamage, setDefaultDamage] = useState("fire");

  // Manual entry — photos aren't always possible when the photos burned too.
  const [showManual, setShowManual] = useState(false);

  // Items the user has from other cases — offered as "attach to this case"
  // so they don't have to re-enter what they already documented elsewhere.
  const [library, setLibrary] = useState<Item[]>([]);
  const [attaching, setAttaching] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Distinct rooms already in use — offered as move targets in the row menu.
  const allRooms = useMemo(
    () => Array.from(new Set(items.map((i) => i.room?.trim()).filter(Boolean) as string[])).sort(),
    [items],
  );

  const totalValue = useMemo(
    () => items.reduce((sum, it) => sum + (it.estimated_value ?? 0), 0),
    [items],
  );

  function load() {
    if (!id) return;
    api.listItems(id).then((r) => setItems(r.items)).catch((e) => setErr(e.message ?? String(e)));
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

  // Restore any unsaved drafts from a previous visit.
  useEffect(() => {
    if (!id) return;
    const saved = loadPersistedDrafts(id);
    if (saved) {
      setScan(saved.scan);
      setDrafts(saved.drafts);
      setBatchRoom(saved.batchRoom);
      setKind(saved.kind);
      setRestored(true);
    }
  }, [id]);

  // Keep drafts persisted while they exist; clear when they're gone.
  useEffect(() => {
    if (!id) return;
    try {
      if (drafts.length > 0 && scan) {
        localStorage.setItem(draftsKey(id), JSON.stringify({ scan, drafts, batchRoom, kind }));
      } else {
        localStorage.removeItem(draftsKey(id));
      }
    } catch {
      /* best-effort */
    }
  }, [id, drafts, scan, batchRoom, kind]);

  // Rotate the scan-progress message while waiting on Gemini.
  useEffect(() => {
    if (!scanBusy) { setScanStage(0); return; }
    const t = window.setInterval(
      () => setScanStage((s) => Math.min(s + 1, SCAN_STAGES.length - 1)),
      4000,
    );
    return () => window.clearInterval(t);
  }, [scanBusy]);

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

  async function scanFile(file: File) {
    setScanBusy(true);
    setScanErr(null);
    setScanEmpty(false);
    setRestored(false);
    try {
      // Let Gemini decide before/after — the user only corrects it if wrong (#5).
      const result = await api.analyzeRoomPhoto(file, "auto");
      const detected: PrePost = result.detected_phase === "before" ? "pre" : "post";
      if (!result.items || result.items.length === 0) {
        setScanEmpty(true);
        setScan(null);
        setDrafts([]);
        return;
      }
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

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const [first, ...rest] = files;
    if (drafts.length > 0 || scanBusy) {
      // A batch is already in review — queue everything.
      setQueue((q) => [...q, ...files]);
      return;
    }
    if (rest.length > 0) setQueue((q) => [...q, ...rest]);
    scanFile(first);
  }

  function scanNextInQueue() {
    setQueue((q) => {
      if (q.length === 0) return q;
      const [next, ...rest] = q;
      scanFile(next);
      return rest;
    });
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

  function discardBatch() {
    setDrafts([]);
    setScan(null);
    setScanEmpty(false);
    if (queue.length > 0) scanNextInQueue();
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
      const count = drafts.length;
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
      toast.show(`Saved ${count} item${count === 1 ? "" : "s"} to your inventory.`);
      if (queue.length > 0) scanNextInQueue();
    } catch (e: any) {
      setScanErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  // Deleting is immediate but reversible — kinder than a "can't be undone"
  // confirm dialog for shaky hands on a phone.
  async function deleteWithUndo(item: Item) {
    if (!id) return;
    const copy: Partial<Item> = {
      name: item.name,
      category: item.category,
      damage_type: item.damage_type,
      damage_severity: item.damage_severity,
      estimated_value: item.estimated_value,
      description: item.description,
      room: item.room,
      before_url: item.before_url,
      after_url: item.after_url,
    };
    try {
      await api.deleteItem(id, item.id);
      load();
      toast.show(`Deleted "${item.name}".`, {
        actionLabel: "Undo",
        onAction: async () => {
          try {
            await api.createItem(id, copy);
            load();
          } catch (e: any) {
            setErr(e.message ?? String(e));
          }
        },
      });
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  function exportCsv() {
    const header = ["Name", "Room", "Category", "Damage type", "Severity", "Estimated value (CAD)", "Description"];
    const rows = items.map((it) => [
      it.name, it.room ?? "", it.category ?? "", it.damage_type ?? "",
      it.damage_severity ?? "", it.estimated_value ?? "", it.description ?? "",
    ]);
    // ﻿ byte-order mark so Excel opens the file with correct encoding.
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rebuildr-inventory.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container">
      <BackButton to={id ? `/cases/${id}/recommendations` : "/dashboard"} label="Your plan" />
      <div className="row" style={{ marginTop: 16 }}>
        <h1 style={{ margin: 0 }}>What you lost</h1>
        <span className="spacer" />
        <Link to={`/cases/${id}/recommendations`} className="no-print">
          <button>See your plan →</button>
        </Link>
      </div>
      <p className="warm-note" style={{ marginTop: 8 }}>
        Snap a photo of one room at a time — we'll list what we see, guess
        whether it's a before- or after-damage photo, and fill in the rest. You
        only review what you want before saving. No photos? You can add items
        by hand below.
      </p>

      <div className="card no-print">
        <h3 style={{ marginTop: 0 }}>Scan a room from a photo</h3>
        <p className="muted-strong" style={{ marginTop: 0, fontSize: 14 }}>
          We'll list what's in the photo with rough replacement prices.
          Nothing is saved until you say so.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="big" disabled={scanBusy} onClick={() => cameraRef.current?.click()}>
            Take a photo
          </button>
          <button type="button" className="secondary big" disabled={scanBusy} onClick={() => galleryRef.current?.click()}>
            Choose from gallery
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={onPickPhotos}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={onPickPhotos}
        />
        {queue.length > 0 && (
          <p className="muted-strong" style={{ marginTop: 8, fontSize: 14 }}>
            {queue.length} more photo{queue.length === 1 ? "" : "s"} waiting — we'll
            scan the next one after you finish this batch.
          </p>
        )}
        {scanBusy && (
          <p className="muted-strong" style={{ marginTop: 8 }} role="status">
            {SCAN_STAGES[scanStage]}{" "}
            <span className="muted" style={{ fontSize: 13 }}>
              This can take up to half a minute — keep this page open.
            </span>
          </p>
        )}
        {scanErr && (
          <div className="error">
            <span>{scanErr}</span>{" "}
            <button className="secondary" style={{ marginLeft: 8 }} onClick={() => setScanErr(null)}>
              Dismiss
            </button>
          </div>
        )}
        {scanEmpty && (
          <div className="notice" style={{ marginTop: 10 }}>
            <strong>We couldn't pick out items in that photo.</strong>
            <span className="muted-strong" style={{ display: "block", marginTop: 4 }}>
              Try a wider shot of the room with more light, or add the items by
              hand below — that works just as well.
            </span>
          </div>
        )}
        {restored && drafts.length > 0 && (
          <div className="notice" style={{ marginTop: 10 }}>
            <strong>We kept the items from your last photo.</strong>
            <span className="muted-strong" style={{ display: "block", marginTop: 4 }}>
              Pick up where you left off — review them and save when ready.
            </span>
          </div>
        )}

        {scan && drafts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="row">
              <strong>{scan.room_type}</strong>
              <span className="badge">{drafts.length} items</span>
              <span className="badge">{kind === "pre" ? "Before" : "After"}</span>
              <span className="spacer" />
              <button className="secondary" onClick={discardBatch} disabled={busy}>
                Discard
              </button>
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
                const est = d.canadian_retail_estimate_cad ?? { low: 0, high: 0 };
                return (
                  <div key={d.draft_id} className="card" style={{ margin: 0 }}>
                    <input
                      value={d.name}
                      aria-label="Item name"
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
                    <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      Our estimate: ${est.low}–${est.high}
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
                            min={0}
                            value={Number.isFinite(d.estimated_value) ? d.estimated_value : 0}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              updateDraft(d.draft_id, {
                                estimated_value: Number.isFinite(n) && n >= 0 ? Math.round(n) : 0,
                              });
                            }}
                          />
                          <div className="row" style={{ gap: 6, marginTop: 6 }}>
                            <button
                              type="button"
                              className="secondary chip-btn"
                              onClick={() => updateDraft(d.draft_id, { estimated_value: est.low })}
                            >
                              Low ${est.low}
                            </button>
                            <button
                              type="button"
                              className="secondary chip-btn"
                              onClick={() => updateDraft(d.draft_id, { estimated_value: est.high })}
                            >
                              High ${est.high}
                            </button>
                          </div>
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

      <div className="card no-print">
        <div className="row" style={{ alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Add an item by hand</h3>
          <span className="spacer" />
          <button className="secondary" onClick={() => setShowManual((v) => !v)}>
            {showManual ? "Close" : "Add an item"}
          </button>
        </div>
        <p className="muted-strong" style={{ margin: "6px 0 0", fontSize: 14 }}>
          For things you can't photograph — items that were destroyed, or
          things you remember but can't see anymore. Only the name is required.
        </p>
        {showManual && id && (
          <ManualItemForm
            caseId={id}
            rooms={allRooms}
            defaultDamage={defaultDamage}
            onAdded={() => { load(); toast.show("Item added to your inventory."); }}
          />
        )}
      </div>

      {library.length > 0 && (
        <div className="card no-print">
          <h3 style={{ marginTop: 0 }}>
            From your library
            <span className="badge" style={{ marginLeft: 8 }}>{library.length}</span>
          </h3>
          <p className="muted-strong" style={{ marginTop: 0, fontSize: 14 }}>
            Items you've already documented in other cases. Add any that
            apply here too — no need to re-enter them.
          </p>
          <table className="tbl tbl-cards">
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
                  <td data-label="Item">
                    <strong>{it.name}</strong>
                    {it.category && <span className="badge" style={{ marginLeft: 8 }}>{it.category}</span>}
                  </td>
                  <td data-label="Room">{it.room || <span className="muted">—</span>}</td>
                  <td data-label="Value">{it.estimated_value ? `$${it.estimated_value}` : <span className="muted">—</span>}</td>
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

      {items.length > 0 && (
        <div className="card total-card">
          <div className="row" style={{ alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 18 }}>
                Total documented: ${totalValue.toLocaleString()}
              </strong>
              <span className="muted-strong" style={{ display: "block", fontSize: 13 }}>
                across {items.length} item{items.length === 1 ? "" : "s"} — this is
                the number your insurer will want.
              </span>
            </div>
            <span className="spacer" />
            <button className="secondary no-print" onClick={exportCsv}>Export CSV</button>
            <button className="secondary no-print" onClick={() => window.print()}>
              Print or save as PDF
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <h3 style={{ margin: 0 }}>Saved items ({items.length})</h3>
        <span className="spacer" />
        {items.length > 0 && (
          <>
            <label style={{ margin: 0 }} htmlFor="inv-sort">Sort by</label>
            <select
              id="inv-sort"
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
        <RoomGroupedItems items={items} caseId={id ?? ""} rooms={allRooms} onChange={load} onDelete={deleteWithUndo} />
      ) : items.length > 0 ? (
        <ItemTable items={sortItems(items, sortBy)} caseId={id ?? ""} rooms={allRooms} onChange={load} onDelete={deleteWithUndo} />
      ) : null}

      {items.length > 0 && (
        <div className="row no-print" style={{ marginTop: 24 }}>
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

function ManualItemForm({
  caseId,
  rooms,
  defaultDamage,
  onAdded,
}: {
  caseId: string;
  rooms: string[];
  defaultDamage: string;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    room: "",
    category: "other",
    damage_type: defaultDamage,
    damage_severity: "moderate",
    estimated_value: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const value = Number(form.estimated_value);
      await api.createItem(caseId, {
        name: form.name.trim(),
        room: form.room.trim() || undefined,
        category: form.category,
        damage_type: form.damage_type,
        damage_severity: form.damage_severity,
        estimated_value: Number.isFinite(value) && value > 0 ? Math.round(value) : undefined,
      });
      setForm((f) => ({ ...f, name: "", estimated_value: "" }));
      onAdded();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 12 }}>
      <div className="grid grid-2">
        <div>
          <label htmlFor="manual-name">What is it?</label>
          <input
            id="manual-name"
            value={form.name}
            placeholder="e.g. Couch, TV, winter coats"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="manual-room">Which room? (optional)</label>
          <input
            id="manual-room"
            value={form.room}
            list="manual-rooms"
            placeholder="e.g. Living room"
            onChange={(e) => setForm({ ...form, room: e.target.value })}
          />
          <datalist id="manual-rooms">
            {rooms.map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="manual-category">Category</label>
          <select
            id="manual-category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="manual-value">Rough value in CAD (optional)</label>
          <input
            id="manual-value"
            type="number"
            min={0}
            value={form.estimated_value}
            placeholder="Your best guess is fine"
            onChange={(e) => setForm({ ...form, estimated_value: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="manual-damage">Damage type</label>
          <select
            id="manual-damage"
            value={form.damage_type}
            onChange={(e) => setForm({ ...form, damage_type: e.target.value })}
          >
            {DAMAGE_TYPES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="manual-severity">How bad?</label>
          <select
            id="manual-severity"
            value={form.damage_severity}
            onChange={(e) => setForm({ ...form, damage_severity: e.target.value })}
          >
            {SEVERITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={busy || !form.name.trim()}>
          {busy ? "Adding…" : "Add item"}
        </button>
      </div>
    </form>
  );
}

function RoomGroupedItems(
  { items, caseId, rooms, onChange, onDelete }:
  { items: Item[]; caseId: string; rooms: string[]; onChange: () => void; onDelete: (it: Item) => void },
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
          <ItemTable items={group} caseId={caseId} rooms={rooms} onChange={onChange} onDelete={onDelete} />
        </div>
      ))}
    </>
  );
}

function ItemTable(
  { items, caseId, rooms, onChange, onDelete }:
  { items: Item[]; caseId: string; rooms: string[]; onChange: () => void; onDelete: (it: Item) => void },
) {
  return (
    <table className="tbl tbl-cards">
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
              <td data-label="Item">
                <strong>{it.name}</strong>
                {it.description && <div className="muted" style={{ fontSize: 13 }}>{it.description}</div>}
              </td>
              <td data-label="Category">{it.category ?? <span className="muted">—</span>}</td>
              <td data-label="Status">
                {status === "damaged" && <span className="status-damaged">Damaged</span>}
                {status === "salvageable" && <span className="status-salvageable">Salvageable</span>}
                {status === "unknown" && <span className="muted">—</span>}
              </td>
              <td data-label="Severity">{it.damage_severity ? <span className="badge">{it.damage_severity}</span> : <span className="muted">—</span>}</td>
              <td data-label="Est. value">{it.estimated_value ? `$${it.estimated_value}` : <span className="muted">—</span>}</td>
              <td data-label="Photos"><ItemPhotos item={it} caseId={caseId} onChange={onChange} /></td>
              <td className="actions"><ItemActions item={it} caseId={caseId} rooms={rooms} onChange={onChange} onDelete={onDelete} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ItemActions(
  { item, caseId, rooms, onChange, onDelete }:
  { item: Item; caseId: string; rooms: string[]; onChange: () => void; onDelete: (it: Item) => void },
) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [newRoom, setNewRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDismissable(ref, open, () => { setOpen(false); setMoving(false); });

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

  const otherRooms = rooms.filter((r) => r !== (item.room ?? "").trim());

  return (
    <div ref={ref} style={{ position: "relative", textAlign: "right" }}>
      <button
        className="secondary"
        aria-label={`Actions for ${item.name}`}
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        style={{ padding: "2px 8px", lineHeight: 1 }}
      >
        ⋮
      </button>
      {open && (
        <div className="row-menu">
          {!moving ? (
            <>
              <button className="menu-item" style={MENU_ITEM} onClick={() => setMoving(true)}>
                Move to another room…
              </button>
              <button
                className="menu-item"
                style={{ ...MENU_ITEM, color: "var(--danger)" }}
                onClick={() => { reset(); onDelete(item); }}
              >
                Delete item
              </button>
            </>
          ) : (
            <div style={{ padding: 4 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Move to…</div>
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
  const [err, setErr] = useState<string | null>(null);

  async function upload(key: "before_url" | "after_url", file?: File) {
    if (!file || !caseId) return;
    setBusy(key);
    setErr(null);
    try {
      const { url } = await api.uploadItemImage(file);
      await api.updateItem(caseId, item.id, { [key]: url });
      onChange();
    } catch (e: any) {
      setErr(e.message ?? "The photo didn't upload. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        {PHOTO_SLOTS.map(([label, key]) => {
          const url = item[key];
          return (
            <label key={key} title={`${label} photo`} style={{ cursor: "pointer", textAlign: "center", display: "block" }}>
              {url ? (
                <img src={url} alt={`${label} photo of ${item.name}`} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, display: "block" }} />
              ) : (
                <span
                  className="muted"
                  style={{
                    width: 40, height: 40, borderRadius: 6, border: "1px dashed var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                  }}
                >
                  {busy === key ? "…" : "+"}
                </span>
              )}
              <span className="muted" style={{ fontSize: 11 }}>{label}</span>
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
      {err && <div className="muted" style={{ fontSize: 11, color: "var(--danger)" }}>{err}</div>}
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
