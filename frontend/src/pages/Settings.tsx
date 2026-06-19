import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Case } from "../api";
import { PageBack } from "../lib/PageBackContext";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth/AuthContext";

export default function Settings() {
  const toast = useToast();
  const nav = useNavigate();
  const { signOut } = useAuth();

  const [err, setErr] = useState<string | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Delete account
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Deleted cases
  const [deletedCases, setDeletedCases] = useState<Case[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  function loadDeleted() {
    api.listDeletedCases()
      .then((r) => setDeletedCases(r.cases))
      .catch(() => setDeletedCases([]));
  }

  useEffect(loadDeleted, []);

  async function exportData() {
    setExporting(true);
    setErr(null);
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rebuildr-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.show("Your data has been downloaded.");
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setErr(null);
    try {
      const res = await api.deleteAccount();
      if (res.warnings && res.warnings.length > 0) {
        toast.show(res.warnings.join(" "));
      }
      await signOut();
      nav("/");
    } catch (e: any) {
      setErr(e.message ?? String(e));
      setDeleting(false);
    }
  }

  async function restore(id: string) {
    setRestoring(id);
    setErr(null);
    try {
      await api.restoreCase(id);
      loadDeleted();
      toast.show("Case restored.");
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <PageBack to="/dashboard" label="Dashboard" />
      <h1 style={{ marginTop: 16 }}>Settings</h1>

      {err && <div className="error">{err}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Export my data</h3>
        <p className="muted-strong" style={{ marginTop: 0 }}>
          Download everything you own in one file: your profile, cases,
          inventory, documents, communications, and expenses. Keep a copy
          somewhere safe. It is useful evidence if you ever have to dispute a
          coverage decision.
        </p>
        <button onClick={exportData} disabled={exporting}>
          {exporting ? "Preparing your file..." : "Download my data"}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Restore a deleted case</h3>
        <p className="muted-strong" style={{ marginTop: 0 }}>
          Cases you removed are kept here for a while in case you change your
          mind.
        </p>
        {deletedCases === null && <p className="muted">Loading...</p>}
        {deletedCases !== null && deletedCases.length === 0 && (
          <p className="muted">No deleted cases.</p>
        )}
        {deletedCases !== null && deletedCases.length > 0 && (
          <table className="tbl tbl-cards">
            <thead>
              <tr>
                <th>Case</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deletedCases.map((c) => (
                <tr key={c.id}>
                  <td data-label="Case"><strong>{c.case_name}</strong></td>
                  <td data-label="Type">{c.disaster_type}</td>
                  <td className="actions">
                    <button
                      className="secondary"
                      disabled={restoring === c.id}
                      onClick={() => restore(c.id)}
                    >
                      {restoring === c.id ? "Restoring..." : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ borderLeft: "4px solid var(--danger)" }}>
        <h3 style={{ marginTop: 0 }}>Delete my account</h3>
        <p className="muted-strong" style={{ marginTop: 0 }}>
          This permanently removes your account and everything in it. Consider
          exporting your data first. This cannot be undone.
        </p>
        <button className="danger" onClick={() => { setShowDelete(true); setConfirmText(""); }}>
          Delete my account
        </button>
      </div>

      {showDelete && (
        <div className="modal-backdrop" onClick={() => !deleting && setShowDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Are you sure?</h2>
            <p className="muted-strong">
              This will permanently delete your account and all of your cases,
              inventory, documents, and records. There is no way to get it back.
            </p>
            <label htmlFor="confirm-delete">Type DELETE to confirm</label>
            <input
              id="confirm-delete"
              value={confirmText}
              autoFocus
              placeholder="DELETE"
              onChange={(e) => setConfirmText(e.target.value)}
            />
            <div className="row" style={{ marginTop: 18 }}>
              <button
                className="secondary"
                onClick={() => setShowDelete(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <span className="spacer" />
              <button
                className="danger"
                disabled={confirmText !== "DELETE" || deleting}
                onClick={confirmDelete}
              >
                {deleting ? "Deleting..." : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
