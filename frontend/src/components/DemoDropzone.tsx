import { useRef, useState } from "react";
import { api, RoomScan } from "../api";

// "Try it yourself" on the public landing page: drop one room photo and see a
// couple of the items our AI finds, no account needed. The image is sent to a
// public demo endpoint that scans it and deletes it immediately afterward; we
// never store demo photos. We show at most a few items to keep it a teaser.
const ACCEPTED = ".jpg,.jpeg,.png,.heic,.heif,.webp";
const MAX_PREVIEW_ITEMS = 4;

export default function DemoDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [scan, setScan] = useState<RoomScan | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(file: File) {
    setBusy(true);
    setErr(null);
    setScan(null);
    try {
      const result = await api.analyzeDemoPhoto(file);
      if (!result.items || result.items.length === 0) {
        setErr("We couldn't pick out items in that photo. Try a wider, brighter shot of a room.");
        return;
      }
      setScan(result);
    } catch (e: any) {
      setErr(e?.message ?? "That didn't work. Please try another photo.");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) run(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) run(f);
  }

  const items = scan?.items.slice(0, MAX_PREVIEW_ITEMS) ?? [];
  // One-photo teaser: once we've shown a result, the dropzone is retired so the
  // demo stays a read-only glimpse, not a free scanning tool. The real,
  // multi-photo, editable workflow lives behind "Start when you're ready".
  const done = !!scan && items.length > 0;

  return (
    <div className="demo-zone">
      {!done && (
        <div
          className={`dropzone${dragOver ? " over" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          aria-label="Drop a photo of any room, or tap to choose one"
        >
          {busy ? (
            <div className="dropzone-inner">
              <div className="spinner" style={{ margin: "0 auto 8px" }} />
              <strong>Reading your photo...</strong>
              <span className="muted" style={{ fontSize: 13 }}>This can take up to half a minute.</span>
            </div>
          ) : (
            <div className="dropzone-inner">
              <strong>Drop a photo of any room, or tap to take one</strong>
              <span className="muted-strong" style={{ fontSize: 14 }}>JPG, PNG, or HEIC</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            capture="environment"
            style={{ display: "none" }}
            onChange={onPick}
          />
        </div>
      )}

      {!done && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          One photo, just to show you how it works. It's scanned and then
          deleted right away. We do not keep demo photos.
        </p>
      )}

      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}

      {scan && items.length > 0 && (
        <div className="demo-result">
          <div className="row" style={{ marginBottom: 8 }}>
            <strong>{scan.room_type || "What we found"}</strong>
            <span className="badge" style={{ marginLeft: 8 }}>{items.length} items shown</span>
          </div>
          <ul className="demo-item-list">
            {items.map((it, i) => {
              const est = it.canadian_retail_estimate_cad ?? { low: 0, high: 0 };
              const mid = Math.round((est.low + est.high) / 2);
              return (
                <li key={i} className="demo-item">
                  <span>{it.name}</span>
                  <strong>${mid.toLocaleString()}</strong>
                </li>
              );
            })}
          </ul>
          <p className="muted-strong" style={{ fontSize: 13, margin: "10px 0 0" }}>
            That is a small sample. Inside Rebuildr we list every room, value the
            damage, and build a claim-ready inventory.
          </p>
        </div>
      )}
    </div>
  );
}
