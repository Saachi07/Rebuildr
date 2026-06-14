import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageScopeEntry } from "../../../api";
import { CoverageScopeCard } from "../CoverageScopeCard";

const ENTRIES: CoverageScopeEntry[] = [
  { item: "Personal property", status: "covered", detail: "Contents are covered.", source_quote: "We cover your personal property.", page_number: 2, verified: true },
  { item: "Overland flood", status: "not_covered", detail: "Flood is excluded.", source_quote: "Overland flooding is not covered.", page_number: 7, verified: false },
  { item: "Sewer backup", status: "conditional", detail: "Only with the endorsement." },
  { item: "Landscaping", status: "unclear" },
];

describe("CoverageScopeCard", () => {
  it("renders a row per entry with the right status chip", () => {
    render(<CoverageScopeCard entries={ENTRIES} />);
    expect(screen.getByText("Personal property")).toBeInTheDocument();
    expect(screen.getByText("Overland flood")).toBeInTheDocument();
    expect(screen.getByText("Sewer backup")).toBeInTheDocument();
    expect(screen.getByText("Landscaping")).toBeInTheDocument();

    expect(screen.getByText("Covered")).toBeInTheDocument();
    expect(screen.getByText("Not covered")).toBeInTheDocument();
    expect(screen.getByText("Conditional")).toBeInTheDocument();
    expect(screen.getByText("Unclear")).toBeInTheDocument();
  });

  it("shows the lead-in sentence and a source quote", () => {
    render(<CoverageScopeCard entries={ENTRIES} />);
    expect(
      screen.getByText(/Here is what your policy text actually says/),
    ).toBeInTheDocument();
    expect(screen.getByText(/We cover your personal property\./)).toBeInTheDocument();
  });

  it("renders nothing when there are no entries", () => {
    const { container } = render(<CoverageScopeCard entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
