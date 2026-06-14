import { useState } from "react";
import { api, Case } from "../../api";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import "../../styles/claims.css";

function isClosed(c?: Case | null): boolean {
  return Boolean(c && (c.status === "closed" || c.closed_at));
}

export default function CloseCaseButton({
  caseDoc,
  onChange,
}: {
  caseDoc?: Case | null;
  onChange?: (next: Case) => void;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!caseDoc) return null;
  const closed = isClosed(caseDoc);

  async function close() {
    if (!caseDoc) return;
    setBusy(true);
    try {
      const r = await api.closeCase(caseDoc.id);
      onChange?.(r.case);
      setConfirming(false);
      toast.show("Case closed. You can reopen it any time.");
    } catch (e: any) {
      toast.show(e.message ?? "We couldn't close the case. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!caseDoc) return;
    setBusy(true);
    try {
      const r = await api.reopenCase(caseDoc.id);
      onChange?.(r.case);
      toast.show("Case reopened.");
    } catch (e: any) {
      toast.show(e.message ?? "We couldn't reopen the case. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (closed) {
    return (
      <button className="secondary no-print" onClick={reopen} disabled={busy}>
        {busy ? "Working…" : "Reopen case"}
      </button>
    );
  }

  return (
    <>
      <button className="secondary no-print" onClick={() => setConfirming(true)} disabled={busy}>
        Close case
      </button>
      {confirming && (
        <Modal onClose={() => setConfirming(false)} label="Close this case?" maxWidth={440}>
          <h3 style={{ marginTop: 0 }}>Close this case?</h3>
          <p className="muted-strong" style={{ marginTop: 0 }}>
            Closing marks the case as resolved. It stays available to read, and
            all your records, photos, and documents stay safe. You can reopen it
            any time if something changes.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <span className="spacer" />
            <button className="secondary" onClick={() => setConfirming(false)} disabled={busy}>Keep open</button>
            <button onClick={close} disabled={busy}>{busy ? "Closing…" : "Close case"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export { isClosed };
