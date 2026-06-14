import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageLimit } from "../../../api";
import { SourceQuote } from "../SourceQuote";

// coverage_limits items may be a plain string (older stored analyses) or a
// CoverageLimit object. This mirrors the guard and render path used in
// Documents.tsx and confirms both shapes render without crashing.
function isCoverageLimitObject(c: string | CoverageLimit): c is CoverageLimit {
  return typeof c === "object" && c !== null && "text" in c;
}

function Limits({ limits }: { limits: (string | CoverageLimit)[] }) {
  return (
    <ul>
      {limits.map((c, i) => (
        <li key={i}>
          {isCoverageLimitObject(c) ? (
            <>
              {c.text}
              <SourceQuote quote={c.source_quote} page={c.page_number} verified={c.verified} />
            </>
          ) : (
            c
          )}
        </li>
      ))}
    </ul>
  );
}

describe("coverage_limits rendering", () => {
  it("renders a plain string limit with no quote", () => {
    render(<Limits limits={["Contents limited to 70 percent of dwelling."]} />);
    expect(
      screen.getByText("Contents limited to 70 percent of dwelling."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/From your policy/)).not.toBeInTheDocument();
  });

  it("renders an object limit with its source quote", () => {
    const limits: (string | CoverageLimit)[] = [
      { text: "Jewelry capped at 2000 dollars.", source_quote: "Jewelry is limited to $2,000.", page_number: 9, verified: true },
    ];
    render(<Limits limits={limits} />);
    expect(screen.getByText("Jewelry capped at 2000 dollars.")).toBeInTheDocument();
    expect(screen.getByText("From your policy, page 9:")).toBeInTheDocument();
    expect(screen.getByText(/Jewelry is limited to \$2,000\./)).toBeInTheDocument();
  });

  it("renders a mix of both forms without crashing", () => {
    const limits: (string | CoverageLimit)[] = [
      "A plain string limit.",
      { text: "An object limit." },
    ];
    render(<Limits limits={limits} />);
    expect(screen.getByText("A plain string limit.")).toBeInTheDocument();
    expect(screen.getByText("An object limit.")).toBeInTheDocument();
  });
});
