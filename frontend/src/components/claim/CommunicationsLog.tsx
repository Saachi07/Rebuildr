import { useEffect, useState } from "react";
import { api, Communication, CommChannel, CommKind } from "../../api";
import { Modal, ConfirmDialog } from "../Modal";
import { Spinner } from "../Skeleton";
import { useToast } from "../Toast";
import "../../styles/claims.css";

const CHANNEL_LABELS: Record<CommChannel, string> = {
  phone: "Phone",
  email: "Email",
  in_person: "In person",
  mail: "Mail",
  other: "Other",
};

const KIND_LABELS: Record<CommKind, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  discrepancy: "Discrepancy",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Turn an ISO timestamp into the value a datetime-local input expects.
function toLocalInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type FormState = {
  occurred_at: string;
  contact_name: string;
  organization: string;
  channel: CommChannel;
  kind: CommKind;
  summary: string;
  insurer_statement: string;
  follow_up: string;
};

function emptyForm(): FormState {
  return {
    occurred_at: toLocalInput(),
    contact_name: "",
    organization: "",
    channel: "phone",
    kind: "note",
    summary: "",
    insurer_statement: "",
    follow_up: "",
  };
}

export default function CommunicationsLog({ caseId }: { caseId: string }) {
  const toast = useToast();
  const [entries, setEntries] = useState<Communication[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Communication | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Communication | null>(null);

  async function load() {
    setErr(null);
    try {
      const r = await api.listCommunications(caseId);
      const sorted = [...r.communications].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      );
      setEntries(sorted);
    } catch (e: any) {
      setErr(e.message ?? String(e));
      setEntries([]);
    }
  }

  useEffect(() => { load(); }, [caseId]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(c: Communication) {
    setEditing(c);
    setForm({
      occurred_at: toLocalInput(c.occurred_at),
      contact_name: c.contact_name ?? "",
      organization: c.organization ?? "",
      channel: c.channel ?? "phone",
      kind: c.kind,
      summary: c.summary,
      insurer_statement: c.insurer_statement ?? "",
      follow_up: c.follow_up ?? "",
    });
    setShowForm(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.summary.trim()) {
      toast.show("Please add a short summary of what happened.");
      return;
    }
    setSaving(true);
    const body: Partial<Communication> = {
      occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : new Date().toISOString(),
      contact_name: form.contact_name.trim() || null,
      organization: form.organization.trim() || null,
      channel: form.channel,
      kind: form.kind,
      summary: form.summary.trim(),
      insurer_statement: form.kind === "discrepancy" ? form.insurer_statement.trim() || null : null,
      follow_up: form.follow_up.trim() || null,
    };
    try {
      if (editing) {
        await api.updateCommunication(editing.id, body);
        toast.show("Entry updated.");
      } else {
        await api.createCommunication(caseId, body);
        toast.show("Entry saved.");
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      toast.show(e.message ?? "We couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(c: Communication) {
    setConfirmDelete(null);
    try {
      await api.deleteCommunication(c.id);
      toast.show("Entry removed.");
      await load();
    } catch (e: any) {
      toast.show(e.message ?? "We couldn't remove that. Please try again.");
    }
  }

  if (entries === null) return <Spinner />;

  return (
    <div>
      <p className="claim-intro">
        Keep a record of every call, email, and meeting about your claim. If an
        insurer changes its story later, a dated log of what you were told is
        your proof. Note any discrepancy as soon as you notice it.
      </p>

      <div className="row no-print" style={{ marginBottom: 14 }}>
        <button onClick={openAdd}>Add entry</button>
      </div>

      {err && <div className="error">{err}</div>}

      {entries.length === 0 ? (
        <p className="muted-strong">
          No entries yet. Add one after your next call or email so you have a
          paper trail.
        </p>
      ) : (
        <div className="claim-list">
          {entries.map((c) => (
            <div key={c.id} className="claim-entry">
              <div className="claim-entry-head">
                <strong>{KIND_LABELS[c.kind]}</strong>
                <span className="claim-entry-meta">{formatWhen(c.occurred_at)}</span>
                {c.channel && <span className="badge">{CHANNEL_LABELS[c.channel]}</span>}
              </div>
              {(c.contact_name || c.organization) && (
                <p className="claim-entry-meta" style={{ margin: "4px 0 0" }}>
                  {[c.contact_name, c.organization].filter(Boolean).join(" · ")}
                </p>
              )}

              {c.kind === "discrepancy" ? (
                <div className="discrepancy-grid">
                  <div className="discrepancy-cell them">
                    <p className="discrepancy-label">What they told me</p>
                    <p style={{ margin: 0 }}>{c.insurer_statement || "Not recorded"}</p>
                  </div>
                  <div className="discrepancy-cell you">
                    <p className="discrepancy-label">What actually happened / what my policy says</p>
                    <p style={{ margin: 0 }}>{c.summary}</p>
                  </div>
                </div>
              ) : (
                <p style={{ margin: "8px 0 0", fontSize: 15 }}>{c.summary}</p>
              )}

              {c.follow_up && (
                <p className="muted-strong" style={{ margin: "8px 0 0", fontSize: 14 }}>
                  Follow up: {c.follow_up}
                </p>
              )}

              <div className="claim-entry-actions no-print">
                <button className="secondary" onClick={() => openEdit(c)}>Edit</button>
                <button className="secondary" onClick={() => setConfirmDelete(c)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)} label={editing ? "Edit entry" : "Add entry"} maxWidth={520}>
          <h3 style={{ marginTop: 0 }}>{editing ? "Edit entry" : "Add entry"}</h3>

          <label htmlFor="comm-when">Date and time</label>
          <input
            id="comm-when"
            type="datetime-local"
            value={form.occurred_at}
            onChange={(e) => set("occurred_at", e.target.value)}
          />

          <div className="grid grid-2" style={{ gap: 12 }}>
            <div>
              <label htmlFor="comm-contact">Contact name</label>
              <input
                id="comm-contact"
                value={form.contact_name}
                onChange={(e) => set("contact_name", e.target.value)}
                placeholder="Who you spoke with"
              />
            </div>
            <div>
              <label htmlFor="comm-org">Organization</label>
              <input
                id="comm-org"
                value={form.organization}
                onChange={(e) => set("organization", e.target.value)}
                placeholder="Insurer, broker, agency"
              />
            </div>
          </div>

          <div className="grid grid-2" style={{ gap: 12 }}>
            <div>
              <label htmlFor="comm-channel">Channel</label>
              <select id="comm-channel" value={form.channel} onChange={(e) => set("channel", e.target.value as CommChannel)}>
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="in_person">In person</option>
                <option value="mail">Mail</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="comm-kind">Kind</label>
              <select id="comm-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as CommKind)}>
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
                <option value="discrepancy">Discrepancy</option>
              </select>
            </div>
          </div>

          {form.kind === "discrepancy" && (
            <>
              <label htmlFor="comm-statement">What they told me</label>
              <textarea
                id="comm-statement"
                rows={2}
                value={form.insurer_statement}
                onChange={(e) => set("insurer_statement", e.target.value)}
                placeholder="The insurer said..."
              />
            </>
          )}

          <label htmlFor="comm-summary">
            {form.kind === "discrepancy" ? "What actually happened / what my policy says" : "Summary"}
          </label>
          <textarea
            id="comm-summary"
            rows={3}
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="A short summary of what was said or agreed"
          />

          <label htmlFor="comm-follow">Follow up (optional)</label>
          <input
            id="comm-follow"
            value={form.follow_up}
            onChange={(e) => set("follow_up", e.target.value)}
            placeholder="Anything you need to do next"
          />

          <div className="row" style={{ marginTop: 16 }}>
            <span className="spacer" />
            <button className="secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
            <button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save entry"}</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Remove this entry?"
          body="It will be removed from your communications log. You can always add it again later."
          confirmLabel="Remove"
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
