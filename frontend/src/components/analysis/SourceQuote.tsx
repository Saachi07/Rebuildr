import { VerifiedBadge } from "./VerifiedBadge";

// Shows the contract's own sentence beneath our plain-language version, so a
// user can always see exactly where a fact came from. Renders nothing when
// there is no quote to show.
export function SourceQuote({
  quote,
  page,
  verified,
}: {
  quote?: string | null;
  page?: number | null;
  verified?: boolean | null;
}) {
  const text = (quote ?? "").trim();
  if (!text) return null;
  const label =
    page != null
      ? `From your policy, page ${page}:`
      : "From your policy:";
  return (
    <blockquote className="source-quote">
      <span className="source-quote-label">{label}</span>
      <span className="source-quote-text">&ldquo;{text}&rdquo;</span>
      <VerifiedBadge verified={verified} />
    </blockquote>
  );
}
