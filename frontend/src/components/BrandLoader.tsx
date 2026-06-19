// Branded loading screen: the animated Rebuildr logo on the app's cream
// background. Used for the auth/phase loading states that previously showed a
// bare spinner. The animation is a transparent webp so it sits on the page
// with no background rectangle. Motion-sensitive users get the static logo
// instead of the looping animation.
const BASE = import.meta.env.BASE_URL;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function BrandLoader({
  message = "Getting things ready…",
  full = true,
}: {
  message?: string;
  full?: boolean;
}) {
  const reduce = prefersReducedMotion();
  return (
    <div className={full ? "brand-loader brand-loader-full" : "brand-loader"} role="status" aria-live="polite">
      <img
        className="brand-loader-anim"
        src={`${BASE}brand/${reduce ? "logo.png" : "logo-anim.webp"}`}
        alt="Rebuildr"
      />
      {message && <p className="brand-loader-msg">{message}</p>}
    </div>
  );
}
