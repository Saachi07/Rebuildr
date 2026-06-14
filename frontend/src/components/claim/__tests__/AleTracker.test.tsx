import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../../Toast";
import AleTracker from "../AleTracker";
import { AleExpense } from "../../../api";

vi.mock("../../../api", () => ({
  api: {
    listAleExpenses: vi.fn(),
    createAleExpense: vi.fn(),
    updateAleExpense: vi.fn(),
    deleteAleExpense: vi.fn(),
  },
}));

import { api } from "../../../api";

const expenses: AleExpense[] = [
  { id: "e1", case_id: "case1", category: "hotel", amount: 200, vendor: "Comfort Inn", expense_date: "2026-01-05" },
  { id: "e2", case_id: "case1", category: "meals", amount: 55.5, vendor: "Diner", expense_date: "2026-01-06" },
];

function renderTracker() {
  return render(
    <ToastProvider>
      <AleTracker caseId="case1" />
    </ToastProvider>,
  );
}

describe("AleTracker", () => {
  beforeEach(() => {
    vi.mocked(api.listAleExpenses).mockResolvedValue({ expenses, total: 255.5 });
  });

  it("shows the running total from the backend", async () => {
    renderTracker();
    expect(await screen.findByText("Running total")).toBeInTheDocument();
    expect(screen.getByText("$255.50")).toBeInTheDocument();
  });

  it("lists each expense", async () => {
    renderTracker();
    expect(await screen.findByText("Comfort Inn")).toBeInTheDocument();
    expect(screen.getByText("Diner")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
  });
});
