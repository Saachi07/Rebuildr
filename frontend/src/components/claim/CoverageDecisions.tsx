import { useState } from "react";
import { api, Case, CoverageDecision } from "../../api";
import { Modal, ConfirmDialog } from "../Modal";
import { useToast } from "../Toast";
import "../../styles/claims.css";

const DECISION_LABELS: Record<CoverageDecision["decision"], string> = {
  declined: "Declined",
  added: "Added",
  unsure: "Unsure",
};

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type FormState = {
  coverage: string;
  decision: CoverageDecision["decision"];
  note: string;
};

export default function CoverageDecisions({
  caseDoc,
  onChange,
}: {
  caseDoc?: Case | null;
  onChange?: (next: Case) => void;
}) {
  const toast = useToast();
  const [decisions, setDecisions] = useState<CoverageDecision[]>(caseDoc?.coverage_decisions ?? []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>({ coverage: "", decision: "declined", note: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  async function persist(next: CoverageDecision[]) {
    if (!caseDoc) return;
    setSaving(true);
    const previous = decisions;
    setDecisions(next);
    try {
      const r = await api.updateCase(caseDoc.id, { coverage_decisions: next });
      onChange?.(r.case);
    } catch (e: any) {
      setDecisions(previous);
      toast.show(e.message ?? "We couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!form.coverage.trim()) {
      toast.show("Please name the coverage.");
      return;
    }
    const entry: CoverageDecision = {
      coverage: form.coverage.trim(),
      decision: form.decision,
      note: form.note.trim() || null,
      noted_on: new Date().toISOString(),
    };
    await persist([...decisions, entry]);
    setForm({ coverage: "", decision: "declined", note: "" });
    setShowForm(false);
    toast.show("Coverage decision saved.");
  }

  async function doDelete(index: number) {
    setConfirmDelete(null);
    await persist(decisions.filter((_, i) => i !== index));
    toast.show("Coverage decision removed.");
  }

  return (
    <div>
      <p className="claim-intro">
        Write down any coverage you declined, added, or are unsure about. If a
        dispute comes up later, a dated note of what you chose at signup is the
        record that protects you.
      </p>

      <div className="row no-print" style={{ marginBottom: 14 }}>
        <button onClick={() => setShowForm(true)} disabled={!caseDoc}>Add coverage decision</button>
      </div>

      {decisions.length === 0 ? (
        <p className="muted-strong">Nothing recorded yet.</p>
      ) : (
        <div className="claim-list">
          {decisions.map((d, i) => (
            <div key={i} className="claim-entry">
              <div className="claim-entry-head">
                <strong>{d.coverage}</strong>
                <span className="badge">{DECISION_LABELS[d.decision]}</span>
                {d.noted_on && <span className="claim-entry-meta">Noted {formatDate(d.noted_on)}</span>}
              </div>
              {d.note && <p style={{ margin: "8px 0 0", fontSize: 15 }}>{d.note}</p>}
              <div className="claim-entry-actions no-print">
                <button className="secondary" onClick={() => setConfirmDelete(i)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)} label="Add coverage decision" maxWidth={480}>
          <h3 style={{ marginTop: 0 }}>Add coverage decision</h3>
          <label htmlFor="cov-name">Coverage name</label>
          <input
            id="cov-name"
            value={form.coverage}
            onChange={(e) => setForm((f) => ({ ...f, coverage: e.target.value }))}
            placeholder="For example, landscaping or sewer backup"
          />
          <label htmlFor="cov-decision">Decision</label>
          <select
            id="cov-decision"
            value={form.decision}
            onChange={(e) => setForm((f) => ({ ...f, decision: e.target.value as CoverageDecision["decision"] }))}
          >
            <option value="declined">Declined</option>
            <option value="added">Added</option>
            <option value="unsure">Unsure</option>
          </select>
          <label htmlFor="cov-note">Note (optional)</label>
          <textarea
            id="cov-note"
            rows={3}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Anything you want to remember about this choice"
          />
          <div className="row" style={{ marginTop: 16 }}>
            <span className="spacer" />
            <button className="secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
            <button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </Modal>
      )}

      {confirmDelete !== null && (
        <ConfirmDialog
          title="Remove this record?"
          body="It will be removed from your coverage decisions. You can add it again later."
          confirmLabel="Remove"
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
