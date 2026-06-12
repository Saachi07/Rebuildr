import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Modal } from "./Modal";

// Optional intake questions. The option codes mirror
// backend/app/services/tags.py exactly: the backend derives semantic tags
// from these numbers, and the recommender uses the tags for eligibility and
// matching. Answering also triggers a search of curated assistance sources.
//
// These are a bonus, never a requirement: they live behind a button and open
// in a modal, one question at a time, and every question can be skipped.

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

const TOTAL_STEPS = CHOICE_QUESTIONS.length + 1; // +1 for the household step

export type ResolvedHint = {
  question_id: string;
  copy: string;
  would_unlock: string[];
  to: string;
  linkLabel: string;
};

// If someone tells us they need shelter tonight, the only right response is
// immediate help — not "thanks, we've refreshed your plan".
function ShelterEscalation() {
  return (
    <div className="shelter-panel" role="alert">
      <strong>You said you need shelter right now — that comes first.</strong>
      <p style={{ margin: "8px 0" }}>
        These lines are free, 24/7, and can find you a safe place tonight:
      </p>
      <div className="row" style={{ gap: 8 }}>
        <a href="tel:211"><button className="danger">Call 211 (Alberta)</button></a>
        <a href="tel:18008636582"><button className="secondary">Red Cross 1-800-863-6582</button></a>
        <Link to="/emergency"><button className="secondary">All emergency contacts</button></Link>
      </div>
      <p className="muted-strong" style={{ margin: "8px 0 0", fontSize: 13 }}>
        You can keep answering below, or come back to this anytime.
      </p>
    </div>
  );
}

function QuestionStepper({
  initial,
  onDone,
  onClose,
}: {
  initial: Answers;
  onDone: (answers: Answers) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initial);
  const [finishing, setFinishing] = useState(false);

  const isFlagStep = step === CHOICE_QUESTIONS.length;
  const q = isFlagStep ? null : CHOICE_QUESTIONS[step];

  function setAnswer(key: string, value: number | boolean | undefined) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function finish(current: Answers) {
    setFinishing(true);
    try {
      await onDone(current);
    } finally {
      setFinishing(false);
    }
  }

  function next() {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else finish(answers);
  }

  function skip() {
    if (q) setAnswer(q.key, undefined);
    next();
  }

  return (
    <Modal onClose={onClose} label="Optional questions" maxWidth={520}>
      <div className="row" style={{ alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>
          {isFlagStep ? "Last one — your household" : `Question ${step + 1} of ${TOTAL_STEPS}`}
        </h3>
        <span className="spacer" />
        <button className="ghost" onClick={onClose} aria-label="Close without finishing">×</button>
      </div>
      <p className="muted-strong" style={{ margin: "6px 0 14px", fontSize: 13 }}>
        Every question is optional — skip anything you don't want to answer.
      </p>

      {q && (
        <fieldset className="radio-group">
          <legend>{q.label}</legend>
          {q.choices.map((c) => (
            <label key={c.value} className="radio-row">
              <input
                type="radio"
                name={q.key}
                checked={answers[q.key] === c.value}
                onChange={() => setAnswer(q.key, c.value)}
              />
              {c.label}
            </label>
          ))}
          <label className="radio-row muted-strong">
            <input
              type="radio"
              name={q.key}
              checked={answers[q.key] === undefined}
              onChange={() => setAnswer(q.key, undefined)}
            />
            Prefer not to say
          </label>
        </fieldset>
      )}

      {q?.key === "housing" && answers["housing"] === 5 && <ShelterEscalation />}

      {isFlagStep && (
        <fieldset className="radio-group">
          <legend>Does any of this describe your household? Check all that apply.</legend>
          {FLAG_QUESTIONS.map((f) => (
            <label key={f.key} className="radio-row">
              <input
                type="checkbox"
                checked={Boolean(answers[f.key])}
                onChange={(e) => setAnswer(f.key, e.target.checked)}
              />
              {f.label}
            </label>
          ))}
        </fieldset>
      )}

      <div className="row" style={{ marginTop: 18, gap: 8 }}>
        {step > 0 && (
          <button className="secondary" onClick={() => setStep(step - 1)} disabled={finishing}>
            Back
          </button>
        )}
        <span className="spacer" />
        {!isFlagStep && (
          <button className="secondary" onClick={skip} disabled={finishing}>
            Skip
          </button>
        )}
        <button onClick={next} disabled={finishing}>
          {finishing
            ? "Improving your plan…"
            : step === TOTAL_STEPS - 1
              ? "Finish"
              : "Next"}
        </button>
      </div>
    </Modal>
  );
}

// One merged "make it personal" card: the recommender's hints and the
// optional questions used to compete for attention as two separate asks.
export function PersonalizeCard({
  caseId,
  hints,
  onPlanRefresh,
}: {
  caseId: string;
  hints: ResolvedHint[];
  onPlanRefresh: () => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [hasAnswers, setHasAnswers] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
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
        setHasAnswers(Object.keys(existing).length > 0);
      } catch {
        /* card still renders without prior answers */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  async function saveAnswers(next: Answers) {
    setError(null);
    setMessage(null);
    const intake: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      if (v !== undefined && v !== null) intake[k] = v;
    }
    try {
      await api.updateCase(caseId, { intake_answers: intake });
    } catch {
      setError("We couldn't save your answers. Please try again in a moment.");
      setOpen(false);
      return;
    }
    setAnswers(next);
    setHasAnswers(Object.keys(intake).length > 0);

    // The payoff: search curated assistance sources with what they just
    // shared, then rebuild the plan. Best-effort; answers are saved already.
    let found = 0;
    try {
      const result = await api.scrapePrograms(caseId);
      found = result.programs_added;
    } catch {
      /* scraping unavailable is fine */
    }
    try {
      await onPlanRefresh();
    } catch {
      /* plan reload is best-effort here */
    }
    setOpen(false);
    setMessage(
      found > 0
        ? `Thank you. We found ${found} new program${found === 1 ? "" : "s"} that may fit you and refreshed your plan with them.`
        : "Thank you. We've refreshed your plan with what you shared.",
    );
  }

  if (!loaded) return null;

  return (
    <div className="card accent-card" style={{ marginTop: 16 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Make your plan more personal <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>(optional)</span></h3>
        <span className="spacer" />
        <button className="secondary" onClick={() => { setOpen(true); setMessage(null); }}>
          {hasAnswers ? "Update your answers" : "Answer a few questions"}
        </button>
      </div>
      <p className="muted-strong" style={{ margin: "8px 0 0", fontSize: 14 }}>
        If you have a few minutes, each answer helps us find more programs
        that fit your situation. Skip anything — your plan works either way.
      </p>

      {message && (
        <p style={{ marginTop: 10, fontSize: 14, color: "var(--ok)" }}>{message}</p>
      )}
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {hints.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {hints.map((h) => (
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
              <Link to={h.to}>
                <button className="secondary" style={{ whiteSpace: "nowrap" }}>{h.linkLabel}</button>
              </Link>
            </div>
          ))}
        </div>
      )}

      {open && (
        <QuestionStepper
          initial={answers}
          onDone={saveAnswers}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
