import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api";
import { useCases } from "../lib/CasesContext";

type Mode = "signin" | "signup" | "magic" | "reset";

// Supabase's raw messages ("Invalid login credentials") are terse; translate
// the common ones into something calmer and more actionable.
function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "That email and password don't match our records. Double-check them, or use \"Forgot your password?\" below, no shame in it.";
  }
  if (lower.includes("email not confirmed")) {
    return "Your email hasn't been confirmed yet. Check your inbox (and spam folder) for our confirmation link.";
  }
  if (lower.includes("user already registered")) {
    return "There's already an account with this email. Try signing in instead, or reset your password if you've forgotten it.";
  }
  if (lower.includes("password should be")) {
    return "Please choose a password of at least 6 characters.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts in a short time. Take a breath and try again in a minute.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "We couldn't reach the sign-in service. Check your connection and try again.";
  }
  return raw;
}

const TITLES: Record<Mode, string> = {
  signin: "Welcome back",
  signup: "Create your account",
  magic: "Sign in without a password",
  reset: "Reset your password",
};

const NOTES: Record<Mode, string> = {
  signin: "Sign in to pick up where you left off.",
  signup: "It only takes a moment. We'll keep your data private and encrypted.",
  magic: "We'll email you a one-time sign-in link. No password needed, useful if yours was lost along with everything else.",
  reset: "Tell us your email and we'll send you a link to choose a new password.",
};

export default function Login() {
  const { signIn, signUp, sendMagicLink, sendPasswordReset } = useAuth();
  const { refresh } = useCases();
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setErr(null);
    setInfo(null);
  }

  async function routeAfterAuth() {
    // Drop the user straight into their plan if one exists, otherwise into
    // NewCase. Falls back to dashboard if /cases fails.
    refresh();
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

  // Record terms acceptance at sign-up so the blocking TermsGate modal
  // doesn't immediately re-ask the question the user just answered.
  async function recordTermsAcceptance() {
    try {
      const terms = await api.getTerms();
      await api.acceptTerms(terms.version);
    } catch {
      // Best-effort; the TermsGate will catch it if this fails.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    if (mode === "signup" && !agree) {
      setErr("Please agree to the Terms and Privacy Policy.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
        await routeAfterAuth();
      } else if (mode === "signup") {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) {
          setInfo(
            "Almost there, check your email for a confirmation link. " +
            "Once you've clicked it, come back here and sign in.",
          );
        } else {
          await recordTermsAcceptance();
          await routeAfterAuth();
        }
      } else if (mode === "magic") {
        await sendMagicLink(email);
        setInfo("Check your email, we sent you a sign-in link. It may take a minute to arrive.");
      } else {
        await sendPasswordReset(email);
        setInfo("Check your email, we sent a link to reset your password. It may take a minute to arrive.");
      }
    } catch (e: any) {
      setErr(friendlyAuthError(e.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  const needsPassword = mode === "signin" || mode === "signup";

  return (
    <div className="container" style={{ maxWidth: 460 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{TITLES[mode]}</h2>
        <p className="warm-note" style={{ marginTop: 0 }}>{NOTES[mode]}</p>
        <form onSubmit={submit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {needsPassword && (
            <>
              <label htmlFor="login-password">Password</label>
              <div className="password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={mode === "signup" ? 6 : undefined}
                  required
                />
                <button
                  type="button"
                  className="ghost password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {mode === "signup" && (
                <p className="muted-strong" style={{ fontSize: 13, margin: "6px 0 0" }}>
                  At least 6 characters. Pick something you'll remember, you can
                  always reset it later.
                </p>
              )}
            </>
          )}

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
          {info && <div className="notice" style={{ marginTop: 12 }}>{info}</div>}

          <div className="row" style={{ marginTop: 16 }}>
            <button type="submit" disabled={busy} className="big">
              {busy
                ? "One moment…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Sign up"
                    : mode === "magic"
                      ? "Email me a sign-in link"
                      : "Email me a reset link"}
            </button>
          </div>
        </form>

        <div className="login-links">
          {mode === "signin" && (
            <>
              <button className="link-btn" onClick={() => switchMode("reset")}>
                Forgot your password?
              </button>
              <button className="link-btn" onClick={() => switchMode("magic")}>
                Email me a sign-in link instead
              </button>
              <button className="link-btn" onClick={() => switchMode("signup")}>
                New here? Create an account
              </button>
            </>
          )}
          {mode === "signup" && (
            <button className="link-btn" onClick={() => switchMode("signin")}>
              Already have an account? Sign in
            </button>
          )}
          {(mode === "magic" || mode === "reset") && (
            <button className="link-btn" onClick={() => switchMode("signin")}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
