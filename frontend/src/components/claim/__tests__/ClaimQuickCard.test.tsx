import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ClaimQuickCard from "../ClaimQuickCard";
import { Case, UserDocument } from "../../../api";

const caseDoc: Case = {
  id: "case1",
  case_name: "Basement flood",
  disaster_type: "flood",
};

describe("ClaimQuickCard", () => {
  it("extracts fields from the object shape of key_fields", () => {
    const docs: UserDocument[] = [
      {
        id: "d1",
        name: "policy.pdf",
        gemini_analysis: {
          key_fields: {
            "Policy Number": "POL-123",
            "Claim Number": "CLM-999",
          },
        },
      },
    ];
    render(<ClaimQuickCard caseDoc={caseDoc} documents={docs} />);
    expect(screen.getByText("POL-123")).toBeInTheDocument();
    expect(screen.getByText("CLM-999")).toBeInTheDocument();
  });

  it("extracts fields from the array shape of key_fields", () => {
    const docs: UserDocument[] = [
      {
        id: "d2",
        name: "policy.pdf",
        gemini_analysis: {
          key_fields: [
            { label: "Adjuster Name", value: "Sam Reyes" },
            { label: "Claims Department Phone", value: "1-800-555-0100" },
          ],
        },
      },
    ];
    render(<ClaimQuickCard caseDoc={caseDoc} documents={docs} />);
    expect(screen.getByText("Sam Reyes")).toBeInTheDocument();
    expect(screen.getByText("1-800-555-0100")).toBeInTheDocument();
  });

  it("shows a hint when a field is missing", () => {
    render(<ClaimQuickCard caseDoc={caseDoc} documents={[]} />);
    expect(screen.getAllByText(/Not found yet, upload your policy/i).length).toBeGreaterThan(0);
  });
});
