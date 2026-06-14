import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../../Toast";
import CloseCaseButton from "../CloseCaseButton";
import { Case } from "../../../api";

vi.mock("../../../api", () => ({
  api: { closeCase: vi.fn(), reopenCase: vi.fn() },
}));

const open: Case = { id: "case1", case_name: "Open case", disaster_type: "fire", status: "active" };
const closed: Case = { id: "case2", case_name: "Closed case", disaster_type: "fire", status: "closed", closed_at: "2026-01-01T00:00:00Z" };

function renderBtn(c: Case) {
  return render(
    <ToastProvider>
      <CloseCaseButton caseDoc={c} />
    </ToastProvider>,
  );
}

describe("CloseCaseButton", () => {
  it("shows Close case for an open case", () => {
    renderBtn(open);
    expect(screen.getByRole("button", { name: "Close case" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen case" })).not.toBeInTheDocument();
  });

  it("shows Reopen case for a closed case", () => {
    renderBtn(closed);
    expect(screen.getByRole("button", { name: "Reopen case" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close case" })).not.toBeInTheDocument();
  });
});
