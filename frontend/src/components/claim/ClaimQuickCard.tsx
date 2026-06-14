import { Case, UserDocument } from "../../api";
import "../../styles/claims.css";

// Fields we try to surface for one-glance reference, with the label
// fragments we will accept when matching against extracted document fields.
// `match` fragments are tried most-specific first. `exclude` skips a label
// that would otherwise match but really belongs to a different field, e.g.
// "Claims department phone" must not satisfy the claim-number field.
const TARGETS: { id: string; label: string; match: string[]; exclude?: string[] }[] = [
  { id: "policy_number", label: "Policy number", match: ["policy number", "policy no", "policy #", "policy"] },
  { id: "claim_number", label: "Claim number", match: ["claim number", "claim no", "claim #", "claim"], exclude: ["phone", "department", "adjuster", "line", "telephone"] },
  { id: "claims_phone", label: "Claims department phone", match: ["claims phone", "claims department", "claims line", "claims number", "phone", "telephone", "contact number"] },
  { id: "adjuster_name", label: "Adjuster name", match: ["adjuster name", "adjuster", "claims adjuster", "assessor"] },
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

// key_fields may be an object map or an array of { label, value }. Flatten
// both into a simple list of label/value pairs.
function flattenKeyFields(kf: unknown): { label: string; value: string }[] {
  if (!kf) return [];
  if (Array.isArray(kf)) {
    return kf
      .map((entry) => {
        if (entry && typeof entry === "object" && "label" in entry && "value" in entry) {
          const e = entry as { label: unknown; value: unknown };
          return { label: String(e.label ?? ""), value: String(e.value ?? "") };
        }
        return null;
      })
      .filter((x): x is { label: string; value: string } => Boolean(x && x.label && x.value));
  }
  if (typeof kf === "object") {
    return Object.entries(kf as Record<string, unknown>)
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([label, value]) => ({ label, value: String(value) }));
  }
  return [];
}

// Find the best value for a target across every document's key_fields.
function findField(
  pairs: { label: string; value: string }[],
  match: string[],
  exclude: string[] = [],
): string | null {
  for (const frag of match) {
    const f = normalize(frag);
    const hit = pairs.find((p) => {
      const label = normalize(p.label);
      if (!label.includes(f)) return false;
      return !exclude.some((ex) => label.includes(normalize(ex)));
    });
    if (hit && hit.value.trim()) return hit.value.trim();
  }
  return null;
}

export default function ClaimQuickCard({
  caseDoc,
  documents,
}: {
  caseDoc?: Case | null;
  documents?: UserDocument[] | null;
}) {
  const pairs = (documents ?? []).flatMap((d) => flattenKeyFields(d.gemini_analysis?.key_fields));
  const found = TARGETS.map((t) => ({ ...t, value: findField(pairs, t.match, t.exclude) }));

  return (
    <div className="quick-card">
      <div className="row" style={{ alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>Claim quick card</h3>
        <span className="spacer" />
        <button className="secondary no-print" onClick={() => window.print()}>Print</button>
      </div>
      {caseDoc?.case_name && (
        <p className="claim-entry-meta" style={{ margin: "4px 0 12px" }}>{caseDoc.case_name}</p>
      )}
      <dl>
        {found.map((t) => (
          <div key={t.id} style={{ display: "contents" }}>
            <dt>{t.label}</dt>
            {t.value ? (
              <dd>{t.value}</dd>
            ) : (
              <dd className="missing">Not found yet, upload your policy</dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
