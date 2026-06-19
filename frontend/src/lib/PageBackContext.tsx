import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Back navigation is a floating button anchored to the top-left of the page,
// just below the header. Each page declares where "back" goes by rendering
// <PageBack>, which registers the target here; the header reads it and draws
// the floating button.
type Back = { to?: string; label?: string } | null;

const Ctx = createContext<{ back: Back; setBack: (b: Back) => void }>({
  back: null,
  setBack: () => {},
});

export function PageBackProvider({ children }: { children: ReactNode }) {
  const [back, setBack] = useState<Back>(null);
  return <Ctx.Provider value={{ back, setBack }}>{children}</Ctx.Provider>;
}

export function usePageBack(): Back {
  return useContext(Ctx).back;
}

// A page mounts this to register its back target (drawn as a floating button by
// the header) and clears it on unmount, so a page with no <PageBack> shows no
// button. It also renders a small spacer reserving room at the top of the page
// so the floating button never overlaps the page title, scoped to exactly the
// pages that have a back target.
export function PageBack({ to, label }: { to?: string; label?: string }) {
  const { setBack } = useContext(Ctx);
  useEffect(() => {
    setBack({ to, label });
    return () => setBack(null);
  }, [to, label, setBack]);
  return <div className="back-fab-spacer" aria-hidden />;
}
