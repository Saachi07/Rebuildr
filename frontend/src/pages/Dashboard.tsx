import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ClaimStage, Terms } from "../api";
import { SkeletonList } from "../components/Skeleton";
import { useCases } from "../lib/CasesContext";

// Friendly labels for the claim stage, mirroring the ClaimStage union.
const STAGE_LABEL: Record<ClaimStage, string> = {
  not_started: "Not started",
  reported: "Reported",
  adjuster_assigned: "Adjuster assigned",
  estimate_received: "Estimate received",
  settlement_offer: "Settlement offer",
  payout: "Payout received",
  closed: "Closed",
  denied: "Denied",
};

// The five at-a-glance numbers, kept to exactly five so the dashboard never
// overloads working memory (Miller's law). Each derives from a light query
// and degrades to a helpful "do this next" link when there's nothing yet.
type Metrics = {
  assetValue: number;
  aleTotal: number;
  nextDeadlineDays: number | null;
  pendingTasks: number | null;
};

export default function Dashboard() {
  const { cases, latest, refresh } = useCases();
  const [err, setErr] = useState<string | null>(null);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    refresh().catch((e) => setErr(e.message ?? String(e)));
    api.getTerms().then(setTerms).catch(() => {});
  }, [refresh]);

  const latestCase = latest;
  const inventoryHref = latestCase ? `/cases/${latestCase.id}/inventory` : "/cases/new";
  const recommendationsHref = latestCase ? `/cases/${latestCase.id}/recommendations` : "/cases/new";
  const showMetrics = !!latestCase && latestCase.status !== "draft";

  // Pull the metric inputs in parallel, best-effort, only for a real case.
  // Items are home-scoped; ALE and the plan are per-case.
  useEffect(() => {
    if (!showMetrics || !latestCase) { setMetrics(null); return; }
    let cancelled = false;
    (async () => {
      const [items, ale, recs] = await Promise.allSettled([
        api.listMyItems(),
        api.listAleExpenses(latestCase.id),
        api.getRecommendations(latestCase.id),
      ]);
      if (cancelled) return;
      const assetValue =
        items.status === "fulfilled"
          ? items.value.items.reduce((s, it) => s + (it.estimated_value ?? 0), 0)
          : 0;
      const aleTotal = ale.status === "fulfilled" ? ale.value.total : 0;
      let nextDeadlineDays: number | null = null;
      let pendingTasks: number | null = null;
      if (recs.status === "fulfilled") {
        const days = (recs.value.deadline_radar ?? [])
          .map((r) => r.days_until_deadline)
          .filter((d): d is number => d != null && d >= 0)
          .sort((a, b) => a - b);
        nextDeadlineDays = days.length > 0 ? days[0] : null;
        pendingTasks = (recs.value.todo ?? []).filter((r) => r.status !== "done").length;
      }
      setMetrics({ assetValue, aleTotal, nextDeadlineDays, pendingTasks });
    })();
    return () => { cancelled = true; };
  }, [showMetrics, latestCase?.id]);

  return (
    <div className="container">
      <h1>Welcome back</h1>
      <p className="warm-note">
        Pick up wherever you left off. Nothing here is going anywhere.
      </p>
      {err && <div className="error">{err}</div>}

      {showMetrics && latestCase && (
        <div className="metric-strip">
          <Metric label="Claim phase" value={STAGE_LABEL[latestCase.claim_stage ?? "not_started"]} />
          <Metric
            label="Logged asset value"
            value={metrics ? `$${metrics.assetValue.toLocaleString()}` : "…"}
            hint={metrics && metrics.assetValue === 0 ? { text: "Add photos", to: inventoryHref } : undefined}
          />
          <Metric
            label="Living expenses"
            value={metrics ? `$${metrics.aleTotal.toLocaleString()}` : "…"}
            hint={metrics && metrics.aleTotal === 0 ? { text: "Log a receipt", to: `/cases/${latestCase.id}` } : undefined}
          />
          <Metric
            label="Next deadline"
            value={
              !metrics
                ? "…"
                : metrics.nextDeadlineDays == null
                  ? "None tracked"
                  : metrics.nextDeadlineDays === 0
                    ? "Due today"
                    : `${metrics.nextDeadlineDays} day${metrics.nextDeadlineDays === 1 ? "" : "s"}`
            }
            hint={metrics && metrics.nextDeadlineDays == null ? { text: "See your plan", to: recommendationsHref } : undefined}
          />
          <Metric
            label="Pending tasks"
            value={!metrics ? "…" : metrics.pendingTasks == null ? "-" : String(metrics.pendingTasks)}
            hint={metrics && metrics.pendingTasks ? { text: "Open plan", to: recommendationsHref } : undefined}
          />
        </div>
      )}

      <div className="grid grid-2 dashboard-tiles">
        <Link to={recommendationsHref} className="card tile big-tile">
          <h2>Your recovery plan</h2>
          <p>
            {latestCase
              ? `Your next steps for ${latestCase.case_name}, what to do and when.`
              : "Start a case and we'll suggest the next steps that matter most."}
          </p>
        </Link>

        <Link to="/documents" className="card tile big-tile">
          <h2>Documents</h2>
          <p>Your insurance, ID, and claim papers. All in one safe place.</p>
        </Link>

        <Link to={inventoryHref} className="card tile big-tile">
          <h2>Inventory</h2>
          <p>
            {latestCase
              ? `List and photograph what was damaged, room by room.`
              : "List what was damaged and we'll help estimate values for your claim."}
          </p>
        </Link>

        <Link to="/emergency" className="card tile big-tile">
          <h2>Emergency contacts</h2>
          <p>Crisis lines, Red Cross, and local support, one tap to call.</p>
        </Link>
      </div>

      <h2 style={{ marginTop: 40 }}>Your cases</h2>
      {cases === null && !err && <SkeletonList rows={2} />}
      {cases && cases.length === 0 && (
        <div className="card">
          <p className="muted-strong">
            No cases yet. When you're ready, use{" "}
            <strong>+ Start a new case</strong> up top to begin.
          </p>
        </div>
      )}
      <div className="grid grid-2">
        {cases?.map((c) => {
          // A draft is a recovery the user started but has not confirmed yet.
          // Send it back to the intake to finish, and label it plainly.
          const isDraft = c.status === "draft";
          const to = isDraft ? "/cases/new" : `/cases/${c.id}/recommendations`;
          return (
            <Link key={c.id} to={to} className="card tile">
              <h3>{c.case_name || "Untitled recovery"}</h3>
              <p>{c.disaster_type || "Not specified yet"}{c.location ? ` · ${c.location}` : ""}</p>
              <div style={{ marginTop: 8 }}>
                <span className="badge">{isDraft ? "In progress" : c.status ?? "active"}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {terms?.encryption_notice && (
        <div className="notice" style={{ marginTop: 32 }}>
          <strong>Your data is encrypted</strong>
          <span className="muted">{terms.encryption_notice}</span>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: { text: string; to: string };
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {hint ? (
        <Link to={hint.to} className="metric-hint">{hint.text}</Link>
      ) : (
        <span className="metric-hint-spacer" aria-hidden />
      )}
    </div>
  );
}
