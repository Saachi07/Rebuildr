// A small, calm marker telling the user whether we could find a quote
// verbatim in their document. null means there was nothing to check against
// (a photo upload), so we render nothing at all. A "no" is not an error, the
// AI's wording just didn't match the document text exactly, so the copy is a
// gentle nudge to double-check rather than an alarm.
export function VerifiedBadge({ verified }: { verified?: boolean | null }) {
  if (verified == null) return null;
  if (verified) {
    return (
      <span className="verified-badge verified-yes">
        Verified against your document
      </span>
    );
  }
  return (
    <span className="verified-badge verified-no">
      Please verify this with your document
    </span>
  );
}
