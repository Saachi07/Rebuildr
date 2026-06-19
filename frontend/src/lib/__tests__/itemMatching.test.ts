import { describe, expect, it } from "vitest";
import {
  AUTO_THRESHOLD,
  MAYBE_THRESHOLD,
  MatchCandidate,
  MatchTarget,
  matchDrafts,
  normalizeName,
  scoreName,
  scorePair,
  scorePrice,
} from "../itemMatching";

describe("normalizeName", () => {
  it("lowercases, splits on punctuation, and drops filler words", () => {
    expect(normalizeName("The Grey 3-seat Sofa")).toEqual(["grey", "3", "seat", "sofa"]);
  });

  it("returns an empty list for a blank or symbol-only name", () => {
    expect(normalizeName("   ")).toEqual([]);
    expect(normalizeName("---")).toEqual([]);
  });
});

describe("scoreName", () => {
  it("scores identical names as a perfect match", () => {
    expect(scoreName("Grey sofa", "grey sofa")).toBe(1);
  });

  it("scores a subset name in the maybe band, not the auto band", () => {
    // pre: "Grey 3-seat sofa", post: "Sofa" -- same object, leaner name.
    const s = scoreName("Grey 3-seat sofa", "Sofa");
    expect(s).toBeGreaterThanOrEqual(MAYBE_THRESHOLD);
    expect(s).toBeLessThan(AUTO_THRESHOLD);
  });

  it("scores unrelated names near zero", () => {
    expect(scoreName("Floor lamp", "Dining table")).toBe(0);
  });
});

describe("scorePrice", () => {
  it("is a perfect match when the value sits inside the range", () => {
    expect(scorePrice(950, 900, 1000)).toBe(1);
  });

  it("falls off with relative distance outside the range", () => {
    // 1100 vs a 900-1000 range: 10% past the top edge -> 0.9.
    expect(scorePrice(1100, 900, 1000)).toBeCloseTo(0.9, 5);
  });

  it("is ignored (null) when numbers are missing", () => {
    expect(scorePrice(null, 900, 1000)).toBeNull();
    expect(scorePrice(950, null, null)).toBeNull();
  });

  it("scores near zero for a wildly different price", () => {
    // $50 vs a $900 floor is ~94% off, so the falloff leaves only a sliver.
    expect(scorePrice(50, 900, 1000)).toBeLessThan(0.1);
  });

  it("hits exactly zero once the value is a full multiple off", () => {
    expect(scorePrice(2000, 900, 1000)).toBe(0);
  });
});

describe("scorePair", () => {
  const preSofa: MatchTarget = {
    id: "pre-1",
    name: "Grey 3-seat sofa",
    category: "furniture",
    brand: "IKEA",
    size: "large",
    value: 950,
  };

  it("gates out cross-category pairs no matter how names read", () => {
    const candidate: MatchCandidate = {
      id: "post-1",
      name: "Grey 3-seat sofa",
      category: "electronics",
      brand: "IKEA",
      size: "large",
      priceLow: 900,
      priceHigh: 1000,
    };
    expect(scorePair(candidate, preSofa)).toBe(0);
  });

  it("scores a strong same-object match in the auto band", () => {
    const candidate: MatchCandidate = {
      id: "post-1",
      name: "Grey 3-seat sofa",
      category: "furniture",
      brand: "IKEA",
      size: "large",
      priceLow: 900,
      priceHigh: 1000,
    };
    expect(scorePair(candidate, preSofa)).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
  });

  it("does not penalise a candidate that is missing brand/size/price", () => {
    const bare: MatchCandidate = {
      id: "post-1",
      name: "Grey 3-seat sofa",
      category: "furniture",
    };
    // Name is identical and it is the only signal, so the score is the name score (1).
    expect(scorePair(bare, preSofa)).toBe(1);
  });
});

describe("matchDrafts", () => {
  it("pairs the obvious twin and leaves a genuinely new item unmatched", () => {
    const candidates: MatchCandidate[] = [
      { id: "post-sofa", name: "Grey sofa", category: "furniture", priceLow: 900, priceHigh: 1000 },
      { id: "post-tv", name: "55 inch TV", category: "electronics", priceLow: 600, priceHigh: 800 },
    ];
    const targets: MatchTarget[] = [
      { id: "pre-sofa", name: "Grey 3-seat sofa", category: "furniture", value: 950 },
    ];

    const { suggestions, unmatchedCandidateIds } = matchDrafts(candidates, targets);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ candidateId: "post-sofa", targetId: "pre-sofa" });
    expect(unmatchedCandidateIds).toEqual(["post-tv"]);
  });

  it("never assigns one pre row to two post items (1-to-1)", () => {
    const candidates: MatchCandidate[] = [
      { id: "post-a", name: "Grey armchair", category: "furniture", priceLow: 300, priceHigh: 400 },
      { id: "post-b", name: "Grey armchair", category: "furniture", priceLow: 300, priceHigh: 400 },
    ];
    const targets: MatchTarget[] = [
      { id: "pre-a", name: "Grey armchair", category: "furniture", value: 350 },
    ];

    const { suggestions, unmatchedCandidateIds } = matchDrafts(candidates, targets);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].targetId).toBe("pre-a");
    // Exactly one of the two duplicates is left for the user to save as new.
    expect(unmatchedCandidateIds).toHaveLength(1);
  });

  it("claims the higher-scoring pair first when targets compete", () => {
    const candidates: MatchCandidate[] = [
      { id: "post-exact", name: "Oak dining table", category: "furniture" },
    ];
    const targets: MatchTarget[] = [
      { id: "pre-loose", name: "Dining table", category: "furniture" },
      { id: "pre-exact", name: "Oak dining table", category: "furniture" },
    ];

    const { suggestions } = matchDrafts(candidates, targets);
    expect(suggestions[0].targetId).toBe("pre-exact");
    expect(suggestions[0].confidence).toBe("high");
  });

  it("does not suggest pairs below the maybe threshold", () => {
    const candidates: MatchCandidate[] = [
      { id: "post-x", name: "Toaster", category: "appliance" },
    ];
    const targets: MatchTarget[] = [
      { id: "pre-y", name: "Refrigerator", category: "appliance" },
    ];

    const { suggestions, unmatchedCandidateIds } = matchDrafts(candidates, targets);
    expect(suggestions).toHaveLength(0);
    expect(unmatchedCandidateIds).toEqual(["post-x"]);
  });
});
