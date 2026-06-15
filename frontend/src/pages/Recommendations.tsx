import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, CaseReadiness, PersonalizeHint, RecGroups, Recommendation, RecStatus } from "../api";
import { BackButton } from "../components/BackButton";
import { PersonalizeCard, ResolvedHint } from "../components/IntakeQuestions";

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
  const [todo, setTodo] = useState<Recommendation[]>([]);
  const [topPick, setTopPick] = useState<Recommendation | null>(null);
  const [hints, setHints] = useState<PersonalizeHint[]>([]);
  const [emptyCategories, setEmptyCategories] = useState<string[]>([]);
  const [readiness, setReadiness] = useState<CaseReadiness | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  // Stress narrows working memory, show only the next few steps by
  // default, with the full plan one tap away.
  const [showFull, setShowFull] = useState(false);
  const [hasIntake, setHasIntake] = useState<boolean | null>(null);
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
      setTodo(r.todo ?? []);
      setTopPick(r.top_pick ?? null);
      setHints(r.personalize_more ?? []);
      setEmptyCategories(r.empty_categories ?? []);
      setReadiness(r.readiness ?? null);
      setStatusOverrides({});
    } catch (e: any) {
      // Keep the last good plan on screen; just surface the problem.
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  // Whether the optional questions were answered decides where the
  // personalize card sits: top while unanswered, bottom afterwards.
  useEffect(() => {
    if (!id) return;
    api.getCase(id)
      .then((r) => setHasIntake(Object.keys(r.case.intake_answers ?? {}).length > 0))
      .catch(() => setHasIntake(false));
  }, [id]);

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

  const resolvedHints: ResolvedHint[] = hints.map((h) => {
    const link = hintLink(h.question_id, id);
    return { ...h, to: link.to, linkLabel: link.label };
  });

  const openTodo = todo.filter((r) => statusOf(r) !== "dismissed" && statusOf(r) !== "done");
  const focusList: Recommendation[] = [];
  if (topPick && statusOf(topPick) !== "done" && statusOf(topPick) !== "dismissed") {
    focusList.push(topPick);
  }
  for (const r of openTodo) {
    if (focusList.length >= 3) break;
    if (!focusList.some((f) => f.id === r.id)) focusList.push(r);
  }
  const moreCount = Math.max(0, visibleCount - focusList.length);

  const personalize = id && (
    <PersonalizeCard caseId={id} hints={resolvedHints} onPlanRefresh={load} />
  );

  return (
    <div className="container plan-page">
      <BackButton to="/dashboard" label="Dashboard" />
      <div className="row" style={{ marginTop: 16 }}>
        <h1 style={{ margin: 0 }}>Your recovery plan</h1>
        <span className="spacer" />
        <button className="secondary no-print" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button className="secondary no-print" onClick={load} disabled={busy}>
          {busy ? "Checking…" : "Check for new help"}
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

      {readiness && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 12px" }}>Recovery Readiness</h3>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 18, fontWeight: "bold" }}>{readiness.percent}% Ready</span>
              <span className="muted" style={{ fontSize: 13 }}>{readiness.completed} of {readiness.total}</span>
            </div>
            <div style={{ width: "100%", height: 8, backgroundColor: "#e0e0e0", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${readiness.percent}%`,
                  height: "100%",
                  backgroundColor: readiness.percent >= 80 ? "#4caf50" : readiness.percent >= 50 ? "#ff9800" : "#f44336",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
          <div style={{ fontSize: 13 }}>
            {readiness.checks.map((check) => (
              <div key={check.key} style={{ display: "flex", alignItems: "center", margin: "8px 0", opacity: check.done ? 1 : 0.7 }}>
                <span style={{ marginRight: 8, fontSize: 14 }}>{check.done ? "✓" : "○"}</span>
                <span style={{ textDecoration: check.done ? "line-through" : "none", opacity: check.done ? 0.6 : 1 }}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {groups && !empty && visibleCount > 0 && (
        <ProgressBar done={doneCount} total={visibleCount} />
      )}

      {groups && empty && <EmptyChecklist caseId={id} />}

      {/* Optional questions: top while unanswered (it's the highest-leverage
          thing on the page), tucked to the bottom once answered. */}
      {!empty && hasIntake === false && personalize}

      {radar.length > 0 && (
        <div className="card warn-card">
          <h3 style={{ marginTop: 0 }}>Deadlines coming up</h3>
          {radar.map((r) => (
            <p key={r.id} style={{ margin: "6px 0", fontSize: 15 }}>
              <strong>{r.title}</strong>
              {r.days_until_deadline != null && (
                <span className="badge" style={{ marginLeft: 8 }}>
                  {deadlineBadge(r.days_until_deadline)}
                </span>
              )}
              {r.days_until_deadline != null && r.days_until_deadline < 0 && (
                <span className="muted-strong" style={{ display: "block", fontSize: 13 }}>
                  Missed deadlines often still have options, exceptions and
                  late applications exist. It's worth calling them to ask.
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

      {/* Focused view: just the next few steps. The full plan is one tap away. */}
      {!empty && !showFull && focusList.length > 0 && (
        <>
          <div className="card ok-card">
            <h3 style={{ marginTop: 0 }}>Start with these</h3>
            <p className="muted-strong" style={{ margin: "0 0 8px", fontSize: 13 }}>
              Just {focusList.length} thing{focusList.length === 1 ? "" : "s"} for
              now. Everything else can wait.
            </p>
            {focusList.map((r, i) => (
              <div key={`focus-${r.id}`} style={{ margin: "12px 0" }}>
                <strong>{i + 1}. {r.title}</strong>
                {r.days_until_deadline != null && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    {deadlineBadge(r.days_until_deadline)}
                  </span>
                )}
                {r.body && <p style={{ margin: "6px 0", fontSize: 15 }}>{r.body}</p>}
                {r.reasons?.length > 0 && (
                  <p className="muted-strong" style={{ margin: "4px 0 0", fontSize: 13 }}>
                    Why this matters: {r.reasons.join(" · ")}
                  </p>
                )}
                <RecActions rec={r} status={statusOf(r)} onStatus={setStatus} />
              </div>
            ))}
          </div>
          {moreCount > 0 && (
            <div className="row no-print" style={{ justifyContent: "center", margin: "16px 0" }}>
              <button className="secondary" onClick={() => setShowFull(true)}>
                Show my full plan ({moreCount} more suggestion{moreCount === 1 ? "" : "s"})
              </button>
            </div>
          )}
        </>
      )}

      {/* Full plan */}
      {!empty && (showFull || focusList.length === 0) && (
        <>
          {showFull && (
            <div className="row no-print" style={{ margin: "8px 0" }}>
              <button className="secondary" onClick={() => setShowFull(false)}>
                ← Back to just the next steps
              </button>
            </div>
          )}

          {todo.length > 0 && (
            <div className="card info-card">
              <h3 style={{ marginTop: 0 }}>Your to-do list</h3>
              <p className="muted-strong" style={{ margin: "0 0 8px", fontSize: 13 }}>
                The steps that matter most right now, with anything deadline-bound
                at the top. Check them off as you go.
              </p>
              {todo
                .filter((r) => statusOf(r) !== "dismissed")
                .map((r, i) => {
                  const done = statusOf(r) === "done";
                  return (
                    <div key={`todo-${r.id}`} className="row" style={{ alignItems: "center", margin: "8px 0" }}>
                      <span style={{ fontSize: 15, opacity: done ? 0.6 : 1 }}>
                        <strong style={done ? { textDecoration: "line-through" } : undefined}>
                          {i + 1}. {r.title}
                        </strong>
                        {r.days_until_deadline != null && !done && (
                          <span className="badge" style={{ marginLeft: 8 }}>
                            {deadlineBadge(r.days_until_deadline)}
                          </span>
                        )}
                      </span>
                      <span className="spacer" />
                      {r.rec_id && (
                        <button
                          className="secondary"
                          style={{ whiteSpace: "nowrap" }}
                          onClick={() => setStatus(r, done ? "suggested" : "done")}
                        >
                          {done ? "Not done yet" : "Mark as done"}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {topPick && statusOf(topPick) !== "done" && statusOf(topPick) !== "dismissed" && (
            <div className="card ok-card">
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
              <details key={category} className="rec-group rec-accordion">
                <summary>
                  <h2>{categoryLabel(category)}</h2>
                  <span className="badge">{shown.length}</span>
                </summary>
                {shown.map((r) => (
                  <RecCard key={r.id} rec={r} status={statusOf(r)} onStatus={setStatus} />
                ))}
              </details>
            );
          })}

          {emptyCategories.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>More help, once we know a little more</h3>
              <p className="muted-strong" style={{ margin: "0 0 8px", fontSize: 14 }}>
                We have room here for {emptyCategories.map(categoryLabel).join(", ").toLowerCase()}.
                Add your photos or upload your policy to unlock programs here.
              </p>
              <div className="row no-print" style={{ gap: 8 }}>
                <Link to={id ? `/cases/${id}/inventory` : "/dashboard"}>
                  <button className="secondary">Add photos</button>
                </Link>
                <Link to="/documents">
                  <button className="secondary">Upload your policy</button>
                </Link>
              </div>
            </div>
          )}

          {hiddenRecs.length > 0 && (
            <div className="card no-print">
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
        </>
      )}

      {!empty && hasIntake !== false && personalize}
      {empty && personalize}
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
      <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="meter-fill" style={{ width: `${pct}%` }} />
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
    <div className="row no-print" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
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

// Empty plans get a gentle, explicitly ordered set of first steps, one
// decision at a time, every one skippable.
function EmptyChecklist({ caseId }: { caseId?: string }) {
  const steps = [
    {
      n: 1,
      title: "Add your insurance policy",
      body: "This unlocks deadline tracking and coverage gap analysis.",
      to: "/documents",
    },
    {
      n: 2,
      title: "Take a few photos",
      body: "One room at a time. We'll list what's in each photo for you.",
      to: caseId ? `/cases/${caseId}/inventory` : "/dashboard",
    },
    {
      n: 3,
      title: "Save the helpful numbers",
      body: "Crisis lines, 211 Alberta, and the Red Cross, kept one tap away.",
      to: "/emergency",
    },
    {
      n: 4,
      title: "Add any claims you've started",
      body: "If you've already filed something, upload the paperwork.",
      to: "/documents",
    },
  ];
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Let's get started together</h3>
        <p className="muted-strong">
          We need a little more to tailor your plan. Here are the first steps
          that help most, in order, but skip any of them. Start with step 1
          if you're not sure.
        </p>
      </div>
      <div className="grid grid-2">
        {steps.map((s) => (
          <Link key={s.n} to={s.to} className="tile">
            <h3><span className="step-num">Step {s.n}</span> {s.title}</h3>
            <p>{s.body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
