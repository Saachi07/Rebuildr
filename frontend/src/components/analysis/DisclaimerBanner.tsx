// Shown at the top of every document analysis view. Persistent and calm: it
// reminds the user this is a helpful summary, not advice, and that the policy
// itself is what governs.
export function DisclaimerBanner() {
  return (
    <div className="disclaimer-banner" role="note">
      This is a plain-language summary to help you understand your document. It
      is not legal or insurance advice. Your policy is the contract that
      governs, so always confirm details with your insurer or adjuster.
    </div>
  );
}
