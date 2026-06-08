import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, CaseDocument, UserDocument } from "../api";

const DOC_TYPES = ["insurance_policy", "claim", "id", "deed", "receipt", "other"];

export default function Documents() {
  const { id } = useParams();
  const [caseDocs, setCaseDocs] = useState<CaseDocument[]>([]);
  const [library, setLibrary] = useState<UserDocument[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState("insurance_policy");
  const [showLibrary, setShowLibrary] = useState(false);

  function load() {
    if (!id) return;
    Promise.all([api.listCaseDocuments(id), api.listMyDocuments()])
      .then(([c, l]) => {
        setCaseDocs(c.documents);
        setLibrary(l.documents);
      })
      .catch((e) => setErr(String(e)));
  }

  useEffect(load, [id]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !id) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErr("Only PDF files are supported.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const { document } = await api.uploadDocument(file, docType);
      await api.attachDocumentToCase(id, document.id);
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function attachExisting(docId: string) {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      await api.attachDocumentToCase(id, docId);
      setShowLibrary(false);
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function detach(docId: string) {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      await api.detachDocumentFromCase(id, docId);
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const attachedIds = new Set(caseDocs.map((d) => d.id));
  const unattached = library.filter((d) => !attachedIds.has(d.id));

  return (
    <div className="container">
      <div className="row">
        <h1>Documents</h1>
        <span className="spacer" />
        <Link to={`/cases/${id}`}><button className="secondary">← Back</button></Link>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Upload a document</h3>
        <div className="grid grid-2">
          <div>
            <label>Document type</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>File (PDF only)</label>
            <input type="file" accept="application/pdf,.pdf" onChange={onUpload} disabled={busy} />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Only PDF files are supported.
            </p>
          </div>
        </div>
        {err && <div className="error">{err}</div>}

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <button
            className="secondary"
            onClick={() => setShowLibrary((s) => !s)}
            disabled={busy}
          >
            {showLibrary ? "Hide" : "Reuse from your library"} ({unattached.length})
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Already uploaded a document for another case? Attach it here instead of re-uploading.
          </p>
          {showLibrary && (
            <div className="grid grid-2" style={{ marginTop: 12 }}>
              {unattached.length === 0 && (
                <p className="muted">Nothing to reuse yet — your uploaded documents will show up here.</p>
              )}
              {unattached.map((d) => (
                <div key={d.id} className="card" style={{ margin: 0 }}>
                  <strong>{d.name}</strong>
                  <p className="muted" style={{ margin: "4px 0 8px", fontSize: 12 }}>
                    {d.doc_type ?? "—"}
                    {d.uploaded_at ? ` · ${new Date(d.uploaded_at).toLocaleDateString()}` : ""}
                  </p>
                  <button onClick={() => attachExisting(d.id)} disabled={busy}>Attach to this case</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <h3>Attached to this case ({caseDocs.length})</h3>
      {caseDocs.length === 0 && <p className="muted">No documents attached yet.</p>}
      <div className="grid grid-2">
        {caseDocs.map((d) => (
          <div key={d.id} className="card">
            <strong>{d.name}</strong>
            <p className="muted" style={{ margin: "4px 0 8px", fontSize: 12 }}>
              {d.doc_type ?? "—"}
              {d.uploaded_at ? ` · ${new Date(d.uploaded_at).toLocaleDateString()}` : ""}
            </p>
            <div className="row">
              {d.url && (
                <a href={d.url} target="_blank" rel="noreferrer">
                  <button className="secondary">Open</button>
                </a>
              )}
              <button className="secondary" onClick={() => detach(d.id)} disabled={busy}>
                Detach
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
