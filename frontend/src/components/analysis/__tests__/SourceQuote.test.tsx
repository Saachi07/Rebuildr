import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceQuote } from "../SourceQuote";

describe("SourceQuote", () => {
  it("renders the quote text and page label", () => {
    render(<SourceQuote quote="Coverage applies to fire damage." page={4} verified />);
    expect(screen.getByText("From your policy, page 4:")).toBeInTheDocument();
    expect(
      screen.getByText(/Coverage applies to fire damage\./),
    ).toBeInTheDocument();
  });

  it("falls back to a generic label when no page is given", () => {
    render(<SourceQuote quote="Some clause." />);
    expect(screen.getByText("From your policy:")).toBeInTheDocument();
  });

  it("renders nothing when there is no quote", () => {
    const { container } = render(<SourceQuote quote={null} page={4} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the quote is blank", () => {
    const { container } = render(<SourceQuote quote="   " />);
    expect(container).toBeEmptyDOMElement();
  });
});
