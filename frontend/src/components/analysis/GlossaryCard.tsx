import { useState } from "react";
import { GlossaryTerm } from "../../api";
import { SourceQuote } from "./SourceQuote";

// A collapsible glossary of the terms found in the document, each with a
// plain-language definition and the policy's own sentence. Collapsed by
// default so it does not crowd the summary.
export function GlossaryCard({ terms }: { terms?: GlossaryTerm[] }) {
  const [open, setOpen] = useState(false);
  if (!terms || terms.length === 0) return null;
  return (
    <div className="card">
      <div className="row">
        <h3 style={{ margin: 0 }}>Words explained</h3>
      </div>
      <button
        className="link-btn glossary-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? "Hide definitions"
          : `Show ${terms.length} defined term${terms.length === 1 ? "" : "s"}`}
      </button>
      {open && (
        <dl className="glossary-list">
          {terms.map((t, i) => (
            <div key={i}>
              <dt>{t.term}</dt>
              <dd>
                {t.definition}
                <SourceQuote quote={t.source_quote} page={t.page_number} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
