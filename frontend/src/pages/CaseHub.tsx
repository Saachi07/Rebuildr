import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Case, ClaimStage, UserDocument } from "../api";
import { Spinner } from "../components/Skeleton";
import { BackButton } from "../components/BackButton";
import { useCases } from "../lib/CasesContext";
import { useToast } from "../components/Toast";
import ClaimLifecycle from "../components/claim/ClaimLifecycle";
import ClaimQuickCard from "../components/claim/ClaimQuickCard";
import FirstStepsChecklist from "../components/claim/FirstStepsChecklist";
import CommunicationsLog from "../components/claim/CommunicationsLog";
import AleTracker from "../components/claim/AleTracker";
import CoverageDecisions from "../components/claim/CoverageDecisions";
import CoverageGap from "../components/claim/CoverageGap";
import KeyContacts from "../components/claim/KeyContacts";
import ReferralChain from "../components/claim/ReferralChain";
import CloseCaseButton, { isClosed } from "../components/claim/CloseCaseButton";
import "../styles/claims.css";

type Tab = "overview" | "communications" | "expenses" | "coverage";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "communications", label: "Communications" },
  { key: "expenses", label: "Expenses" },
  { key: "coverage", label: "Coverage" },
];

export default function CaseHub() {
  const { id } = useParams();
  const { refresh } = useCases();
  const toast = useToast();
  const [c, setC] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<UserDocument[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    api.getCase(id).then((r) => { setC(r.case); setName(r.case.case_name); }).catch((e) => setErr(e.message ?? String(e)));
  }, [id]);

  // Documents power the quick card. Loaded once; failure is non-fatal.
  useEffect(() => {
    api.listMyDocuments().then((r) => setDocuments(r.documents)).catch(() => setDocuments([]));
  }, []);

  async function saveName() {
    if (!id || !c) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === c.case_name) { setRenaming(false); setName(c.case_name); return; }
    setSaving(true);
    try {
      const r = await api.updateCase(id, { case_name: trimmed });
      setC(r.case);
      setRenaming(false);
      refresh();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function setStage(next: ClaimStage) {
    if (!id || !c) return;
    const previous = c;
    setC({ ...c, claim_stage: next });
    try {
      const r = await api.updateCase(id, { claim_stage: next });
      setC(r.case);
    } catch (e: any) {
      setC(previous);
      toast.show(e.message ?? "We couldn't update the claim stage. Please try again.");
    }
  }

  function onCaseChange(next: Case) {
    setC(next);
    refresh();
  }

  if (err) return <div className="container"><div className="error">{err}</div></div>;
  if (!c) return <div className="container"><Spinner /></div>;

  const closed = isClosed(c);

  return (
    <div className="container">
      <BackButton to="/dashboard" label="Dashboard" />
      <div className="row" style={{ marginTop: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setRenaming(false); setName(c.case_name); } }}
                aria-label="Case name"
                style={{ maxWidth: 360 }}
                autoFocus
              />
              <button onClick={saveName} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              <button className="secondary" onClick={() => { setRenaming(false); setName(c.case_name); }} disabled={saving}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              <h1 style={{ margin: 0 }}>{c.case_name}</h1>
              <button className="secondary no-print" style={{ minHeight: 32, padding: "4px 12px", fontSize: 13 }} onClick={() => setRenaming(true)}>
                Rename
              </button>
            </div>
          )}
          <p className="muted-strong" style={{ margin: "6px 0 0" }}>
            {c.disaster_type}{c.location ? ` · ${c.location}` : ""}
            {c.incident_date ? ` · ${c.incident_date}` : ""}
          </p>
        </div>
        <CloseCaseButton caseDoc={c} onChange={onCaseChange} />
      </div>

      {closed && (
        <div className="closed-banner">
          This case is closed and shown read-only. All your records stay safe.
          Use Reopen case if something changes.
        </div>
      )}

      <div className="claim-tabs no-print" role="tablist" aria-label="Case sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`claim-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <ClaimLifecycle stage={c.claim_stage} onChange={setStage} />

          <div className="grid grid-2" style={{ alignItems: "start" }}>
            <ClaimQuickCard caseDoc={c} documents={documents} />
            <FirstStepsChecklist caseDoc={c} onChange={onCaseChange} />
          </div>

          <KeyContacts caseDoc={c} onChange={onCaseChange} onLogContact={() => setTab("communications")} />

          <div className="grid grid-2">
            <Link to={`/cases/${c.id}/recommendations`} className="tile">
              <h3>Your recovery plan</h3>
              <p>Your next steps, what to do, when, and who to call.</p>
            </Link>
            <Link to={`/cases/${c.id}/inventory`} className="tile">
              <h3>What you lost</h3>
              <p>List and photograph damaged items, room by room.</p>
            </Link>
            <Link to="/documents" className="tile">
              <h3>Documents</h3>
              <p>Your insurance, ID, and claim papers.</p>
            </Link>
            <Link to="/emergency" className="tile">
              <h3>Emergency contacts</h3>
              <p>Crisis lines, 211 Alberta, Red Cross, one tap to call.</p>
            </Link>
          </div>
        </div>
      )}

      {tab === "communications" && id && (
        <CommunicationsLog caseId={id} />
      )}

      {tab === "expenses" && id && (
        <AleTracker caseId={id} />
      )}

      {tab === "coverage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <CoverageGap documents={documents} />
          <CoverageDecisions caseDoc={c} onChange={onCaseChange} />
          <ReferralChain disasterType={c.disaster_type} />
        </div>
      )}
    </div>
  );
}
