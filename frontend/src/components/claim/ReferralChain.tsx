import "../../styles/claims.css";

// A clear order of who to contact when a claim stalls or is disputed. A
// survivor who is bounced between agencies needs one map, not five numbers.
const STEPS: { title: string; body: string }[] = [
  {
    title: "Your insurer or broker",
    body: "Start here for anything about your claim. Ask questions in writing when you can, and note the date and who you spoke with.",
  },
  {
    title: "Your adjuster's manager",
    body: "If your adjuster is unresponsive or you disagree with a decision, ask to speak with their supervisor or team lead.",
  },
  {
    title: "The insurer's complaints officer or ombudsman",
    body: "Every insurer has an internal complaints process. Ask for their complaint or ombudsman contact and submit your concern formally.",
  },
  {
    title: "The General Insurance OmbudService, or a lawyer",
    body: "If the internal process does not resolve it, the General Insurance OmbudService (GIO) reviews disputes for free. For larger or legal matters, talk to a lawyer.",
  },
];

export default function ReferralChain({ disasterType }: { disasterType?: string }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Who to call, in what order</h3>
      <p className="claim-intro">
        If your claim stalls or you are told no, work down this list in order.
        Each step is the right place to go before the next one.
      </p>
      <ol className="referral-chain">
        {STEPS.map((s) => (
          <li key={s.title}>
            <h4>{s.title}</h4>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
      {disasterType && (
        <p className="claim-entry-meta" style={{ marginTop: 4 }}>
          This order applies to most {disasterType} claims. Your province or
          program may add its own steps.
        </p>
      )}
    </div>
  );
}
