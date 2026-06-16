import { useState } from "react";
import { api, Case } from "../../api";
import "../../styles/claims.css";

// Coordination overload (contacting insurer, adjuster, cleaners, the city, all
// at once while still working) was the single biggest friction survivors told us
// about. This is a starter list of the people most claims need, so nobody is
// forgotten, with a one-tap way to record each conversation in the
// communications log. "Done" state persists in the case's checklist_state under
// namespaced keys so it never collides with the first-steps checklist.

type Role = { key: string; title: string; why: string };

const ROLES: Role[] = [
  { key: "contact_insurer", title: "Your insurer or broker", why: "Open the claim and ask what is covered. Everything else flows from this call." },
  { key: "contact_adjuster", title: "Your claims adjuster", why: "Your main point of contact once a claim is open. Keep their name and number handy." },
  { key: "contact_housing", title: "Emergency housing or shelter", why: "211 Alberta or the Red Cross for a place to stay. These costs are often covered." },
  { key: "contact_cleanup", title: "Cleanup or contents retrieval", why: "Hiring someone to safely clear or retrieve belongings is usually a covered cost. Keep receipts." },
  { key: "contact_municipality", title: "Your municipality or city", why: "For permits, re-entry, and local disaster recovery programs." },
  { key: "contact_lawyer", title: "A lawyer (only if needed)", why: "If your claim is denied or disputed. Not needed for most claims." },
];

export default function KeyContacts({
  caseDoc,
  onChange,
  onLogContact,
}: {
  caseDoc: Case;
  onChange: (next: Case) => void;
  onLogContact?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const state = caseDoc.checklist_state ?? {};
  const done = ROLES.filter((r) => state[r.key]).length;

  async function toggle(key: string) {
    setBusy(key);
    try {
      const next = { ...state, [key]: !state[key] };
      const r = await api.updateCase(caseDoc.id, { checklist_state: next });
      onChange(r.case);
    } catch {
      /* a failed toggle is non-fatal; the box just won't change */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card accent-card">
      <div className="row" style={{ alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>People to line up</h3>
        <span className="spacer" />
        <span className="claim-entry-meta">{done} of {ROLES.length} reached</span>
      </div>
      <p className="claim-intro">
        You do not have to call everyone at once. Check each off as you go so
        nothing slips while you are juggling the rest of your life.
      </p>
      <ul className="key-contacts">
        {ROLES.map((r) => (
          <li key={r.key}>
            <label className="key-contact-row">
              <input
                type="checkbox"
                checked={Boolean(state[r.key])}
                disabled={busy === r.key}
                onChange={() => toggle(r.key)}
              />
              <span>
                <strong>{r.title}</strong>
                <span className="claim-entry-meta" style={{ display: "block" }}>{r.why}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {onLogContact && (
        <button className="secondary no-print" onClick={onLogContact}>
          Log who you spoke with
        </button>
      )}
    </div>
  );
}
