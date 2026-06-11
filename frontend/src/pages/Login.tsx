import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function routeAfterAuth() {
    // New flow: drop the user straight into their plan if one exists,
    // otherwise into NewCase. Falls back to dashboard if /cases fails.
    try {
      const { cases } = await api.listCases();
      if (cases.length > 0) {
        nav(`/cases/${cases[0].id}/recommendations`);
      } else {
        nav("/cases/new");
      }
    } catch {
      nav("/dashboard");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (mode === "signup" && !agree) {
      setErr("Please agree to the Terms and Privacy Policy.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUp(email, password);
      await routeAfterAuth();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 460 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p className="warm-note" style={{ marginTop: 0 }}>
          {mode === "signin"
            ? "Sign in to pick up where you left off."
            : "It only takes a moment. We'll keep your data private and encrypted."}
        </p>
        <form onSubmit={submit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

          {mode === "signup" && (
            <div className="check-row">
              <input
                id="agree"
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <label htmlFor="agree">
                I agree to the{" "}
                <Link to="/legal/terms" target="_blank">Terms</Link> and{" "}
                <Link to="/legal/privacy" target="_blank">Privacy Policy</Link>.
              </label>
            </div>
          )}

          {err && <div className="error">{err}</div>}
          <div className="row" style={{ marginTop: 16 }}>
            <button type="submit" disabled={busy} className="big">
              {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
            </button>
            <span className="spacer" />
            <button
              type="button"
              className="secondary"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Need an account?" : "Have an account?"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
