import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, GeminiAnalysis, UserDocument } from "../api";
import { Spinner } from "../components/Skeleton";
import { BackButton } from "../components/BackButton";

export default function Documents() {
  const [docs, setDocs] = useState<UserDocument[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [summaryFor, setSummaryFor] = useState<UserDocument | null>(null);

  function load() {
    api.listMyDocuments().then((r) => setDocs(r.documents)).catch((e) => setErr(String(e)));
  }

  useEffect(load, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErr("Only PDF files are supported.");
      return;
    }
    setUploading(true);
    setErr(null);
    try {
      const { document } = await api.uploadDocument(file);
      // Auto-analyze. Don't fail the whole upload if analysis fails — the doc is saved.
      try {
        await api.analyzeDocument(document.id);
      } catch (e: any) {
        setErr(`Saved, but analysis didn't finish: ${e.message ?? e}`);
      }
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setUploading(false);
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
    if (!confirm("Delete this document? This can't be undone.")) return;
    try {
      await api.deleteDocument(id);
      load();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  const latestCaseHref = "/dashboard";

  return (
    <div className="container">
      <BackButton />
      <div className="row" style={{ marginTop: 16 }}>
        <h1 style={{ margin: 0 }}>Your documents</h1>
      </div>
      <p className="warm-note" style={{ marginTop: 8 }}>
        Upload your insurance policy, claims, ID, deeds — anything you might
        need to reference. We'll read each one and pull out the important bits.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a document</h3>
        <p className="muted-strong" style={{ marginTop: 0, fontSize: 14 }}>
          Pick a PDF. We'll save it and analyze it automatically — no extra
          steps. You'll see a Summary button on the document when it's ready.
        </p>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={onUpload}
          disabled={uploading}
        />
        {uploading && <p className="muted-strong" style={{ marginTop: 10 }}>Saving and reading your document…</p>}
        {err && <div className="error">{err}</div>}
      </div>

      <h3>You have {docs?.length ?? 0} document{docs?.length === 1 ? "" : "s"}</h3>
      {docs === null && !err && <Spinner />}
      {docs && docs.length === 0 && (
        <p className="muted-strong">Nothing here yet. Upload one above to get started.</p>
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
                <td>{d.doc_type ? <span className="badge">{prettyDocType(d.doc_type)}</span> : <span className="muted">analyzing…</span>}</td>
                <td className="muted-strong">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : "—"}</td>
                <td className="actions">
                  <button
                    className="secondary"
                    onClick={() => openDoc(d.id)}
                    disabled={opening === d.id}
                  >
                    {opening === d.id ? "Opening…" : "Open"}
                  </button>{" "}
                  <button
                    className="secondary"
                    onClick={() => setSummaryFor(d)}
                    disabled={!d.gemini_analysis}
                    title={d.gemini_analysis ? "View the extracted summary" : "Summary not ready yet"}
                  >
                    Summary
                  </button>{" "}
                  <button className="secondary" onClick={() => remove(d.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row" style={{ marginTop: 32 }}>
        <span className="spacer" />
        <Link to="/dashboard"><button className="secondary">Inventory →</button></Link>
        <Link to={latestCaseHref} style={{ marginLeft: 8 }}>
          <button>See your plan →</button>
        </Link>
      </div>

      {summaryFor && (
        <SummaryModal doc={summaryFor} onClose={() => setSummaryFor(null)} />
      )}
    </div>
  );
}

function prettyDocType(t: string): string {
  if (!t) return "";
  return t.replace(/_/g, " ");
}

function SummaryModal({ doc, onClose }: { doc: UserDocument; onClose: () => void }) {
  const analysis = doc.gemini_analysis;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0 }}>{doc.name}</h2>
          <span className="spacer" />
          <button className="ghost" onClick={onClose} aria-label="Close">×</button>
        </div>
        {doc.doc_type && (
          <p>
            <span className="badge">{prettyDocType(doc.doc_type)}</span>
          </p>
        )}
        {!analysis && <p className="muted-strong">No summary yet.</p>}
        {analysis && <AnalysisView analysis={analysis} />}
        {doc.doc_type === "other" && (
          <div className="notice" style={{ marginTop: 12 }}>
            This doesn't look like an insurance or disaster-recovery
            document, so we won't use it when generating your plan. It's still
            safely saved.
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: GeminiAnalysis }) {
  const entries = Object.entries(analysis.key_fields ?? {});
  return (
    <div style={{ marginTop: 12 }}>
      {analysis.summary && (
        <p style={{ marginTop: 0, fontSize: 15, lineHeight: 1.55 }}>{analysis.summary}</p>
      )}
      {entries.length > 0 && (
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>Field</th><th>Value</th></tr>
          </thead>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td>{k.replace(/_/g, " ")}</td>
                <td>{typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
