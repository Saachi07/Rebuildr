import { describe, expect, it } from "vitest";
import { claimClassLabel, salvageableLabel, contentsBreakdown } from "../Inventory";

describe("claimClassLabel", () => {
  it("maps each claim class to a friendly label", () => {
    expect(claimClassLabel("contents")).toBe("Contents");
    expect(claimClassLabel("building")).toBe("Part of the building");
    expect(claimClassLabel("unclear")).toBe("Unclear");
  });

  it("returns null for missing or unknown values", () => {
    expect(claimClassLabel(null)).toBeNull();
    expect(claimClassLabel(undefined)).toBeNull();
  });
});

describe("salvageableLabel", () => {
  it("maps salvage states to calm, non-promise labels", () => {
    expect(salvageableLabel("likely")).toBe("May be salvageable");
    expect(salvageableLabel("unlikely")).toBe("Likely a loss");
    expect(salvageableLabel("needs_professional_assessment")).toBe("Needs a professional look");
  });

  it("returns null when there is nothing to say", () => {
    expect(salvageableLabel(null)).toBeNull();
    expect(salvageableLabel(undefined)).toBeNull();
  });
});

describe("contentsBreakdown", () => {
  it("counts contents and unclear toward the contents subtotal, excludes building", () => {
    const items = [
      { estimated_value: 100, claim_class: "contents" as const },
      { estimated_value: 50, claim_class: "unclear" as const },
      { estimated_value: 200, claim_class: "building" as const },
    ];
    const r = contentsBreakdown(items);
    expect(r.contents).toBe(150);
    expect(r.total).toBe(350);
    expect(r.buildingPresent).toBe(true);
  });

  it("reports no building items when none are present", () => {
    const items = [
      { estimated_value: 100, claim_class: "contents" as const },
      { estimated_value: 40, claim_class: "unclear" as const },
    ];
    const r = contentsBreakdown(items);
    expect(r.contents).toBe(140);
    expect(r.total).toBe(140);
    expect(r.buildingPresent).toBe(false);
  });

  it("treats missing claim class and missing value safely", () => {
    const items = [
      { estimated_value: undefined, claim_class: null },
      { claim_class: undefined },
      { estimated_value: 75, claim_class: "contents" as const },
    ];
    const r = contentsBreakdown(items);
    expect(r.contents).toBe(75);
    expect(r.total).toBe(75);
    expect(r.buildingPresent).toBe(false);
  });
});
