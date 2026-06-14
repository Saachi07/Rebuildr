import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClaimLifecycle from "../ClaimLifecycle";

describe("ClaimLifecycle", () => {
  it("marks the current stage with aria-current", () => {
    render(<ClaimLifecycle stage="estimate_received" onChange={vi.fn()} />);
    const current = screen.getByLabelText("Set stage to Estimate");
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("calls onChange with the clicked stage", () => {
    const onChange = vi.fn();
    render(<ClaimLifecycle stage="reported" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Set stage to Payout"));
    expect(onChange).toHaveBeenCalledWith("payout");
  });

  it("shows the denied branch only when denied", () => {
    const { rerender } = render(<ClaimLifecycle stage="reported" onChange={vi.fn()} />);
    expect(screen.queryByText(/marked denied/i)).not.toBeInTheDocument();
    rerender(<ClaimLifecycle stage="denied" onChange={vi.fn()} />);
    expect(screen.getByText(/marked denied/i)).toBeInTheDocument();
  });
});
