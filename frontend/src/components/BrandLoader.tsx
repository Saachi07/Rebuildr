// Branded loading screen: the animated Rebuildr logo on the app's cream
// background. Used for the auth/phase loading states that previously showed a
// bare spinner. The animation is transparent (webp), with the gif as a
// fallback for browsers without animated-webp support. Motion-sensitive users
// get the static logo instead of the looping animation.
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
      {reduce ? (
        <img className="brand-loader-anim" src={`${BASE}brand/logo.png`} alt="Rebuildr" />
      ) : (
        <picture>
          <source srcSet={`${BASE}brand/logo-anim.webp`} type="image/webp" />
          <img className="brand-loader-anim" src={`${BASE}brand/logo-anim.gif`} alt="Rebuildr" />
        </picture>
      )}
      {message && <p className="brand-loader-msg">{message}</p>}
    </div>
  );
}
