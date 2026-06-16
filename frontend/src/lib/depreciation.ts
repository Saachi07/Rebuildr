// Insurers settle contents claims on actual cash value (ACV, the depreciated
// worth) unless the item is actually replaced, when they pay replacement cost
// (RCV). Survivors lose money when they cannot show how old something was, so we
// estimate the depreciated value next to the replacement cost to arm them for
// the claim conversation. This is a rough straight-line estimate to start that
// conversation, not an appraisal.

// Typical useful life in years by item category. Keep keys aligned with the
// inventory CATEGORIES.
const USEFUL_LIFE_YEARS: Record<string, number> = {
  electronics: 5,
  appliance: 12,
  furniture: 15,
  clothing: 5,
  other: 10,
};

// Nothing depreciates below this fraction of its replacement cost: a usable
// item retains some value no matter its age.
const SALVAGE_FLOOR = 0.2;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function ageInYears(purchaseDate?: string | null): number | null {
  if (!purchaseDate) return null;
  const then = new Date(purchaseDate);
  if (isNaN(then.getTime())) return null;
  const ms = Date.now() - then.getTime();
  if (ms <= 0) return 0;
  return ms / MS_PER_YEAR;
}

// Estimated actual cash value. Returns null when the purchase date is unknown,
// because without an age we cannot depreciate and should not pretend to.
export function depreciatedValue(
  replacementCost: number,
  category?: string | null,
  purchaseDate?: string | null,
): number | null {
  const age = ageInYears(purchaseDate);
  if (age == null) return null;
  const life = USEFUL_LIFE_YEARS[category ?? "other"] ?? USEFUL_LIFE_YEARS.other;
  const remaining = Math.max(SALVAGE_FLOOR, 1 - age / life);
  return Math.round((replacementCost ?? 0) * remaining);
}
