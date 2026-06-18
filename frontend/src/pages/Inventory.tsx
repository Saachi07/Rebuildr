import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ClaimClass, Item, RoomScan, Salvageable, ScannedItem } from "../api";
import { BackButton } from "../components/BackButton";
import { Hint } from "../components/Hint";
import { useToast } from "../components/Toast";
import { useDismissable } from "../lib/useDismissable";
import { depreciatedValue } from "../lib/depreciation";

const DAMAGE_TYPES = ["fire", "smoke", "water", "wind", "mold", "other"];
const CATEGORIES = ["furniture", "appliance", "electronics", "clothing", "other"];

// Friendly, human label for an item's claim class. Building items are usually
// claimed under dwelling coverage, not personal-property (contents) coverage,
// so we say so plainly rather than showing a raw enum value.
export function claimClassLabel(c?: ClaimClass | null): string | null {
  switch (c) {
    case "contents":
      return "Contents";
    case "building":
      return "Part of the building";
    case "unclear":
      return "Unclear";
    default:
      return null;
  }
}

// Calm, never-a-promise label for whether a damaged item might be salvaged.
export function salvageableLabel(s?: Salvageable | null): string | null {
  switch (s) {
    case "likely":
      return "May be salvageable";
    case "unlikely":
      return "Likely a loss";
    case "needs_professional_assessment":
      return "Needs a professional look";
    default:
      return null;
  }
}

// A contents claim should only include personal property, not fixtures like
// flooring or wallpaper. We compute the contents-only subtotal so survivors do
// not unknowingly overstate a contents claim, and report whether any building
// items are mixed in (which changes how we present the totals).
export function contentsBreakdown(items: { estimated_value?: number; claim_class?: ClaimClass | null }[]) {
  let contents = 0;
  let total = 0;
  let buildingPresent = false;
  for (const it of items) {
    const v = it.estimated_value ?? 0;
    total += v;
    if (it.claim_class === "building") {
      buildingPresent = true;
    } else {
      // contents and unclear both count toward the contents estimate
      contents += v;
    }
  }
  return { contents, total, buildingPresent };
}

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
  "Reading your photo...",
  "Identifying the items in it...",
  "Estimating replacement values...",
  "Almost there, putting the list together...",
];

type PrePost = "pre" | "post";

type SortBy = "none" | "room" | "category" | "price";

