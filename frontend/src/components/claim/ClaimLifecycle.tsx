import { ClaimStage } from "../../api";
import "../../styles/claims.css";

// The stages a claim walks through, in order. `denied` is an off-path
// branch shown only when the claim is currently denied.
const STAGES: { key: ClaimStage; label: string }[] = [
  { key: "not_started", label: "Not started" },
  { key: "reported", label: "Reported" },
  { key: "adjuster_assigned", label: "Adjuster" },
  { key: "estimate_received", label: "Estimate" },
  { key: "settlement_offer", label: "Offer" },
  { key: "payout", label: "Payout" },
  { key: "closed", label: "Closed" },
];

export default function ClaimLifecycle({
  stage,
  onChange,
}: {
  stage?: ClaimStage | null;
  onChange: (next: ClaimStage) => void;
}) {
  const current = stage ?? "not_started";
  const denied = current === "denied";
  // When denied, treat progress as having reached the adjuster stage so the
  // road still reads sensibly while the denial branch is shown.
  const effective: ClaimStage = denied ? "adjuster_assigned" : current;
  const currentIndex = Math.max(0, STAGES.findIndex((s) => s.key === effective));

  // Layout maths for the SVG road.
  const width = 720;
  const height = 150;
  const padX = 40;
  const roadY = 92;
  const step = STAGES.length > 1 ? (width - padX * 2) / (STAGES.length - 1) : 0;
  const x = (i: number) => padX + i * step;
  const walkerX = x(currentIndex);

  return (
    <div className="lifecycle">
      <svg
        className="lifecycle-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="Claim progress"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* The road */}
        <line
          x1={padX}
          y1={roadY}
          x2={width - padX}
          y2={roadY}
          stroke="var(--border, #313749)"
          strokeWidth={6}
          strokeLinecap="round"
        />
        {/* Filled portion up to the current stage */}
        <line
          x1={padX}
          y1={roadY}
          x2={walkerX}
          y2={roadY}
          stroke="var(--accent, #2f7d63)"
          strokeWidth={6}
          strokeLinecap="round"
        />

        {STAGES.map((s, i) => {
          const past = i <= currentIndex;
          const isCurrent = i === currentIndex;
          const cx = x(i);
          return (
            <g
              key={s.key}
              role="button"
              tabIndex={0}
              aria-label={`Set stage to ${s.label}`}
              aria-current={isCurrent ? "step" : undefined}
              style={{ cursor: "pointer" }}
              onClick={() => onChange(s.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(s.key);
                }
              }}
            >
              {/* Larger transparent hit target */}
              <rect x={cx - step / 2} y={0} width={step} height={height} fill="transparent" />
              <circle
                cx={cx}
                cy={roadY}
                r={isCurrent ? 11 : 8}
                fill={past ? "var(--accent, #2f7d63)" : "var(--muted, #b3bbcc)"}
                stroke="var(--panel, #1a1d24)"
                strokeWidth={3}
              />
              <text
                x={cx}
                y={roadY + 30}
                textAnchor="middle"
                fontSize={12}
                fontWeight={isCurrent ? 700 : 500}
                fill={past ? "var(--text, #f1f3f9)" : "var(--muted, #b3bbcc)"}
              >
                {s.label}
              </text>
            </g>
          );
        })}

        {/* A simple walking figure standing on the current milestone. No emoji. */}
        <g transform={`translate(${walkerX}, ${roadY - 46})`} aria-hidden="true">
          <circle cx={0} cy={0} r={5} fill="var(--accent, #2f7d63)" />
          <line x1={0} y1={5} x2={0} y2={20} stroke="var(--accent, #2f7d63)" strokeWidth={3} strokeLinecap="round" />
          <line x1={0} y1={9} x2={-7} y2={16} stroke="var(--accent, #2f7d63)" strokeWidth={3} strokeLinecap="round" />
          <line x1={0} y1={9} x2={8} y2={14} stroke="var(--accent, #2f7d63)" strokeWidth={3} strokeLinecap="round" />
          <line x1={0} y1={20} x2={-7} y2={31} stroke="var(--accent, #2f7d63)" strokeWidth={3} strokeLinecap="round" />
          <line x1={0} y1={20} x2={8} y2={30} stroke="var(--accent, #2f7d63)" strokeWidth={3} strokeLinecap="round" />
        </g>
      </svg>

      {(effective === "estimate_received" || effective === "settlement_offer") && (
        <p className="lifecycle-note">
          Around this point you usually pay your deductible. It is the part of
          the repair cost you cover before your insurer pays the rest.
        </p>
      )}

      {(effective === "payout" || effective === "closed") && (
        <p className="lifecycle-note">
          After payout, keep your receipts and final paperwork. If repairs cost
          more than expected, or you find damage later, you can often reopen the
          claim. The case stays here for your records.
        </p>
      )}

      {denied && (
        <div className="lifecycle-denied">
          This claim is marked denied. A denial is not always final. You can ask
          for the reason in writing, send more documents, or escalate. See who
          to contact under the Coverage section.
        </div>
      )}
    </div>
  );
}
