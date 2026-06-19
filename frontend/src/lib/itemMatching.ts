// Pairing "after" (post-disaster) scan items back to the "before" rows the user
// already saved, so one physical object (the same sofa) becomes a single
// inventory row carrying both its before_url and after_url instead of two
// unrelated entries.
//
// This module is pure and UI-agnostic: it scores how likely a freshly scanned
// post item is the same object as an existing pre row, then proposes a 1-to-1
// set of pairings. It NEVER merges on its own. Every suggestion is something the
// user confirms, because two grey armchairs in the same room would otherwise be
// silently fused. The caller decides what to do with the suggestions (PATCH the
// matched pre row vs. insert a new one).

// A post-scan item looking for its before-twin. Categories must already be
// normalized to the inventory's category vocabulary (run mapCategory first) so
// the gate below compares like with like.
export type MatchCandidate = {
  id: string;
  name: string;
  category: string;
  brand?: string | null;
  size?: string | null;
  // The scan gives a replacement-cost range; the saved row stores a single
  // value, so we compare a range against a point in scorePrice.
  priceLow?: number | null;
  priceHigh?: number | null;
};

// An already-saved before row that has no after photo yet, i.e. still eligible
// to be paired.
export type MatchTarget = {
  id: string;
  name: string;
  category: string;
  brand?: string | null;
  size?: string | null;
  value?: number | null;
};

export type Suggestion = {
  candidateId: string;
  targetId: string;
  score: number;
  // "high" pairings are confident enough to pre-check in the UI; "maybe"
  // pairings are shown but left for the user to opt into.
  confidence: "high" | "maybe";
};

export type MatchResult = {
  suggestions: Suggestion[];
  unmatchedCandidateIds: string[];
};

// At or above AUTO we pre-check the pairing; between MAYBE and AUTO we surface it
// unchecked; below MAYBE we do not suggest it at all and the item saves as new.
export const AUTO_THRESHOLD = 0.8;
export const MAYBE_THRESHOLD = 0.55;

// Relative weight of each signal. Name dominates because it is the only signal
// always present; brand/size/price only nudge the score and are dropped from
// the average when a value is missing (so a missing brand never penalises).
const WEIGHTS = { name: 0.7, brand: 0.15, size: 0.05, price: 0.1 } as const;

// Generic filler that carries no identity. Kept tiny on purpose: real
// distinguishing words (colours, materials, "3-seat") should still count.
const STOP_WORDS = new Set(["the", "a", "an", "of", "with", "and"]);

export function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length > 0 && !STOP_WORDS.has(tok));
}

// Name similarity blends two views so it is fair when one name is richer than
// the other (pre: "Grey 3-seat sofa", post: "Sofa"):
//   - Dice rewards overall token overlap (penalises extra words),
//   - containment rewards when the shorter name is a subset of the longer.
// The average lands such pairs in the "maybe" band, where the user confirms.
export function scoreName(a: string, b: string): number {
  const ta = new Set(normalizeName(a));
  const tb = new Set(normalizeName(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  let shared = 0;
  for (const tok of ta) if (tb.has(tok)) shared++;

  const dice = (2 * shared) / (ta.size + tb.size);
  const containment = shared / Math.min(ta.size, tb.size);
  return 0.5 * dice + 0.5 * containment;
}

// 1 for an exact (case-insensitive) match, 0 otherwise. Returns null when either
// side is blank so the signal is simply ignored rather than counted as a miss.
function scoreExact(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
}

// How close the saved point value sits to the scanned range. Inside the range
// scores 1; outside, it falls off with relative distance so a $1,100 saved sofa
// still matches a $900-$1,000 scan well, but a $50 lamp does not. Returns null
// when we lack the numbers to judge.
export function scorePrice(
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): number | null {
  if (value == null || (low == null && high == null)) return null;
  const lo = low ?? high!;
  const hi = high ?? low!;
  if (value >= lo && value <= hi) return 1;

  const nearest = value < lo ? lo : hi;
  if (nearest <= 0) return 0;
  const relDistance = Math.abs(value - nearest) / nearest;
  // Linear falloff: equal at the edge, zero once it is a full multiple off.
  return Math.max(0, 1 - relDistance);
}

// Combined likelihood that a candidate and target are the same object, in
// [0, 1]. A category mismatch is a hard gate and returns 0 outright: a "sofa"
// can never pair with a "lamp" no matter how the names read.
export function scorePair(candidate: MatchCandidate, target: MatchTarget): number {
  if (normalizeCategory(candidate.category) !== normalizeCategory(target.category)) {
    return 0;
  }

  const parts: { weight: number; value: number }[] = [
    { weight: WEIGHTS.name, value: scoreName(candidate.name, target.name) },
  ];
  const brand = scoreExact(candidate.brand, target.brand);
  if (brand != null) parts.push({ weight: WEIGHTS.brand, value: brand });
  const size = scoreExact(candidate.size, target.size);
  if (size != null) parts.push({ weight: WEIGHTS.size, value: size });
  const price = scorePrice(target.value, candidate.priceLow, candidate.priceHigh);
  if (price != null) parts.push({ weight: WEIGHTS.price, value: price });

  // Renormalize over only the signals we actually had, so a candidate missing
  // brand/size/price is not capped below 1.
  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  return parts.reduce((sum, p) => sum + p.weight * p.value, 0) / totalWeight;
}

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

// Greedy 1-to-1 assignment: rank every viable pair by score and claim the best
// ones first, so each pre row is paired with at most one post item and vice
// versa. Greedy (not optimal assignment) is deliberate; the user reviews the
// result, and the highest-scoring pairs are the ones we are most sure about, so
// taking them first is the safe order.
export function matchDrafts(
  candidates: MatchCandidate[],
  targets: MatchTarget[],
): MatchResult {
  const pairs: { candidateId: string; targetId: string; score: number }[] = [];
  for (const c of candidates) {
    for (const t of targets) {
      const score = scorePair(c, t);
      if (score >= MAYBE_THRESHOLD) {
        pairs.push({ candidateId: c.id, targetId: t.id, score });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedCandidates = new Set<string>();
  const usedTargets = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const pair of pairs) {
    if (usedCandidates.has(pair.candidateId) || usedTargets.has(pair.targetId)) {
      continue;
    }
    usedCandidates.add(pair.candidateId);
    usedTargets.add(pair.targetId);
    suggestions.push({
      candidateId: pair.candidateId,
      targetId: pair.targetId,
      score: pair.score,
      confidence: pair.score >= AUTO_THRESHOLD ? "high" : "maybe",
    });
  }

  const unmatchedCandidateIds = candidates
    .filter((c) => !usedCandidates.has(c.id))
    .map((c) => c.id);

  return { suggestions, unmatchedCandidateIds };
}
