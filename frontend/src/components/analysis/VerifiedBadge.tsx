// A small, calm marker telling the user whether we could find a quote
// verbatim in their document. null means there was nothing to check against
// (a photo upload), so we render nothing at all.
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
      Could not verify this against your document, please check the original
    </span>
  );
}
