import { useState } from "react";
import { api, Case } from "../../api";
import { useToast } from "../Toast";
import "../../styles/claims.css";

// The first-72-hours guidance, confirmed correct with a stakeholder. Keys are
// stable so saved state survives copy edits to the labels.
const STEPS: { key: string; label: string }[] = [
  { key: "document_before_cleanup", label: "Document everything before you clean up" },
  { key: "no_contractor_before_adjuster", label: "Do not sign with a contractor before the adjuster assesses the damage" },
  { key: "keep_receipts", label: "Keep all receipts" },
  { key: "report_to_insurer", label: "Report the loss to your insurer" },
  { key: "find_safe_place", label: "Find a safe place to stay" },
];

export default function FirstStepsChecklist({
  caseDoc,
  onChange,
}: {
  caseDoc?: Case | null;
  onChange?: (next: Case) => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<Record<string, boolean>>(caseDoc?.checklist_state ?? {});
  const [saving, setSaving] = useState(false);

  async function toggle(key: string) {
    if (!caseDoc) return;
    const next = { ...state, [key]: !state[key] };
    setState(next);
    setSaving(true);
    try {
      const r = await api.updateCase(caseDoc.id, { checklist_state: next });
      onChange?.(r.case);
    } catch (e: any) {
      // Roll back the toggle so the box reflects what is actually saved.
      setState(state);
      toast.show(e.message ?? "We couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const doneCount = STEPS.filter((s) => state[s.key]).length;

  return (
    <div className="card first-steps">
      <div className="row" style={{ alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>First steps</h3>
        <span className="spacer" />
        <span className="claim-entry-meta">{doneCount} of {STEPS.length} done</span>
      </div>
      <p className="claim-intro" style={{ marginTop: 8 }}>
        The most important things to do in the first few days. Check them off as
        you go.
      </p>
      {STEPS.map((s) => {
        const done = Boolean(state[s.key]);
        return (
          <label key={s.key} className={`check${done ? " done" : ""}`}>
            <input
              type="checkbox"
              checked={done}
              disabled={saving || !caseDoc}
              onChange={() => toggle(s.key)}
            />
            <span>{s.label}</span>
          </label>
        );
      })}
    </div>
  );
}