type Draft = ScannedItem & {
  draft_id: string;
  damage_type: string;
  estimated_value: number;
  purchase_date: string;
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
    estimated_value: midPrice(s),
    purchase_date: "",
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

// Per-case personal-property coverage limit, stored on the device. Written
// either by the user (in the HUD) or by the document panel's "Activate claim
// limits" step, which saves the verified Coverage C amount under this key.
function coverageKey(caseId: string) {
  return `rebuildr.coverageLimit.${caseId}`;
}

function loadCoverageLimit(caseId: string): number | null {
  try {
    const raw = localStorage.getItem(coverageKey(caseId));
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
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
  const [sortBy, setSortBy] = useState<SortBy>("room");
  // Saved items can be read as a list (claim-report friendly) or a board of
  // room columns (spatial, matches how people remember a home). The board is
  // the default for the visual, room-by-room mental model.
  const [view, setView] = useState<"list" | "board">("board");
  // When adding an item straight from a board column, the manual form opens
  // with that room prefilled.
  const [presetRoom, setPresetRoom] = useState<string>("");
  const manualRef = useRef<HTMLDivElement>(null);
  // The personal-property (Coverage C) limit powers the HUD progress bar. It's
  // the destination of the document "Activate claim limits" bridge; the user
  // can also set or correct it here, and it persists per case on this device.
  const [coverageLimit, setCoverageLimit] = useState<number | null>(null);

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
  // Photos picked but not yet scanned, people walk room to room and shoot
  // several at once; we process them one at a time.
  const [queue, setQueue] = useState<File[]>([]);
  // One room label for the whole batch, set once, applied to every item (#4).
  const [batchRoom, setBatchRoom] = useState("");
  // Per-item editing is collapsed by default; expand only what you want (#3/#6).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Default damage type, inferred from the case's disaster type (#1).
  const [defaultDamage, setDefaultDamage] = useState("fire");

  const [scannedFile, setScannedFile] = useState<File | null>(null);

  // Manual entry, photos aren't always possible when the photos burned too.
  const [showManual, setShowManual] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Distinct rooms already in use, offered as move targets in the row menu.
  const allRooms = useMemo(
    () => Array.from(new Set(items.map((i) => i.room?.trim()).filter(Boolean) as string[])).sort(),
    [items],
  );

  const totalValue = useMemo(
    () => items.reduce((sum, it) => sum + (it.estimated_value ?? 0), 0),
    [items],
  );

  // Estimated depreciated (actual cash value) total. Items with a purchase date
  // are depreciated; items without one count at full replacement cost, since we
  // can't depreciate an unknown age. We track whether any were dated so the UI
  // can explain the number honestly.
  const { depreciatedTotal, anyDated } = useMemo(() => {
    let total = 0;
    let dated = false;
    for (const it of items) {
      const rcv = it.estimated_value ?? 0;
      const acv = depreciatedValue(rcv, it.category, it.purchase_date);
      if (acv != null) dated = true;
      total += acv ?? rcv;
    }
    return { depreciatedTotal: total, anyDated: dated };
  }, [items]);

  // The inventory is the home's, not a single event's: one home accumulates
  // items across every disaster it goes through, so we load everything the
  // user owns and show it in every case. No "attach to this case" step.
  function load() {
    api.listMyItems().then((r) => setItems(r.items)).catch((e) => setErr(e.message ?? String(e)));
  }

  useEffect(load, [id]);

  // Fetch the case once to seed the default damage type for scanned items.
  useEffect(() => {
    if (!id) return;
    api.getCase(id)
      .then((r) => setDefaultDamage(DISASTER_TO_DAMAGE[r.case.disaster_type] ?? "other"))
      .catch(() => {});
  }, [id]);

  // Load the saved coverage limit for this case (set here or by the document
  // panel's "Activate claim limits" step).
  useEffect(() => {
    if (!id) { setCoverageLimit(null); return; }
    setCoverageLimit(loadCoverageLimit(id));
  }, [id]);

  function updateCoverageLimit(next: number | null) {
    setCoverageLimit(next);
    if (!id) return;
    try {
      if (next && next > 0) localStorage.setItem(coverageKey(id), String(Math.round(next)));
      else localStorage.removeItem(coverageKey(id));
    } catch {
      /* best-effort */
    }
  }

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

  async function scanFile(file: File) {
    setScannedFile(file);
    setScanBusy(true);
    setScanErr(null);
    setScanEmpty(false);
    setRestored(false);
    try {
      // Let Gemini decide before/after, the user only corrects it if wrong (#5).
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
      // A batch is already in review, queue everything.
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
    setScannedFile(null);
    if (queue.length > 0) scanNextInQueue();
  }

  function toggleExpand(draft_id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(draft_id) ? next.delete(draft_id) : next.add(draft_id);
      return next;
    });
  }

  async function cropAndUpload(
    file: File,
    bbox: { x1: number; y1: number; x2: number; y2: number },
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const sx = bbox.x1 * w;
        const sy = bbox.y1 * h;
        const sw = (bbox.x2 - bbox.x1) * w;
        const sh = (bbox.y2 - bbox.y1) * h;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sw));
        canvas.height = Math.max(1, Math.round(sh));
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas unavailable")); return; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) { reject(new Error("canvas toBlob failed")); return; }
          const cropped = new File([blob], "crop.jpg", { type: "image/jpeg" });
          try {
            const { url } = await api.uploadItemImage(cropped);
            resolve(url);
          } catch (e) {
            reject(e);
          }
        }, "image/jpeg", 0.85);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("image failed to load for crop"));
      };
      img.src = objectUrl;
    });
  }

  async function saveAllDrafts() {
    if (!id || drafts.length === 0) return;
    setBusy(true);
    setScanErr(null);
    try {
      const count = drafts.length;
      const imageKey = kind === "pre" ? "before_url" : "after_url";

      // Crop + upload in parallel for every draft that has a bounding box.
      // Promise.allSettled so a single failed crop never aborts the whole save.
      const urlMap = new Map<string, string>();
      if (scannedFile) {
        const targets = drafts.filter((d) => d.bounding_box);
        const results = await Promise.allSettled(
          targets.map((d) =>
            cropAndUpload(scannedFile, d.bounding_box!).then((url) => ({
              draft_id: d.draft_id,
              url,
            })),
          ),
        );
        for (const r of results) {
          if (r.status === "fulfilled") urlMap.set(r.value.draft_id, r.value.url);
        }
      }

      await api.createItemsBulk(
        id,
        drafts.map((d) => ({
          name: d.name,
          category: mapCategory(d.category),
          damage_type: d.damage_type,
          estimated_value: d.estimated_value,
          purchase_date: d.purchase_date || undefined,
          description: [d.visible_brand, d.approximate_size, `x${d.count}`]
            .filter(Boolean)
            .join(" · "),
          room: batchRoom,
          ...(urlMap.has(d.draft_id) ? { [imageKey]: urlMap.get(d.draft_id) } : {}),
        })),
      );
      setDrafts([]);
      setScan(null);
      setScannedFile(null);
      load();
      toast.show(`Saved ${count} item${count === 1 ? "" : "s"} to your inventory.`);
      if (queue.length > 0) scanNextInQueue();
    } catch (e: any) {
      setScanErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  // Deleting is immediate but reversible, kinder than a "can't be undone"
  // confirm dialog for shaky hands on a phone.
  async function deleteWithUndo(item: Item) {
    if (!id) return;
    const copy: Partial<Item> = {
      name: item.name,
      category: item.category,
      damage_type: item.damage_type,
      estimated_value: item.estimated_value,
      description: item.description,
      room: item.room,
      before_url: item.before_url,
      after_url: item.after_url,
      receipts: item.receipts,
    };
    try {
      await api.deleteMyItem(item.id);
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

  // Move an item to another room (board drag-and-drop). Optimistic: the card
  // jumps columns immediately, then we persist; a failure reloads the truth.
  async function moveItemToRoom(itemId: string, room: string) {
    const target = room.trim();
    const item = items.find((i) => i.id === itemId);
    if (!item || (item.room ?? "") === target) return;
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, room: target } : i)));
    try {
      await api.updateMyItem(itemId, { room: target });
    } catch (e: any) {
      setErr(e.message ?? String(e));
      load();
    }
  }

  // Add an item straight into a board column: prefill the room and reveal the
  // manual form, scrolling it into view so the connection is obvious.
  function addToRoom(room: string) {
    setPresetRoom(room === "Other" ? "" : room);
    setShowManual(true);
    requestAnimationFrame(() => manualRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function exportCsv() {
    const header = ["Name", "Room", "Category", "Damage type", "Estimated value (CAD)", "Description"];
    const rows = items.map((it) => [
      it.name, it.room ?? "", it.category ?? "", it.damage_type ?? "",
      it.estimated_value ?? "", it.description ?? "",
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
      <p className="warm-note no-print" style={{ marginTop: 8 }}>
        Snap a photo of one room at a time, we'll list what we see, guess
        whether it's a before- or after-damage photo, and fill in the rest. You
        only review what you want before saving. No photos? You can add items
        by hand below.
      </p>

      <div className="print-only" style={{ marginTop: 8 }}>
        <h2 style={{ margin: "0 0 4px" }}>Home inventory report</h2>
        <p style={{ margin: 0 }}>
          Prepared with Rebuildr. {items.length} item{items.length === 1 ? "" : "s"} documented.
        </p>
      </div>

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
            {queue.length} more photo{queue.length === 1 ? "" : "s"} waiting, we'll
            scan the next one after you finish this batch.
          </p>
        )}
        {scanBusy && (
          <p className="muted-strong" style={{ marginTop: 8 }} role="status">
            {SCAN_STAGES[scanStage]}{" "}
            <span className="muted" style={{ fontSize: 13 }}>
              This can take up to half a minute, keep this page open.
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
              hand below, that works just as well.
            </span>
          </div>
        )}
        {restored && drafts.length > 0 && (
          <div className="notice" style={{ marginTop: 10 }}>
            <strong>We kept the items from your last photo.</strong>
            <span className="muted-strong" style={{ display: "block", marginTop: 4 }}>
              Pick up where you left off, review them and save when ready.
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
              <button className="ghost" onClick={discardBatch} disabled={busy}>
                Discard
              </button>
              <button onClick={saveAllDrafts} disabled={busy}>
                {busy ? "Saving..." : `Looks good, save all ${drafts.length}`}
              </button>
            </div>

            <div className="grid grid-2" style={{ marginTop: 12 }}>
              <div>
                <label>
                  Room{" "}
                  <Hint text="We guessed this from the photo. Pick one of your existing rooms or type a new name; it applies to every item in this batch." />
                </label>
                <input
                  value={batchRoom}
                  list="batch-rooms"
                  placeholder="e.g. Living room"
                  onChange={(e) => setBatchRoom(e.target.value)}
                />
                <datalist id="batch-rooms">
                  {allRooms.map((r) => <option key={r} value={r} />)}
                </datalist>
              </div>
              <div>
                <label>
                  Before or after the damage?{" "}
                  <Hint text="We guessed from the photo, change it if we got it wrong. This sets the damage defaults below." />
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

            <DraftEstimate drafts={drafts} scan={scan} />

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
                      <ClaimClassBadge claimClass={d.claim_class} />
                      <span className="spacer" />
                      <strong>${d.estimated_value}</strong>
                    </div>
                    {d.claim_note && (
                      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{d.claim_note}</p>
                    )}
                    {kind === "post" && d.salvageable && (
                      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        <span className="badge" style={{ marginRight: 6 }}>{salvageableLabel(d.salvageable)}</span>
                        {d.salvage_note}
                      </p>
                    )}
                    <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      Our estimate: ${est.low}-${est.high}
                    </p>
                    {(() => {
                      const acv = depreciatedValue(d.estimated_value, d.category, d.purchase_date);
                      return acv != null ? (
                        <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          Replacement ${d.estimated_value.toLocaleString()} · depreciated payout ~${acv.toLocaleString()}
                        </p>
                      ) : null;
                    })()}
                    <div className="row" style={{ marginTop: 10 }}>
                      <button className="link-btn" type="button" onClick={() => toggleExpand(d.draft_id)}>
                        {open ? "Hide details" : "Edit details"}
                      </button>
                      <span className="spacer" />
                      <button
                        className="link-btn"
                        type="button"
                        style={{ color: "var(--danger-text)" }}
                        onClick={() => dropDraft(d.draft_id)}
                      >
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
                        <div>
                          <label>When did you buy it? (optional)</label>
                          <input
                            type="date"
                            value={d.purchase_date}
                            max={new Date().toISOString().slice(0, 10)}
                            onChange={(e) => updateDraft(d.draft_id, { purchase_date: e.target.value })}
                          />
                          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            Lets us estimate the depreciated value your insurer may pay.
                          </p>
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

      <div className="card no-print" ref={manualRef}>
        <div className="row" style={{ alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Add an item by hand</h3>
          <span className="spacer" />
          <button className="secondary" onClick={() => setShowManual((v) => !v)}>
            {showManual ? "Close" : "Add an item"}
          </button>
        </div>
        <p className="muted-strong" style={{ margin: "6px 0 0", fontSize: 14 }}>
          For things you can't photograph, items that were destroyed, or
          things you remember but can't see anymore. Only the name is required.
        </p>
        {showManual && id && (
          <ManualItemForm
            key={presetRoom || "manual"}
            caseId={id}
            rooms={allRooms}
            defaultDamage={defaultDamage}
            presetRoom={presetRoom}
            onAdded={() => { load(); toast.show("Item added to your inventory."); }}
          />
        )}
      </div>

      {items.length > 0 && (
        <div className="card total-card">
          <div className="row" style={{ alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 18 }}>
                Replacement value: ${totalValue.toLocaleString()}
              </strong>
              <span className="muted-strong" style={{ display: "block", fontSize: 13 }}>
                across {items.length} item{items.length === 1 ? "" : "s"}, what it
                costs to buy everything new today.
              </span>
              {anyDated && (
                <span className="muted-strong" style={{ display: "block", fontSize: 13, marginTop: 6 }}>
                  Estimated depreciated value: ${depreciatedTotal.toLocaleString()}.
                  Insurers often pay this lower amount first and the rest once you
                  replace the item. Add purchase dates to sharpen the estimate.
                </span>
              )}
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
            <div className="toggle-group no-print" role="tablist" aria-label="How to view your items">
              <button
                type="button"
                role="tab"
                aria-selected={view === "board"}
                className={view === "board" ? "active" : ""}
                onClick={() => setView("board")}
              >
                Board
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "list"}
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
              >
                List
              </button>
            </div>
            {view === "list" && (
              <>
                <label style={{ margin: 0 }} htmlFor="inv-sort">Sort by</label>
                <select
                  id="inv-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  style={{ width: "auto" }}
                >
                  <option value="room">Room</option>
                  <option value="none">When added</option>
                  <option value="category">Category</option>
                  <option value="price">Value (high to low)</option>
                </select>
              </>
            )}
          </>
        )}
      </div>
      {err && <div className="error">{err}</div>}
      {items.length === 0 && <p className="muted-strong">Nothing saved yet.</p>}
      {items.length > 0 && view === "board" ? (
        <>
          <InventoryHud
            total={totalValue}
            limit={coverageLimit}
            onSetLimit={updateCoverageLimit}
            onExport={() => window.print()}
          />
          <RoomBoard
            items={items}
            rooms={allRooms}
            onMove={moveItemToRoom}
            onAddToRoom={addToRoom}
            onDelete={deleteWithUndo}
          />
        </>
      ) : items.length > 0 && sortBy === "room" ? (
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
  presetRoom,
  onAdded,
}: {
  caseId: string;
  rooms: string[];
  defaultDamage: string;
  presetRoom?: string;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    room: presetRoom ?? "",
    category: "other",
    damage_type: defaultDamage,
    estimated_value: "",
    purchase_date: "",
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
        estimated_value: Number.isFinite(value) && value > 0 ? Math.round(value) : undefined,
        purchase_date: form.purchase_date || undefined,
      });
      setForm((f) => ({ ...f, name: "", estimated_value: "", purchase_date: "" }));
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
          <label htmlFor="manual-purchased">When did you buy it? (optional)</label>
          <input
            id="manual-purchased"
            type="date"
            value={form.purchase_date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
          />
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={busy || !form.name.trim()}>
          {busy ? "Adding..." : "Add item"}
        </button>
      </div>
    </form>
  );
}

// Sticky heads-up display over the board: total claim value, progress toward
// the personal-property coverage limit, and the proof-of-loss export. Kept to
// a few numbers on purpose so it never competes with the board for attention.
function InventoryHud({
  total,
  limit,
  onSetLimit,
  onExport,
}: {
  total: number;
  limit: number | null;
  onSetLimit: (n: number | null) => void;
  onExport: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const pct = limit && limit > 0 ? Math.min(100, Math.round((total / limit) * 100)) : 0;
  const over = limit != null && total > limit;

  function save() {
    const n = Number(draft);
    onSetLimit(Number.isFinite(n) && n > 0 ? Math.round(n) : null);
    setEditing(false);
  }

  return (
    <div className="inv-hud">
      <div className="inv-hud-figure">
        <span className="inv-hud-label">Total claim value</span>
        <span className="inv-hud-total">${total.toLocaleString()}</span>
      </div>

      <div className="inv-hud-coverage">
        {editing ? (
          <div className="row" style={{ gap: 8 }}>
            <input
              type="number"
              min={0}
              autoFocus
              value={draft}
              placeholder="e.g. 100000"
              aria-label="Personal property coverage limit (CAD)"
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
              onChange={(e) => setDraft(e.target.value)}
              style={{ maxWidth: 160 }}
            />
            <button className="chip-btn" type="button" onClick={save}>Save</button>
            <button className="chip-btn secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : limit ? (
          <>
            <div className="row" style={{ alignItems: "baseline" }}>
              <span className="inv-hud-label">
                {over ? "Over your contents limit" : "Of your contents limit"}
              </span>
              <span className="spacer" />
              <span className="muted-strong" style={{ fontSize: 13 }}>
                ${total.toLocaleString()} / ${limit.toLocaleString()} ({pct}%)
              </span>
            </div>
            <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="meter-fill" style={{ width: `${pct}%`, background: over ? "var(--danger)" : undefined }} />
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              {over && (
                <span className="muted-strong" style={{ fontSize: 12, color: "var(--danger-text)" }}>
                  You've logged more than this coverage pays. Worth reviewing with your adjuster.
                </span>
              )}
              <span className="spacer" />
              <button className="link-btn" type="button" onClick={() => { setDraft(String(limit)); setEditing(true); }}>
                Change limit
              </button>
            </div>
          </>
        ) : (
          <button className="link-btn" type="button" onClick={() => { setDraft(""); setEditing(true); }}>
            Set your personal-property limit to track progress
          </button>
        )}
      </div>

      <button type="button" className="secondary no-print inv-hud-export" onClick={onExport}>
        Generate proof of loss
      </button>
    </div>
  );
}

// Kanban-style board: one column per physical room, matching how people
// remember a home. Items are cards inside their room; drag a card to another
// column to move it (the List view stays for keyboard/mobile and printing).
function RoomBoard({
  items,
  rooms,
  onMove,
  onAddToRoom,
  onDelete,
}: {
  items: Item[];
  rooms: string[];
  onMove: (itemId: string, room: string) => void;
  onAddToRoom: (room: string) => void;
  onDelete: (it: Item) => void;
}) {
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const key = it.room?.trim() || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  // Make sure every known room shows a column even if it's currently empty,
  // so there's always somewhere to drop an item.
  for (const r of rooms) if (r && !groups.has(r)) groups.set(r, []);
  // Named rooms first (alphabetical); the catch-all "Other" column last.
  const ordered = Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });
  return (
    <div className="room-board no-print">
      {ordered.map(([room, group]) => (
        <BoardColumn key={room} room={room} items={group} onMove={onMove} onAddToRoom={onAddToRoom} onDelete={onDelete} />
      ))}
    </div>
  );
}

function BoardColumn({
  room,
  items,
  onMove,
  onAddToRoom,
  onDelete,
}: {
  room: string;
  items: Item[];
  onMove: (itemId: string, room: string) => void;
  onAddToRoom: (room: string) => void;
  onDelete: (it: Item) => void;
}) {
  const [over, setOver] = useState(false);
  const total = items.reduce((s, it) => s + (it.estimated_value ?? 0), 0);
  // The "Other" column means "no room set", so dropping there clears the room.
  const roomValue = room === "Other" ? "" : room;
  return (
    <section
      className={`board-col${over ? " drag-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onMove(id, roomValue);
      }}
    >
      <header className="board-col-head">
        <span className="board-col-name">{room}</span>
        <span className="badge">{items.length}</span>
        <span className="spacer" />
        <span className="muted-strong board-col-total">${total.toLocaleString()}</span>
      </header>
      <div className="board-col-body">
        {items.length === 0 ? (
          <p className="muted board-col-empty">Drop items here, or add one below.</p>
        ) : (
          items.map((it) => <BoardCard key={it.id} item={it} onDelete={onDelete} />)
        )}
      </div>
      <button type="button" className="board-add" onClick={() => onAddToRoom(room)}>
        + Add item
      </button>
    </section>
  );
}

// What still needs doing for a claim-ready item: a photo and a receipt. The
// badge tells the user at a glance, so they can chase down what's missing.
function itemStatus(item: Item): { label: string; cls: string } {
  const hasPhoto = !!(item.before_url || item.after_url);
  const hasReceipt = !!item.receipts;
  if (hasPhoto && hasReceipt) return { label: "Complete", cls: "status-salvageable" };
  if (!hasPhoto) return { label: "Photo needed", cls: "chip-warn" };
  return { label: "Receipt needed", cls: "chip-warn" };
}

function BoardCard({ item, onDelete }: { item: Item; onDelete: (it: Item) => void }) {
  const thumb = item.before_url || item.after_url;
  const status = itemStatus(item);
  return (
    <article
      className="board-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="board-card-main">
        {thumb && <img className="board-card-thumb" src={thumb} alt="" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong className="board-card-name">{item.name}</strong>
          <div className="board-card-meta">
            <span className={`chip ${status.cls}`}>{status.label}</span>
            {item.category && <span className="badge">{item.category}</span>}
          </div>
        </div>
      </div>
      <div className="board-card-foot">
        <strong>{item.estimated_value ? `$${item.estimated_value.toLocaleString()}` : <span className="muted">No value yet</span>}</strong>
        <span className="spacer" />
        <button
          type="button"
          className="link-btn"
          style={{ color: "var(--danger-text)" }}
          onClick={() => onDelete(item)}
        >
          Remove
        </button>
      </div>
    </article>
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
        <RoomGroup
          key={room}
          room={room}
          group={group}
          caseId={caseId}
          rooms={rooms}
          onChange={onChange}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

// One collapsible room section. Collapsed by default so a long inventory reads
// as a tidy list of rooms; the header shows the item count and the room's total
// value. The table stays in the DOM (hidden with a class) so printing the
// claim report still includes every room even while collapsed on screen.
function RoomGroup(
  { room, group, caseId, rooms, onChange, onDelete }:
  { room: string; group: Item[]; caseId: string; rooms: string[]; onChange: () => void; onDelete: (it: Item) => void },
) {
  const [open, setOpen] = useState(false);
  const total = group.reduce((sum, it) => sum + (it.estimated_value ?? 0), 0);
  return (
    <div className="room-group">
      <button
        type="button"
        className="room-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`room-chev${open ? " open" : ""}`} aria-hidden>▸</span>
        <span className="room-name">{room}</span>
        <span className="badge">{group.length} item{group.length === 1 ? "" : "s"}</span>
        <span className="spacer" />
        <span className="muted-strong" style={{ fontSize: 14 }}>${total.toLocaleString()}</span>
      </button>
      <div className={open ? "room-body" : "room-body room-collapsed"}>
        <ItemTable items={group} caseId={caseId} rooms={rooms} onChange={onChange} onDelete={onDelete} />
      </div>
    </div>
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
          <th>Photos</th>
          <th>Item</th>
          <th>Category</th>
          <th>Damage</th>
          <th>Est. value</th>
          <th>Receipt</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.id}>
            <td data-label="Photos"><ItemPhotos item={it} /></td>
            <td data-label="Item">
              <strong>{it.name}</strong>
              {it.description && <div className="muted" style={{ fontSize: 13 }}>{it.description}</div>}
            </td>
            <td data-label="Category">{it.category ?? <span className="muted">-</span>}</td>
            <td data-label="Damage">{it.damage_type ? <span className="badge">{it.damage_type}</span> : <span className="muted">-</span>}</td>
            <td data-label="Est. value">
              {it.estimated_value ? (
                <>
                  <div>${it.estimated_value.toLocaleString()}</div>
                  {(() => {
                    const acv = depreciatedValue(it.estimated_value, it.category, it.purchase_date);
                    return acv != null ? (
                      <div className="muted" style={{ fontSize: 12 }}>~${acv.toLocaleString()} depreciated</div>
                    ) : null;
                  })()}
                </>
              ) : <span className="muted">-</span>}
            </td>
            <td data-label="Receipt"><ItemReceipt item={it} caseId={caseId} onChange={onChange} /></td>
            <td className="actions"><ItemActions item={it} caseId={caseId} rooms={rooms} onChange={onChange} onDelete={onDelete} /></td>
          </tr>
        ))}
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
      await api.updateMyItem(item.id, { room: target });
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
                Move to another room...
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
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Move to...</div>
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

// Read-only photo thumbnails for a saved item. Before/After photos are
// captured during the scan flow; here they're view-only, clicking a thumbnail
// opens the full image in a new tab. No manual upload from this table.
function ItemPhotos({ item }: { item: Item }) {
  const slots = PHOTO_SLOTS.filter(([, key]) => item[key]);
  if (slots.length === 0) {
    return <span className="muted">-</span>;
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {slots.map(([label, key]) => {
        const url = item[key]!;
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${label.toLowerCase()} photo`}
            style={{ textAlign: "center", display: "block" }}
          >
            <img src={url} alt={`${label} photo of ${item.name}`} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, display: "block" }} />
            <span className="muted" style={{ fontSize: 11 }}>{label}</span>
          </a>
        );
      })}
    </div>
  );
}

