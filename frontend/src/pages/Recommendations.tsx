import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, PersonalizeHint, RecGroups, Recommendation, RecStatus } from "../api";
import { BackButton } from "../components/BackButton";

// Friendly, recovery-phase-ordered category headers. Raw resource types
// make poor headings, and the order should follow how recovery actually
// unfolds: safety first, rebuilding later.
const CATEGORY_LABELS: Record<string, string> = {
  shelter: "A safe place to stay",
  health: "Health and wellbeing",
  documents: "Replacing your documents",
  insurance: "Insurance help",
  policy: "Understanding your policy",
  financial: "Financial support",
  legal: "Legal support",
  rebuild: "Rebuilding your home",
};
const CATEGORY_ORDER = [
  "shelter", "health", "documents", "insurance", "policy",
  "financial", "legal", "rebuild",
];

function categoryLabel(type: string): string {
  return CATEGORY_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

function categoryRank(type: string): number {
  const i = CATEGORY_ORDER.indexOf(type);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

// Scores arrive normalized to roughly [0, 1]; show a relative label
// instead of a raw number nobody can interpret.
function matchLabel(score: number): string {
  if (score >= 0.66) return "Strong match";
  if (score >= 0.33) return "Good match";
  return "Worth a look";
}

function deadlineBadge(days: number): string {
  if (days < 0) {
    const ago = -days;
    return `closed ${ago} day${ago === 1 ? "" : "s"} ago`;
  }
  if (days === 0) return "due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

// Where each personalization hint should send the user.
function hintLink(questionId: string, caseId?: string): { to: string; label: string } {
  switch (questionId) {
    case "add_inventory_photos":
      return { to: caseId ? `/cases/${caseId}/inventory` : "/dashboard", label: "Add photos" };
    case "upload_policy":
      return { to: "/documents", label: "Upload documents" };
    case "name_your_insurer":
    case "add_incident_date":
    default:
      return { to: caseId ? `/cases/${caseId}` : "/dashboard", label: "Open your case" };
  }
}

export default function Recommendations() {
  const { id } = useParams();
  const [groups, setGroups] = useState<RecGroups | null>(null);
  const [radar, setRadar] = useState<Recommendation[]>([]);
  const [topPick, setTopPick] = useState<Recommendation | null>(null);
  const [hints, setHints] = useState<PersonalizeHint[]>([]);
  const [emptyCategories, setEmptyCategories] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  // Optimistic status changes, keyed by resource id, layered over the
  // statuses the server sent. Cleared on each successful reload.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, RecStatus>>({});

  async function load() {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.getRecommendations(id, 5);
      setGroups(r.by_category ?? {});
      setRadar(r.deadline_radar ?? []);
      setTopPick(r.top_pick ?? null);
      setHints(r.personalize_more ?? []);
      setEmptyCategories(r.empty_categories ?? []);
      setStatusOverrides({});
    } catch (e: any) {
      // Keep the last good plan on screen; just surface the problem.
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  function statusOf(r: Recommendation): RecStatus {
    return statusOverrides[r.id] ?? r.status ?? "suggested";
  }

  async function setStatus(r: Recommendation, status: RecStatus) {
    if (!r.rec_id) return;
    const previous = statusOf(r);
    setStatusOverrides((prev) => ({ ...prev, [r.id]: status }));
    try {
      await api.updateRecommendation(r.rec_id, status);
    } catch {
      setStatusOverrides((prev) => ({ ...prev, [r.id]: previous }));
      setErr("We couldn't save that change. Please try again in a moment.");
    }
  }

  const allRecs = useMemo(
    () => (groups ? Object.values(groups).flat().filter(Boolean) : []),
    [groups],
  );
  const savedRecs = allRecs.filter((r) => statusOf(r) === "saved");
  const hiddenRecs = allRecs.filter((r) => statusOf(r) === "dismissed");
  const visibleCount = allRecs.filter((r) => statusOf(r) !== "dismissed").length;
  const doneCount = allRecs.filter((r) => statusOf(r) === "done").length;

  const empty = groups && Object.values(groups).every((g) => g.length === 0);

  const orderedGroups = useMemo(() => {
    if (!groups) return [];
    return Object.entries(groups)
      .filter(([, recs]) => recs && recs.length > 0)
      .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b));
  }, [groups]);

  return (
    <div className="container">
      <BackButton />
      <div className="row" style={{ marginTop: 16 }}>
        <h1 style={{ margin: 0 }}>Your recovery plan</h1>
        <span className="spacer" />
        <button className="secondary" onClick={load} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <p className="warm-note" style={{ marginTop: 8 }}>
        Here's what we'd do next, based on what you've shared so far. You
        don't have to do all of it. Start anywhere that feels manageable,
        and check things off as you go.
      </p>

      {err && (
        <div className="error">
          <span>{err}</span>{" "}
          <button className="secondary" style={{ marginLeft: 8 }} onClick={load} disabled={busy}>
            Try again
          </button>
        </div>
      )}
      {busy && !groups && <p className="muted-strong">Putting together your plan…</p>}

      {groups && !empty && visibleCount > 0 && (
        <ProgressBar done={doneCount} total={visibleCount} />
      )}

      {groups && empty && <EmptyChecklist caseId={id} />}

      {!empty && hints.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #3b6ea5" }}>
          <h3 style={{ marginTop: 0 }}>Make your plan even more personal</h3>
          <p className="muted-strong" style={{ marginBottom: 10 }}>
            These suggestions are based on what you've shared so far. The
            more we know, the better we can match you with the right
            support, and it only takes a few minutes.
          </p>
          {hints.map((h) => {
            const link = hintLink(h.question_id, id);
            return (
              <div key={h.question_id} className="row" style={{ alignItems: "center", margin: "8px 0" }}>
                <span style={{ fontSize: 15 }}>
                  {h.copy}
                  {h.would_unlock?.length > 0 && (
                    <span className="muted-strong" style={{ display: "block", fontSize: 13 }}>
                      For example: {h.would_unlock.join(", ")}
                    </span>
                  )}
                </span>
                <span className="spacer" />
                <Link to={link.to}>
                  <button style={{ whiteSpace: "nowrap" }}>{link.label}</button>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {radar.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #d9822b" }}>
          <h3 style={{ marginTop: 0 }}>Deadlines coming up</h3>
          {radar.map((r) => (
            <p key={r.id} style={{ margin: "6px 0", fontSize: 15 }}>
              <strong>{r.title}</strong>
              {r.days_until_deadline != null && (
                <span className="badge" style={{ marginLeft: 8 }}>
                  {deadlineBadge(r.days_until_deadline)}
                </span>
              )}
              {r.reasons?.length > 0 && (
                <span className="muted-strong" style={{ display: "block", fontSize: 13 }}>
                  {r.reasons.join(" · ")}
                </span>
              )}
            </p>
          ))}
        </div>
      )}

      {topPick && !empty && statusOf(topPick) !== "done" && statusOf(topPick) !== "dismissed" && (
        <div className="card" style={{ borderLeft: "4px solid #3a7d44" }}>
          <h3 style={{ marginTop: 0 }}>Start here</h3>
          <strong>{topPick.title}</strong>
          {topPick.body && <p style={{ margin: "8px 0", fontSize: 15 }}>{topPick.body}</p>}
          {topPick.reasons?.length > 0 && (
            <p className="muted-strong" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Why this matters: {topPick.reasons.join(" · ")}
            </p>
          )}
          <RecActions rec={topPick} status={statusOf(topPick)} onStatus={setStatus} />
        </div>
      )}

      {savedRecs.length > 0 && (
        <div className="rec-group">
          <h2>Saved for later</h2>
          {savedRecs.map((r) => (
            <RecCard key={`saved-${r.id}`} rec={r} status="saved" onStatus={setStatus} />
          ))}
        </div>
      )}

      {orderedGroups.map(([category, recs]) => {
        const shown = recs.filter(Boolean).filter((r) => statusOf(r) !== "dismissed");
        if (shown.length === 0) return null;
        return (
          <div key={category} className="rec-group">
            <h2>{categoryLabel(category)}</h2>
            {shown.map((r) => (
              <RecCard key={r.id} rec={r} status={statusOf(r)} onStatus={setStatus} />
            ))}
          </div>
        );
      })}

      {!empty && emptyCategories.length > 0 && (
        <div className="card">
          <p className="muted-strong" style={{ margin: 0, fontSize: 14 }}>
            We also looked for {emptyCategories.map(categoryLabel).join(", ").toLowerCase()} resources,
            but nothing matched your case yet. Adding a bit more detail, like
            your region or the date this happened, can open those up.
          </p>
        </div>
      )}

      {hiddenRecs.length > 0 && (
        <div className="card">
          <div className="row" style={{ alignItems: "center" }}>
            <span className="muted-strong" style={{ fontSize: 14 }}>
              {hiddenRecs.length} suggestion{hiddenRecs.length === 1 ? "" : "s"} hidden
            </span>
            <span className="spacer" />
            <button className="secondary" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? "Collapse" : "Show"}
            </button>
          </div>
          {showHidden && hiddenRecs.map((r) => (
            <div key={`hidden-${r.id}`} className="row" style={{ alignItems: "center", margin: "8px 0" }}>
              <span className="muted-strong" style={{ fontSize: 14 }}>{r.title}</span>
              <span className="spacer" />
              <button className="secondary" onClick={() => setStatus(r, "suggested")}>
                Bring back
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="card" style={{ padding: "12px 16px" }}>
      <div className="row" style={{ alignItems: "center" }}>
        <span style={{ fontSize: 14 }}>
          <strong>{done}</strong> of <strong>{total}</strong> steps done
        </span>
        <span className="spacer" />
        <span className="muted-strong" style={{ fontSize: 13 }}>
          {done === 0
            ? "Every step counts, even a small one."
            : done === total
              ? "You've worked through everything here. Well done."
              : "You're making real progress."}
        </span>
      </div>
      <div style={{ background: "#e6e2da", borderRadius: 6, height: 8, marginTop: 8 }}>
        <div
          style={{
            width: `${pct}%`,
            background: "#3a7d44",
            borderRadius: 6,
            height: 8,
            transition: "width 200ms ease",
          }}
        />
      </div>
    </div>
  );
}

function RecActions({
  rec,
  status,
  onStatus,
}: {
  rec: Recommendation;
  status: RecStatus;
  onStatus: (r: Recommendation, s: RecStatus) => void;
}) {
  const canUpdate = Boolean(rec.rec_id);
  return (
    <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
      {rec.url && (
        <a href={rec.url} target="_blank" rel="noreferrer">
          <button className="secondary">Open</button>
        </a>
      )}
      {rec.phone && (
        <a href={`tel:${rec.phone}`}>
          <button className="secondary">Call {rec.phone}</button>
        </a>
      )}
      {canUpdate && status !== "done" && (
        <button className="secondary" onClick={() => onStatus(rec, "done")}>
          Mark as done
        </button>
      )}
      {canUpdate && status === "done" && (
        <button className="secondary" onClick={() => onStatus(rec, "suggested")}>
          Not done yet
        </button>
      )}
      {canUpdate && status !== "saved" && status !== "done" && (
        <button className="secondary" onClick={() => onStatus(rec, "saved")}>
          Save for later
        </button>
      )}
      {canUpdate && status === "saved" && (
        <button className="secondary" onClick={() => onStatus(rec, "suggested")}>
          Remove from saved
        </button>
      )}
      {canUpdate && status !== "done" && (
        <button className="secondary" onClick={() => onStatus(rec, "dismissed")}>
          Hide
        </button>
      )}
    </div>
  );
}

function RecCard({
  rec,
  status,
  onStatus,
}: {
  rec: Recommendation;
  status: RecStatus;
  onStatus: (r: Recommendation, s: RecStatus) => void;
}) {
  const done = status === "done";
  return (
    <div className="card rec-card" style={done ? { opacity: 0.65 } : undefined}>
      <div style={{ flex: 1 }}>
        <div className="row">
          <strong style={done ? { textDecoration: "line-through" } : undefined}>
            {rec.title}
          </strong>
          <span className="spacer" />
          {done ? (
            <span className="badge">Done</span>
          ) : (
            <span className="score">{matchLabel(rec.score)}</span>
          )}
        </div>
        {rec.body && !done && (
          <p style={{ margin: "8px 0", fontSize: 15 }}>{rec.body}</p>
        )}
        {rec.reasons?.length > 0 && !done && (
          <p className="muted-strong" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Why this matters: {rec.reasons.join(" · ")}
          </p>
        )}
        <RecActions rec={rec} status={status} onStatus={onStatus} />
      </div>
    </div>
  );
}

function EmptyChecklist({ caseId }: { caseId?: string }) {
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Let's get started together</h3>
        <p className="muted-strong">
          We need a little more to tailor your plan. Here are the next things
          that will help, and you can do them in any order.
        </p>
      </div>
      <div className="grid grid-2">
        <Link to="/documents" className="tile">
          <h3>Add your insurance policy</h3>
          <p>This unlocks deadline tracking and coverage gap analysis.</p>
        </Link>
        <Link to={caseId ? `/cases/${caseId}/inventory` : "/dashboard"} className="tile">
          <h3>Take a few photos</h3>
          <p>One room at a time. We'll list what's in each photo for you.</p>
        </Link>
        <Link to="/emergency" className="tile">
          <h3>Save the helpful numbers</h3>
          <p>Crisis lines, FEMA, and Red Cross, all kept one tap away.</p>
        </Link>
        <Link to="/documents" className="tile">
          <h3>Add any claims you've started</h3>
          <p>If you've already filed something, upload the paperwork.</p>
        </Link>
      </div>
    </>
  );
}
