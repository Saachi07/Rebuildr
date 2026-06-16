import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
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

// While we're letting people try the product without signing up, anyone who
// lands without a session gets a real but anonymous Supabase user. Each visitor
// gets their own isolated account and a normal authenticated token, so the
// backend treats them like any other user. Set VITE_DISABLE_AUTH=0 (or remove
// it) to turn this off and require real sign-in again.
const ALLOW_ANONYMOUS = import.meta.env.VITE_DISABLE_AUTH === "1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session && ALLOW_ANONYMOUS) {
        // No session yet: silently create an anonymous one so the visitor can
        // explore the app. onAuthStateChange below picks up the new session.
        const { error } = await supabase.auth.signInAnonymously();
        if (error) console.error("anonymous sign-in failed", error);
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