// A single receipt slot per item. Reuses the item-image upload endpoint, so
// receipts are photos of paper receipts (JPG/PNG/etc); the public URL lands in
// the `receipts` column. Shows a thumbnail that opens the full image, with a
// way to replace or remove it.
function ItemReceipt({ item, caseId, onChange }: { item: Item; caseId: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = item.receipts;

  async function upload(file?: File) {
    if (!file || !caseId) return;
    setBusy(true);
    setErr(null);
    try {
      const { url: uploaded } = await api.uploadItemImage(file);
      await api.updateMyItem(item.id, { receipts: uploaded });
      onChange();
    } catch (e: any) {
      setErr(e.message ?? "The receipt didn't upload. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!caseId) return;
    setBusy(true);
    setErr(null);
    try {
      await api.updateMyItem(item.id, { receipts: "" });
      onChange();
    } catch (e: any) {
      setErr(e.message ?? "Could not remove the receipt. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {url ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <a href={url} target="_blank" rel="noopener noreferrer" title="View receipt">
            <img src={url} alt={`Receipt for ${item.name}`} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, display: "block" }} />
          </a>
          <button className="link-btn" disabled={busy} onClick={remove} title="Remove receipt" style={{ fontSize: 11 }}>
            Remove
          </button>
        </div>
      ) : (
        <label title="Add receipt" style={{ cursor: "pointer", textAlign: "center", display: "block" }}>
          <span
            className="muted"
            style={{
              width: 40, height: 40, borderRadius: 6, border: "1px dashed var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}
          >
            {busy ? "..." : "+"}
          </span>
          <span className="muted" style={{ fontSize: 11 }}>Receipt</span>
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              upload(f);
            }}
          />
        </label>
      )}
      {err && <div className="muted" style={{ fontSize: 11, color: "var(--danger)" }}>{err}</div>}
    </div>
  );
}

function sortItems(items: Item[], by: SortBy): Item[] {
  if (by === "none") return items;
  const copy = [...items];
  if (by === "category") {
    copy.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""));
  } else if (by === "price") {
    copy.sort((a, b) => (b.estimated_value ?? 0) - (a.estimated_value ?? 0));
  }
  return copy;
}

