import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerifiedBadge } from "../VerifiedBadge";

describe("VerifiedBadge", () => {
  it("shows a positive marker when verified is true", () => {
    render(<VerifiedBadge verified={true} />);
    expect(screen.getByText("Verified against your document")).toBeInTheDocument();
  });

  it("shows a cautionary marker when verified is false", () => {
    render(<VerifiedBadge verified={false} />);
    expect(
      screen.getByText(
        "Could not verify this against your document, please check the original",
      ),
    ).toBeInTheDocument();
  });

  it("renders nothing when verified is null", () => {
    const { container } = render(<VerifiedBadge verified={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when verified is undefined", () => {
    const { container } = render(<VerifiedBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
