// Branded loading screen: the animated Rebuildr logo on the app's cream
// background. Used for the auth/phase loading states that previously showed a
// bare spinner. The animation is a transparent webp so it sits on the page
// with no background rectangle. Motion-sensitive users get the static logo
// instead of the looping animation.
import { useEffect, useState } from "react";

const BASE = import.meta.env.BASE_URL;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function BrandLoader({
  message = "Getting things ready…",
  full = true,
  // The backend (free hosting tier) can cold-start for tens of seconds. After
  // this delay we add a reassuring line so a long wait reads as "waking up",
  // not "stuck". Pass null to opt out.
  slowAfterMs = 5000,
  slowMessage = "Waking things up, this can take a moment…",
}: {
  message?: string;
  full?: boolean;
  slowAfterMs?: number | null;
  slowMessage?: string;
}) {
  const reduce = prefersReducedMotion();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (slowAfterMs == null) return;
    const t = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => window.clearTimeout(t);
  }, [slowAfterMs]);
  return (
    <div className={full ? "brand-loader brand-loader-full" : "brand-loader"} role="status" aria-live="polite">
      <img
        className="brand-loader-anim"
        src={`${BASE}brand/${reduce ? "logo.png" : "logo-anim.webp"}`}
        alt="Rebuildr"
      />
      {message && <p className="brand-loader-msg">{message}</p>}
      {slow && slowMessage && <p className="brand-loader-slow">{slowMessage}</p>}
    </div>
  );
}
