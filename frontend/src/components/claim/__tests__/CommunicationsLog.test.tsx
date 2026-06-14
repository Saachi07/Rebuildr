import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../../Toast";
import CommunicationsLog from "../CommunicationsLog";
import { Communication } from "../../../api";

vi.mock("../../../api", () => ({
  api: {
    listCommunications: vi.fn(),
    createCommunication: vi.fn(),
    updateCommunication: vi.fn(),
    deleteCommunication: vi.fn(),
  },
}));

import { api } from "../../../api";

const entries: Communication[] = [
  {
    id: "c1",
    case_id: "case1",
    occurred_at: "2026-01-10T15:00:00.000Z",
    contact_name: "Jane Adjuster",
    organization: "Acme Insurance",
    channel: "phone",
    kind: "note",
    summary: "Called to report the loss",
  },
  {
    id: "c2",
    case_id: "case1",
    occurred_at: "2026-02-01T15:00:00.000Z",
    kind: "discrepancy",
    summary: "My policy covers all contents, not only clothing",
    insurer_statement: "They said it only covers clothing and shoes",
  },
];

function renderLog() {
  return render(
    <ToastProvider>
      <CommunicationsLog caseId="case1" />
    </ToastProvider>,
  );
}

describe("CommunicationsLog", () => {
  beforeEach(() => {
    vi.mocked(api.listCommunications).mockResolvedValue({ communications: entries });
  });

  it("renders entries newest first", async () => {
    renderLog();
    expect(await screen.findByText("Called to report the loss")).toBeInTheDocument();
    expect(screen.getByText("Jane Adjuster · Acme Insurance")).toBeInTheDocument();
  });

  it("shows the insurer statement for a discrepancy entry", async () => {
    renderLog();
    expect(await screen.findByText("What they told me")).toBeInTheDocument();
    expect(
      screen.getByText("They said it only covers clothing and shoes"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("What actually happened / what my policy says"),
    ).toBeInTheDocument();
  });
});
