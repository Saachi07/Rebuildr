import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api, Case, Item } from "../api";
import { useAuth } from "../auth/AuthContext";

// One shared fetch of the user's cases. Before this, the nav picker, the
// notifications bell, and several pages each fetched /cases independently
// and went stale the moment a case was created.

// "prepare" before anything has happened, "recovery" once an open case
// exists. Always DERIVED from the cases list below, never stored, so the
// pre/post phase can never desync across restarts or devices.
export type Phase = "prepare" | "recovery";

type CasesValue = {
  cases: Case[] | null; // null = still loading
  latest: Case | null;
  // Open cases (status draft or active, not deleted), newest first.
  openCases: Case[];
  phase: Phase;
  // The draft we autosave the intake into, if recovery has been started but
  // not yet confirmed. First open case with status "draft".
  activeDraft: Case | null;
  // Newest open case, draft or active.
  latestOpen: Case | null;
  // The home-scoped (user-wide) inventory library. null = still loading. Used
  // alongside cases to tell a brand-new user from a returning one.
  myItems: Item[] | null;
  // True only for someone who has never started a case and never added any
  // inventory. null while either list is still loading. Drives the one-time
  // situational welcome; once they act, they are no longer new.
  isNewUser: boolean | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<CasesValue | null>(null);

export function CasesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [myItems, setMyItems] = useState<Item[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [casesRes, itemsRes] = await Promise.all([
        api.listCases(),
        api.listMyItems(),
      ]);
      setCases(casesRes.cases);
      setMyItems(itemsRes.items);
    } catch {
      // Keep whatever we had rather than flipping back to a loading or empty
      // state on a transient failure, which would re-show the wrong phase.
      setCases((prev) => prev ?? []);
      setMyItems((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setCases(null);
      setMyItems(null);
      return;
    }
    refresh();
  }, [user, refresh]);

  const latest = cases && cases.length > 0 ? cases[0] : null;
  // listCases already excludes deleted cases and returns newest first.
  const openCases = (cases ?? []).filter(
    (c) => c.status === "draft" || c.status === "active",
  );
  const phase: Phase = openCases.length > 0 ? "recovery" : "prepare";
  const activeDraft = openCases.find((c) => c.status === "draft") ?? null;
  const latestOpen = openCases.length > 0 ? openCases[0] : null;
  // null until both lists have loaded, so callers can hold off rather than
  // briefly treating a returning user as new.
  const isNewUser =
    cases === null || myItems === null
      ? null
      : cases.length === 0 && myItems.length === 0;
  return (
    <Ctx.Provider
      value={{ cases, latest, openCases, phase, activeDraft, latestOpen, myItems, isNewUser, refresh }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCases(): CasesValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCases must be used inside CasesProvider");
  return v;
}
