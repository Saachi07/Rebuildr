import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  // True when the app is running in no-sign-up demo mode (VITE_DISABLE_AUTH=1).
  demoMode: boolean;
  // Guarantee there is a usable session before entering a guarded route. In
  // demo mode this signs into (or creates) this device's demo account on
  // demand, so a landing CTA never drops the visitor onto a guard that bounces
  // them back. Returns true once a user exists, false if one couldn't be made.
  ensureSession: () => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  // Returns whether the account still needs email confirmation (no session yet).
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  // Passwordless options, disaster survivors often lose devices and
  // password notes, so a password should never be the only way in.
  sendMagicLink: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

// Demo mode: let people try the product without a sign-up screen, while still
// producing real email+password accounts that show up in our user base (unlike
// throwaway anonymous users). On first visit we silently generate a unique
// email + password, create the account, and remember the credentials on this
// device so a returning visitor lands back in the same account with their work
// intact. Set VITE_DISABLE_AUTH=0 (or remove it) to require real sign-in again.
//
// NOTE: this relies on email confirmation being OFF for the Supabase project,
// the generated addresses are not real inboxes, so a confirmation step would
// strand demo users. Keep confirmations disabled while demo mode is on.
const DEMO_MODE = import.meta.env.VITE_DISABLE_AUTH === "1";

const DEMO_CREDS_KEY = "rebuildr.demoCreds";
// Generated addresses live on a domain we control and never send real mail to.
const DEMO_EMAIL_DOMAIN = "rebuildr-demo.app";

type DemoCreds = { email: string; password: string };

function randomId(): string {
  // crypto.randomUUID is available in every browser we target; the fallback
  // just keeps TypeScript and ancient environments happy.
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${performance.now()}`).replace(/[^a-z0-9]/gi, "");
}

function loadDemoCreds(): DemoCreds | null {
  try {
    const raw = localStorage.getItem(DEMO_CREDS_KEY);
    return raw ? (JSON.parse(raw) as DemoCreds) : null;
  } catch {
    return null;
  }
}

function saveDemoCreds(creds: DemoCreds) {
  try {
    localStorage.setItem(DEMO_CREDS_KEY, JSON.stringify(creds));
  } catch {
    /* best-effort; a visitor in private mode just gets a fresh account */
  }
}

function makeDemoCreds(): DemoCreds {
  // Mixed-case + symbol so the password clears stricter Supabase policies.
  return { email: `demo-${randomId()}@${DEMO_EMAIL_DOMAIN}`, password: `Demo!${randomId()}` };
}

// Sign into this device's demo account, creating one the first time. Returns
// the session, or null if the account couldn't be established (logged for us;
// the visitor simply sees the normal signed-out state).
async function ensureDemoSession(): Promise<Session | null> {
  const existing = loadDemoCreds();
  if (existing) {
    const { data, error } = await supabase.auth.signInWithPassword(existing);
    if (!error && data.session) return data.session;
    // Stored credentials no longer work (account purged, password policy
    // change): fall through and mint a fresh demo account.
  }
  const creds = makeDemoCreds();
  const { data, error } = await supabase.auth.signUp({
    email: creds.email,
    password: creds.password,
  });
  if (error) {
    console.error("demo sign-up failed", error);
    return null;
  }
  saveDemoCreds(creds);
  if (data.session) return data.session;
  // No session from signUp means email confirmation is enabled; try a direct
  // sign-in, which works when the project allows unconfirmed logins.
  const signIn = await supabase.auth.signInWithPassword(creds);
  if (signIn.error || !signIn.data.session) {
    console.error(
      "demo sign-in failed; disable email confirmation in Supabase for demo mode",
      signIn.error,
    );
    return null;
  }
  return signIn.data.session;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session && DEMO_MODE) {
        // No session yet: silently sign into (or create) this device's demo
        // account so the visitor can explore the app. Set the session directly
        // rather than waiting on onAuthStateChange, so the route guard never
        // briefly sees "no user" and bounces to /login.
        const session = await ensureDemoSession();
        if (cancelled) return;
        setSession(session);
        setLoading(false);
        return;
      }
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthValue = {
    user: session?.user ?? null,
    session,
    loading,
    demoMode: DEMO_MODE,
    ensureSession: async () => {
      if (session?.user) return true;
      if (!DEMO_MODE) return false;
      const s = await ensureDemoSession();
      if (s) setSession(s);
      return !!s;
    },
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return { needsConfirmation: !data.session };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    sendMagicLink: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
      });
      if (error) throw error;
    },
    sendPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
      });
      if (error) throw error;
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
