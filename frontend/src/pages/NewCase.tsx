import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { BackButton } from "../components/BackButton";
import { Hint } from "../components/Hint";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { Spinner } from "../components/Skeleton";
import { useCases } from "../lib/CasesContext";

// Big tappable cards instead of a dropdown: every option visible at once,
// no fine motor control needed. Text only, no emoji.
const DISASTERS = [
  { value: "wildfire", label: "Wildfire / smoke", detail: "Fire, smoke, or ash damage" },
  { value: "flood", label: "Flood / water", detail: "Flooding, sewer backup, burst pipes" },
  { value: "hurricane", label: "Hurricane / wind", detail: "Severe wind or storm damage" },
  { value: "tornado", label: "Tornado", detail: "Tornado or funnel-cloud damage" },
  { value: "earthquake", label: "Earthquake", detail: "Structural or shaking damage" },
  { value: "other", label: "Something else", detail: "Hail, winter storm, or anything else" },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type FormState = {
  case_name: string;
  disaster_type: string;
  location: string;
  incident_date: string;
};

const EMPTY_FORM: FormState = {
  case_name: "",
  disaster_type: "wildfire",
  location: "",
  incident_date: "",
};

export default function NewCase() {
  const nav = useNavigate();
  const { cases, activeDraft, refresh } = useCases();
  // The draft is the autosave target. We either reuse the one already open or
  // create one on arrival, so half-entered answers survive an app close.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Until the draft is hydrated or created we show a spinner, otherwise an
  // empty form would flash over the user's saved answers for a moment.
  const [ready, setReady] = useState(false);
  const initRef = useRef(false);

  // On mount, hydrate from the active draft if there is one, otherwise create
  // a fresh draft to autosave into. Wait for cases to load first (null means
  // still loading) so we never create a duplicate draft.
  useEffect(() => {
    if (cases === null || initRef.current) return;
    initRef.current = true;
    (async () => {
      if (activeDraft) {
        setDraftId(activeDraft.id);
        setForm({
          case_name: activeDraft.case_name ?? "",
          disaster_type: activeDraft.disaster_type || "wildfire",
          location: activeDraft.location ?? "",
          incident_date: activeDraft.incident_date ?? "",
        });
        setReady(true);
        return;
      }
      try {
        const res = await api.createCase({ status: "draft" });
        setDraftId(res.case.id);
        await refresh();
      } catch (e: any) {
        setErr(e.message ?? String(e));
      } finally {
        setReady(true);
      }
    })();
  }, [cases, activeDraft, refresh]);

  // Debounced autosave: persist each field into the draft a beat after the
  // user stops typing. Best-effort, a failed save just retries on the next
  // edit and the Continue step writes the final values anyway.
  useEffect(() => {
    if (!ready || !draftId) return;
    const t = setTimeout(() => {
      api
        .updateCase(draftId, {
          case_name: form.case_name,
          disaster_type: form.disaster_type,
          location: form.location,
          incident_date: form.incident_date || null,
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [form, ready, draftId]);

  function update<K extends keyof FormState>(k: K, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  // Naming a case is a creative task nobody in crisis needs. Suggest one
  // from what we already know; the user can change it any time.
  function suggestedName(): string {
    const label = DISASTERS.find((d) => d.value === form.disaster_type)?.label ?? "Recovery";
    const place = form.location ? form.location.split(",")[0].trim() : "";
    const when = (form.incident_date ? new Date(form.incident_date + "T00:00:00") : new Date())
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return [label.split(" /")[0], place, when].filter(Boolean).join(", ");
  }

  // Continue promotes the draft to an active case and moves on to the plan.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draftId) return;
    setErr(null);
    setBusy(true);
    try {
      await api.updateCase(draftId, {
        case_name: form.case_name.trim() || suggestedName(),
        disaster_type: form.disaster_type,
        location: form.location,
        incident_date: form.incident_date || null,
        status: "active",
      });
      await refresh();
      nav(`/cases/${draftId}/recommendations`);
    } catch (e: any) {
      setErr(e.message ?? String(e));
      setBusy(false);
    }
  }

  // Discard soft-deletes the draft and returns to Prepare, so a recovery that
  // was started by mistake leaves nothing behind and the phase resets cleanly.
  async function discard() {
    if (!draftId) {
      nav("/prepare");
      return;
    }
    const ok = window.confirm(
      "Discard this case? Anything you entered here will be removed. You can always start again.",
    );
    if (!ok) return;
    setErr(null);
    setBusy(true);
    try {
      await api.deleteCase(draftId);
      await refresh();
      nav("/prepare");
    } catch (e: any) {
      setErr(e.message ?? String(e));
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="container" style={{ maxWidth: 620 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 620 }}>
      <BackButton to="/prepare" label="Prepare" />
      <h1 style={{ marginTop: 16 }}>Tell us what happened</h1>
      <p className="warm-note">
        Just the basics for now. Everything you type saves as you go, so you can
        step away and come back any time. You can add photos and documents in
        the next step.
      </p>
      <div className="card">
        <form onSubmit={submit}>
          <label id="disaster-label">What kind of disaster was it?</label>
          <div className="choice-grid" role="radiogroup" aria-labelledby="disaster-label">
            {DISASTERS.map((d) => (
              <button
                key={d.value}
                type="button"
                role="radio"
                aria-checked={form.disaster_type === d.value}
                className={`choice-card${form.disaster_type === d.value ? " selected" : ""}`}
                onClick={() => update("disaster_type", d.value)}
              >
                <span className="choice-title">{d.label}</span>
                <span className="choice-detail">{d.detail}</span>
              </button>
            ))}
          </div>

          <label>
            Where did it happen?{" "}
            <Hint text="We use this to match you with local emergency services and resources. We currently know Alberta best." />
          </label>
          <LocationAutocomplete
            value={form.location}
            onChange={(v) => update("location", v)}
          />

          <label>
            When did it happen?{" "}
            <Hint text="Optional - an estimate is fine. It helps us flag insurance deadlines that are coming up soon." />
          </label>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <button type="button" className="secondary chip-btn" onClick={() => update("incident_date", isoDaysAgo(0))}>
              Today
            </button>
            <button type="button" className="secondary chip-btn" onClick={() => update("incident_date", isoDaysAgo(1))}>
              Yesterday
            </button>
            <button type="button" className="secondary chip-btn" onClick={() => update("incident_date", isoDaysAgo(7))}>
              About a week ago
            </button>
          </div>
          <input
            type="date"
            value={form.incident_date}
            aria-label="Date of the incident"
            onChange={(e) => update("incident_date", e.target.value)}
          />

          <label>
            Name for this case (optional){" "}
            <Hint text="Just a label to find it later. We'll pick a sensible one if you leave this blank, and you can change it anytime." />
          </label>
          <input
            value={form.case_name}
            placeholder={suggestedName()}
            onChange={(e) => update("case_name", e.target.value)}
          />

          {err && <div className="error">{err}</div>}
          <div style={{ marginTop: 20 }}>
            <button type="submit" disabled={busy} className="big">
              {busy ? "Setting things up…" : "Continue"}
            </button>
          </div>
        </form>
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="button" className="link-btn danger-text" disabled={busy} onClick={discard}>
          Discard this case
        </button>
      </div>
    </div>
  );
}
