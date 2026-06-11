import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, RecGroups, Recommendation } from "../api";
import { BackButton } from "../components/BackButton";

export default function Recommendations() {
  const { id } = useParams();
  const [groups, setGroups] = useState<RecGroups | null>(null);
  const [radar, setRadar] = useState<Recommendation[]>([]);
  const [topPick, setTopPick] = useState<Recommendation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasItems, setHasItems] = useState<boolean | null>(null);
  const [hasDocs, setHasDocs] = useState<boolean | null>(null);

  async function load() {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.getRecommendations(id, 5);
      setGroups(r.by_category ?? {});
      setRadar(r.deadline_radar ?? []);
      setTopPick(r.top_pick ?? null);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
    try {
      const [itemsRes, docsRes] = await Promise.all([
        api.listItems(id),
        api.listMyDocuments(),
      ]);
      setHasItems((itemsRes?.items ?? []).length > 0);
      setHasDocs((docsRes?.documents ?? []).length > 0);
    } catch {
      // Upload nudges are best-effort — don't block the plan if these fail.
    }
  }

  useEffect(() => { load(); }, [id]);

  const empty = groups && Object.values(groups).every((g) => g.length === 0);

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
        don't have to do all of this — start anywhere that feels manageable.
      </p>

      {err && <div className="error">{err}</div>}
      {busy && !groups && <p className="muted-strong">Putting together your plan…</p>}

      {groups && empty && (
        <EmptyChecklist caseId={id} />
      )}

      {!empty && (hasItems === false || hasDocs === false) && (
        <div className="card" style={{ borderLeft: "4px solid #3b6ea5" }}>
          <h3 style={{ marginTop: 0 }}>✨ Make your plan even more personal</h3>
          <p className="muted-strong" style={{ marginBottom: 10 }}>
            These suggestions are based on your case details so far. The more
            you share, the better we can match you with the right support —
            it only takes a few minutes.
          </p>
          {hasItems === false && (
            <div className="row" style={{ alignItems: "center", margin: "8px 0" }}>
              <span style={{ fontSize: 15 }}>
                <strong>You haven't added any inventory yet.</strong>{" "}
                Snap a photo of a room and we'll list what's in it for you —
                it helps unlock damage-specific resources and claim support.
              </span>
              <span className="spacer" />
              <Link to={id ? `/cases/${id}/inventory` : "/dashboard"}>
                <button style={{ whiteSpace: "nowrap" }}>Add photos →</button>
              </Link>
            </div>
          )}
          {hasDocs === false && (
            <div className="row" style={{ alignItems: "center", margin: "8px 0" }}>
              <span style={{ fontSize: 15 }}>
                <strong>You haven't uploaded any documents yet.</strong>{" "}
                Adding your insurance policy or claims unlocks deadline
                tracking and coverage gap analysis.
              </span>
              <span className="spacer" />
              <Link to="/documents">
                <button style={{ whiteSpace: "nowrap" }}>Upload documents →</button>
              </Link>
            </div>
          )}
        </div>
      )}

      {radar.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #d9822b" }}>
          <h3 style={{ marginTop: 0 }}>⏰ Deadlines coming up</h3>
          {radar.map((r) => (
            <p key={r.id} style={{ margin: "6px 0", fontSize: 15 }}>
              <strong>{r.title}</strong>
              {r.days_until_deadline != null && (
                <span className="badge" style={{ marginLeft: 8 }}>
                  {r.days_until_deadline === 0
                    ? "due today"
                    : `${r.days_until_deadline} day${r.days_until_deadline === 1 ? "" : "s"} left`}
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

      {topPick && !empty && (
        <div className="card" style={{ borderLeft: "4px solid #3a7d44" }}>
          <h3 style={{ marginTop: 0 }}>Start here</h3>
          <strong>{topPick.title}</strong>
          {topPick.body && <p style={{ margin: "8px 0", fontSize: 15 }}>{topPick.body}</p>}
          {topPick.reasons?.length > 0 && (
            <p className="muted-strong" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Why this matters: {topPick.reasons.join(" · ")}
            </p>
          )}
          {topPick.url && (
            <a href={topPick.url} target="_blank" rel="noreferrer">
              <button style={{ marginTop: 10 }}>Open</button>
            </a>
          )}
        </div>
      )}

      {groups && !empty && Object.entries(groups).map(([category, recs]) => (
        recs && recs.length > 0 && (
          <div key={category} className="rec-group">
            <h2>{category}</h2>
            {recs.filter(Boolean).map((r) => (
              <div key={r.id} className="card rec-card">
                <div style={{ flex: 1 }}>
                  <div className="row">
                    <strong>{r.title}</strong>
                    <span className="spacer" />
                    <span className="score">match {r.score.toFixed(2)}</span>
                  </div>
                  {r.body && (
                    <p style={{ margin: "8px 0", fontSize: 15 }}>{r.body}</p>
                  )}
                  {r.reasons?.length > 0 && (
                    <p className="muted-strong" style={{ margin: "6px 0 0", fontSize: 13 }}>
                      Why this matters: {r.reasons.join(" · ")}
                    </p>
                  )}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      <button className="secondary" style={{ marginTop: 10 }}>Open</button>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ))}
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
          that will help — do them in any order.
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
          <p>Crisis lines, FEMA, Red Cross — keep them one tap away.</p>
        </Link>
        <Link to="/documents" className="tile">
          <h3> Add any claims you've started</h3>
          <p>If you've already filed something, upload the paperwork.</p>
        </Link>
      </div>
    </>
  );
}