function ClaimClassBadge({ claimClass }: { claimClass?: ClaimClass | null }) {
  const label = claimClassLabel(claimClass);
  if (!label) return null;
  return <span className="badge">{label}</span>;
}

// Shows the contents-only claim value prominently and, when building items are
// mixed in, the all-items total separately so survivors do not overstate a
// contents claim with fixtures (flooring, wallpaper) that fall under dwelling
// coverage. Uses the live drafts so edits and removals are reflected; falls
// back to the server's contents_total_estimate_cad for the headline range.
function DraftEstimate({ drafts, scan }: { drafts: Draft[]; scan: RoomScan }) {
  const { contents, total, buildingPresent } = contentsBreakdown(drafts);
  const serverContents = scan.contents_total_estimate_cad ?? null;

  if (!buildingPresent) {
    return (
      <div className="card ok-card" style={{ margin: "12px 0 0" }}>
        <strong style={{ fontSize: 16 }}>
          Estimated value: ${contents.toLocaleString()}
        </strong>
        <span className="muted-strong" style={{ display: "block", fontSize: 13 }}>
          Across {drafts.length} item{drafts.length === 1 ? "" : "s"} you can review and adjust below.
        </span>
      </div>
    );
  }

  return (
    <div className="card warn-card" style={{ margin: "12px 0 0" }}>
      <strong style={{ fontSize: 18 }}>
        Estimated contents claim value: ${contents.toLocaleString()}
      </strong>
      {serverContents && (
        <span className="muted-strong" style={{ display: "block", fontSize: 13 }}>
          Our scan range for contents: ${serverContents.low.toLocaleString()}-${serverContents.high.toLocaleString()}
        </span>
      )}
      <p className="muted-strong" style={{ fontSize: 13, margin: "8px 0 0" }}>
        All items, including the building: ${total.toLocaleString()}.
        Some items here are part of the building (flooring, wallpaper, built-ins).
        Those are usually claimed under your dwelling coverage, not personal
        property (contents), so keep them out of a contents claim.
      </p>
    </div>
  );
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
