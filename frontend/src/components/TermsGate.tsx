import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Terms } from "../api";
import { useAuth } from "../auth/AuthContext";

export function TermsGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [terms, setTerms] = useState<Terms | null>(null);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAccepted(null);
      return;
    }
    let cancelled = false;
    Promise.all([api.getTerms(), api.getTermsStatus()])
      .then(([t, s]) => {
        if (cancelled) return;
        setTerms(t);
        setAccepted(s.accepted);
      })
      .catch(() => {
        if (cancelled) return;
        setAccepted(true);
      });
    return () => { cancelled = true; };
  }, [user]);

  async function accept() {
    if (!terms || !agree) return;
    setBusy(true);
    setErr(null);
    try {
      await api.acceptTerms(terms.version);
      setAccepted(true);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const showGate = !!user && accepted === false && !!terms;

  return (
    <>
      {children}
      {showGate && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Review our terms">
            <h2 style={{ marginTop: 0 }}>Please review our terms</h2>
            <p className="muted">
              Before continuing, please accept the latest Terms of Service
              and Privacy Policy (version {terms!.version}).
            </p>
            {terms!.encryption_notice && (
              <div className="notice" style={{ marginTop: 12 }}>
                <strong>Your data is encrypted</strong>
                <span className="muted">{terms!.encryption_notice}</span>
              </div>
            )}
            <div className="check-row" style={{ marginTop: 16 }}>
              <input
                id="gate-agree"
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <label htmlFor="gate-agree">
                I agree to the{" "}
                <Link to="/legal/terms" target="_blank">Terms</Link> and{" "}
                <Link to="/legal/privacy" target="_blank">Privacy Policy</Link>.
              </label>
            </div>
            {err && <div className="error">{err}</div>}
            <div className="row" style={{ marginTop: 16 }}>
              <span className="spacer" />
              <button onClick={accept} disabled={!agree || busy}>
                {busy ? "Saving…" : "Accept and continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
