import { useEffect, useMemo, useState } from "react";
import { api, CoverageLimit, UserDocument } from "../../api";
import "../../styles/claims.css";

// Bevel's "coverage gap" idea, recovery-flavored: contrast what the survivor has
// actually documented against the contents limit on their policy, so an
// underinsurance gap is visible before the adjuster points it out. Policy limits
// are stored as free text (no parsed numeric field), so we extract dollar
// figures from the analyzed policy and prefer the line that mentions contents or
// personal property. The survivor can always correct the limit by hand.

const CONTENTS_HINTS = ["contents", "personal property", "personal belongings", "personal effects"];

function limitText(l: string | CoverageLimit): string {
  return typeof l === "string" ? l : l.text ?? "";
}

function parseDollars(text: string): number[] {
  const matches = text.match(/\$\s?[\d,]+(?:\.\d{1,2})?/g) ?? [];
  return matches
    .map((m) => Number(m.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// Best guess at the contents/personal-property limit across every analyzed
// document. Returns the figure and the sentence it came from, or null.
function detectContentsLimit(documents: UserDocument[]): { amount: number; source: string } | null {
  const limits: (string | CoverageLimit)[] = [];
  for (const d of documents) {
    const cl = d.gemini_analysis?.analysis?.coverage_limits;
    if (Array.isArray(cl)) limits.push(...cl);
  }
  let best: { amount: number; source: string } | null = null;
  for (const l of limits) {
    const text = limitText(l);
    const lower = text.toLowerCase();
    if (!CONTENTS_HINTS.some((h) => lower.includes(h))) continue;
    const amounts = parseDollars(text);
    if (!amounts.length) continue;
    const amount = Math.max(...amounts);
    if (!best || amount > best.amount) best = { amount, source: text };
  }
  return best;
}

export default function CoverageGap({ documents }: { documents?: UserDocument[] | null }) {
  const [documentedValue, setDocumentedValue] = useState<number | null>(null);
  const [manualLimit, setManualLimit] = useState("");

  useEffect(() => {
    api.listMyItems()
      .then((r) => setDocumentedValue(r.items.reduce((sum, it) => sum + (it.estimated_value ?? 0), 0)))
      .catch(() => setDocumentedValue(0));
  }, []);

  const detected = useMemo(() => detectContentsLimit(documents ?? []), [documents]);

  const manual = Number(manualLimit.replace(/[^0-9.]/g, ""));
  const limit = manualLimit.trim() && Number.isFinite(manual) && manual > 0
    ? manual
    : detected?.amount ?? null;

  const documented = documentedValue ?? 0;
  const gap = limit != null ? documented - limit : null;
  const over = gap != null && gap > 0;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Coverage gap check</h3>
      <p className="claim-intro">
        Compare what you have documented against the contents limit on your
        policy. If your belongings are worth more than your limit, you may be
        underinsured, knowing now is far better than learning it at payout.
      </p>

      <div className="grid grid-2" style={{ gap: 12 }}>
        <div className="coverage-figure">
          <div className="claim-entry-meta">You have documented</div>
          <div className="amount">
            {documentedValue == null ? "…" : `$${documented.toLocaleString()}`}
          </div>
          <div className="claim-entry-meta">replacement value of contents</div>
        </div>
        <div className="coverage-figure">
          <div className="claim-entry-meta">Your policy contents limit</div>
          <div className="amount">{limit != null ? `$${limit.toLocaleString()}` : "Not found"}</div>
          <div className="claim-entry-meta">
            {detected ? "found in your analyzed policy" : "upload and analyze your policy, or enter it below"}
          </div>
        </div>
      </div>

      {limit != null && (
        <div className={`coverage-verdict ${over ? "warn" : "ok"}`}>
          {over ? (
            <>
              <strong>Possible gap of ${gap!.toLocaleString()}.</strong> Your
              documented contents are worth more than your limit. Ask your insurer
              whether your contents coverage can be raised, and keep documenting,
              a higher documented total strengthens the case.
            </>
          ) : (
            <>
              <strong>You are within your limit so far.</strong> Your documented
              contents (${documented.toLocaleString()}) are under your $
              {limit.toLocaleString()} limit. Keep adding items; this gap can
              change as you document more.
            </>
          )}
        </div>
      )}

      {detected?.source && (
        <p className="claim-entry-meta" style={{ marginTop: 10 }}>
          From your policy: "{detected.source}"
        </p>
      )}

      <label htmlFor="coverage-limit" style={{ marginTop: 12 }}>
        Set your contents limit by hand (optional)
      </label>
      <input
        id="coverage-limit"
        inputMode="numeric"
        value={manualLimit}
        onChange={(e) => setManualLimit(e.target.value)}
        placeholder={detected ? String(detected.amount) : "e.g. 50000"}
      />
      <p className="claim-entry-meta" style={{ marginTop: 6 }}>
        This is an estimate to guide the conversation, not a guarantee of what
        will be paid. Your policy wording always governs.
      </p>
    </div>
  );
}
