import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, GeminiAnalysis, UserDocument } from "../api";
import { Spinner } from "../components/Skeleton";

export default function Documents() {
  const [docs, setDocs] = useState<UserDocument[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [justSaved, setJustSaved] = useState<UserDocument | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  function load() {
    api.listMyDocuments().then((r) => setDocs(r.documents)).catch((e) => setErr(String(e)));
  }

  useEffect(load, []);

  async function save() {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErr("Only PDF files are supported.");
      return;
    }
    setBusy(true);
    setErr(null);
    setJustSaved(null);
    try {
      const { document } = await api.uploadDocument(file);
      setJustSaved(document);
      setFile(null);
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    if (!justSaved) return;
    setAnalyzing(true);
    setErr(null);
    try {
      const { document } = await api.analyzeDocument(justSaved.id);
      setJustSaved(document);
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  async function openDoc(id: string) {
    setOpening(id);
    try {
      const { url } = await api.getDocumentUrl(id);
      window.open(url, "_blank", "noreferrer");
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setOpening(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this document?")) return;
    try {
      await api.deleteDocument(id);
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  return (
    <div className="container">
      <div className="row">
        <h1>Documents</h1>
        <span className="spacer" />
        <Link to="/dashboard"><button className="secondary">← Dashboard</button></Link>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Upload a document</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Save it first, then run analysis to extract a summary and key fields.
        </p>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setJustSaved(null); }}
          disabled={busy || analyzing}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={save} disabled={!file || busy || analyzing}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            className="secondary"
            onClick={analyze}
            disabled={!justSaved || analyzing}
          >
            {analyzing ? "Analyzing…" : "Analyze"}
          </button>
        </div>
        {err && <div className="error">{err}</div>}

        {justSaved && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div className="row">
              <strong>{justSaved.name}</strong>
              {justSaved.doc_type && <span className="badge">{justSaved.doc_type}</span>}
            </div>
            {justSaved.doc_type === "other" && (
              <div style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "var(--warning-bg, #fffbeb)",
                border: "1px solid var(--warning-border, #f59e0b)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--warning-text, #92400e)",
              }}>
                This doesn't look like an insurance or disaster-recovery document.
                It's saved but won't be used in task recommendations.
              </div>
            )}
            {justSaved.gemini_analysis && (
              <AnalysisView analysis={justSaved.gemini_analysis} />
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <span className="spacer" />
              <Link to="/dashboard"><button>Next →</button></Link>
            </div>
          </div>
        )}
      </div>

      <h3>Your documents ({docs?.length ?? 0})</h3>
      {docs === null && !err && <Spinner />}
      {docs && docs.length === 0 && (
        <p className="muted">No documents uploaded yet.</p>
      )}
      {docs && docs.length > 0 && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.doc_type ? <span className="badge">{d.doc_type}</span> : <span className="muted">—</span>}</td>
                <td className="muted">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : "—"}</td>
                <td className="actions">
                  <button
                    className="secondary"
                    onClick={() => openDoc(d.id)}
                    disabled={opening === d.id}
                  >
                    {opening === d.id ? "Opening…" : "Open"}
                  </button>{" "}
                  <button className="secondary" onClick={() => remove(d.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: GeminiAnalysis }) {
  const entries = Object.entries(analysis.key_fields ?? {});
  return (
    <div style={{ marginTop: 12 }}>
      {analysis.summary && (
        <p style={{ marginTop: 0, fontSize: 14 }}>{analysis.summary}</p>
      )}
      {entries.length > 0 && (
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>Field</th><th>Value</th></tr>
          </thead>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
