import { Deductible } from "../../api";
import { SourceQuote } from "./SourceQuote";

// Shows the deductible amount and type. Percentage deductibles are easy to
// misread (people assume a flat dollar figure), so for those we make the
// plain-language detail prominent.
export function DeductibleCard({ deductible }: { deductible?: Deductible | null }) {
  if (!deductible) return null;
  const isPercentage = deductible.type === "percentage";
  const typeLabel =
    deductible.type === "percentage"
      ? "Percentage of your coverage"
      : deductible.type === "fixed"
        ? "Fixed amount"
        : "Type not clear from the document";
  return (
    <div className="card deductible-card">
      <h3 style={{ marginTop: 0 }}>Your deductible</h3>
      {deductible.amount && <p className="deductible-amount">{deductible.amount}</p>}
      <p className="deductible-type">{typeLabel}</p>
      {deductible.detail && (
        <p className={`deductible-detail${isPercentage ? " prominent" : ""}`}>
          {deductible.detail}
        </p>
      )}
      <SourceQuote
        quote={deductible.source_quote}
        page={deductible.page_number}
        verified={deductible.verified}
      />
    </div>
  );
}
