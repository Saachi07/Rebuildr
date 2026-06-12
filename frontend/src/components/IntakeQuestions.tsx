import { useEffect, useState } from "react";
import { api } from "../api";

// Optional intake questions, shown at the end of the recovery plan. The
// option codes mirror backend/app/services/tags.py exactly: the backend
// derives semantic tags from these numbers, and the recommender uses the
// tags for eligibility and matching. Answering also triggers a search of
// curated assistance sources for newly matching programs.

type Answers = Record<string, number | boolean | undefined>;

type Choice = { value: number; label: string };
type ChoiceQuestion = { key: string; label: string; choices: Choice[] };

const CHOICE_QUESTIONS: ChoiceQuestion[] = [
  {
    key: "housing",
    label: "Where are you living right now?",
    choices: [
      { value: 0, label: "In my own home" },
      { value: 1, label: "Displaced from a home I own" },
      { value: 2, label: "In a place I rent" },
      { value: 3, label: "Displaced from a place I rented" },
      { value: 4, label: "On reserve or a Metis settlement" },
      { value: 5, label: "I need shelter right now" },
    ],
  },
  {
    key: "insurance",
    label: "Do you have insurance that covers this?",
    choices: [
      { value: 0, label: "Yes" },
      { value: 1, label: "No" },
      { value: 2, label: "I'm not sure" },
    ],
  },
  {
    key: "income_affected",
    label: "Has your income been affected?",
    choices: [
      { value: 0, label: "Not really" },
      { value: 1, label: "Somewhat disrupted" },
      { value: 2, label: "Severely disrupted" },
      { value: 3, label: "I'm on income assistance" },
    ],
  },
  {
    key: "already_applied",
    label: "Have you applied for anything yet?",
    choices: [
      { value: 0, label: "Not yet" },
      { value: 1, label: "An insurance claim" },
      { value: 2, label: "An aid program" },
      { value: 3, label: "Both" },
    ],
  },
  {
    key: "has_id",
    label: "Do you still have your ID documents?",
    choices: [
      { value: 1, label: "Yes" },
      { value: 0, label: "No, they were lost or destroyed" },
    ],
  },
];

const FLAG_QUESTIONS: { key: string; label: string }[] = [
  { key: "has_kids", label: "Children in the household" },
  { key: "has_seniors", label: "Seniors in the household" },
  { key: "has_disability", label: "Someone with a disability" },
  { key: "has_pets", label: "Pets" },
];

export function IntakeQuestions({
  caseId,
  onPlanRefresh,
}: {
  caseId: string;
  onPlanRefresh: () => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getCase(caseId);
        if (cancelled) return;
        const existing = (r.case.intake_answers ?? {}) as Answers;
        setAnswers(existing);
        // Open the form for newcomers; keep it tucked away once answered.
        setOpen(Object.keys(existing).length === 0);
      } catch {
        setOpen(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  function setAnswer(key: string, value: number | boolean | undefined) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const intake: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(answers)) {
        if (v !== undefined && v !== null) intake[k] = v;
      }
      await api.updateCase(caseId, { intake_answers: intake });
    } catch (e: any) {
      setSaving(false);
      setError("We couldn't save your answers. Please try again in a moment.");
      return;
    }
    setSaving(false);

    // The payoff: search curated assistance sources with what they just
    // shared, then rebuild the plan. Best-effort; the answers are already
    // saved either way.
    setSearching(true);
    let found = 0;
    try {
      const result = await api.scrapePrograms(caseId);
      found = result.programs_added;
    } catch {
      // Scraping unavailable is fine; the answers still sharpen the plan.
    }
    try {
      await onPlanRefresh();
    } catch {
      /* plan reload is best-effort here */
    }
    setSearching(false);
    setOpen(false);
    setMessage(
      found > 0
        ? `Thank you. We found ${found} new program${found === 1 ? "" : "s"} that may fit you and refreshed your plan with them.`
        : "Thank you. We've refreshed your plan with what you shared.",
    );
  }

  if (!loaded) return null;

  return (
    <div className="card" style={{ borderLeft: "4px solid #3a7d44", marginTop: 16 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>A few optional questions</h3>
        <span className="spacer" />
        {!open && (
          <button className="secondary" onClick={() => { setOpen(true); setMessage(null); }}>
            {Object.keys(answers).length > 0 ? "Update answers" : "Answer now"}
          </button>
        )}
      </div>
      <p className="muted-strong" style={{ margin: "8px 0 0", fontSize: 14 }}>
        Answer what you like and skip the rest. Each answer helps us search
        for more programs that fit your situation, watch the right
        deadlines, and sharpen your to-do list.
      </p>

      {message && (
        <p style={{ marginTop: 10, fontSize: 14, color: "#3a7d44" }}>{message}</p>
      )}
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {open && (
        <div style={{ marginTop: 12 }}>
          {CHOICE_QUESTIONS.map((q) => (
            <div key={q.key} style={{ margin: "12px 0" }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {q.label}
              </label>
              <select
                value={answers[q.key] === undefined ? "" : String(answers[q.key])}
                onChange={(e) =>
                  setAnswer(q.key, e.target.value === "" ? undefined : Number(e.target.value))
                }
              >
                <option value="">Prefer not to say</option>
                {q.choices.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          ))}

          <div style={{ margin: "12px 0" }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              Does any of this describe your household?
            </label>
            {FLAG_QUESTIONS.map((q) => (
              <label key={q.key} style={{ display: "block", fontSize: 14, margin: "4px 0" }}>
                <input
                  type="checkbox"
                  checked={Boolean(answers[q.key])}
                  onChange={(e) => setAnswer(q.key, e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                {q.label}
              </label>
            ))}
          </div>

          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button onClick={save} disabled={saving || searching}>
              {saving
                ? "Saving your answers…"
                : searching
                  ? "Searching for programs that fit you…"
                  : "Save and improve my plan"}
            </button>
            <button
              className="secondary"
              onClick={() => setOpen(false)}
              disabled={saving || searching}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
