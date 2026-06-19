import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Back navigation lives in the global header (the action bar), far right on the
// same row as the case picker, so the top of every page is just its title and
// content. Each page declares where "back" goes by rendering <PageBack>, which
// registers the target here; the action bar reads it and draws the button.
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

// Declarative, renders nothing. A page mounts this to register its back target
// and clears it on unmount, so a page with no <PageBack> shows no back button.
export function PageBack({ to, label }: { to?: string; label?: string }) {
  const { setBack } = useContext(Ctx);
  useEffect(() => {
    setBack({ to, label });
    return () => setBack(null);
  }, [to, label, setBack]);
  return null;
}
