import { CoverageScopeEntry, CoverageScopeStatus } from "../../api";
import { SourceQuote } from "./SourceQuote";

const STATUS_LABELS: Record<CoverageScopeStatus, string> = {
  covered: "Covered",
  not_covered: "Not covered",
  conditional: "Conditional",
  unclear: "Unclear",
};

function statusLabel(status: CoverageScopeStatus): string {
  return STATUS_LABELS[status] ?? "Unclear";
}

// Lays out what the policy text actually says about common coverages. The
// status chip uses calm theme colors (no alarming red), and every row carries
// the policy's own sentence so a user can push back if they are told their
// coverage is narrower than it really is.
export function CoverageScopeCard({ entries }: { entries?: CoverageScopeEntry[] }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>What your policy covers</h3>
      <p className="coverage-scope-intro">
        Here is what your policy text actually says about common coverages.
        This is why it matters: people are sometimes told their coverage is
        narrower than it really is.
      </p>
      {entries.map((e, i) => (
        <div className="coverage-scope-row" key={i}>
          <div className="coverage-scope-head">
            <span className="coverage-scope-item">{e.item}</span>
            <span className={`status-chip status-${e.status}`}>
              {statusLabel(e.status)}
            </span>
          </div>
          {e.detail && <p className="coverage-scope-detail">{e.detail}</p>}
          <SourceQuote quote={e.source_quote} page={e.page_number} verified={e.verified} />
        </div>
      ))}
      <p className="confirm-note">Confirm with your adjuster.</p>
    </div>
  );
}
