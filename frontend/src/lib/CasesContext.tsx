import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api, Case } from "../api";
import { useAuth } from "../auth/AuthContext";

// One shared fetch of the user's cases. Before this, the nav picker, the
// notifications bell, and several pages each fetched /cases independently
// and went stale the moment a case was created.

type CasesValue = {
  cases: Case[] | null; // null = still loading
  latest: Case | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<CasesValue | null>(null);

export function CasesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.listCases();
      setCases(r.cases);
    } catch {
      setCases((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setCases(null);
      return;
    }
    refresh();
  }, [user, refresh]);

  const latest = cases && cases.length > 0 ? cases[0] : null;
  return <Ctx.Provider value={{ cases, latest, refresh }}>{children}</Ctx.Provider>;
}

export function useCases(): CasesValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCases must be used inside CasesProvider");
  return v;
}
