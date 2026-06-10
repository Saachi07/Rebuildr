"""
Synthetic data generator.

We don't have a dataset of real disaster recovery cases, so we generate
one. The priors below are rough estimates intended to be *plausible* for
Alberta wildfire recovery — not statistically calibrated to any specific
event. Tune them as your team learns more about realistic distributions.

Each generated user is a vector of feature values; the label comes from
routing_rules.assign_plan. We save the result as a compressed .npz file
that train_model.py and intake_engine.py both load.
"""

import numpy as np

from questions import FEATURE_NAMES
from routing_rules import assign_plan


# Prior distributions for each feature.
# Each is a list of (value, probability) pairs that sum to ~1.0.
PRIORS = {
    "housing": [
        (0, 0.20),  # at home, livable
        (1, 0.30),  # owner displaced
        (2, 0.12),  # renter livable
        (3, 0.20),  # renter displaced
        (4, 0.08),  # on-reserve / Métis settlement
        (5, 0.10),  # needs shelter
    ],
    "insurance": [
        (0, 0.55),  # yes
        (1, 0.25),  # no
        (2, 0.20),  # not sure
    ],
    "income_affected": [
        (0, 0.30),  # still working
        (1, 0.35),  # can't work temporarily
        (2, 0.20),  # lost job / business
        (3, 0.15),  # already on assistance
    ],
    "already_applied": [
        (0, 0.55),  # haven't started
        (1, 0.20),  # insurance claim
        (2, 0.10),  # gov aid
        (3, 0.15),  # both
    ],
    # Multi-select features default to "have it" being common,
    # except "has_id" where loss is meaningful but uncommon.
    "has_id": [(0, 0.10), (1, 0.90)],
    "has_insurance_doc": [(0, 0.40), (1, 0.60)],
    "has_deed": [(0, 0.45), (1, 0.55)],
    "has_financial_records": [(0, 0.50), (1, 0.50)],
    "has_kids": [(0, 0.60), (1, 0.40)],
    "has_seniors": [(0, 0.75), (1, 0.25)],
    "has_disability": [(0, 0.80), (1, 0.20)],
    "has_pets": [(0, 0.50), (1, 0.50)],
}


def sample_one(rng: np.random.Generator) -> dict:
    """Generate one random feature dict."""
    out = {}
    for feat in FEATURE_NAMES:
        values, probs = zip(*PRIORS[feat])
        out[feat] = int(rng.choice(values, p=probs))
    return out


def generate(n: int = 10_000, seed: int = 42):
    """Generate N synthetic users with labels. Returns (X, y) numpy arrays."""
    rng = np.random.default_rng(seed)
    X = np.zeros((n, len(FEATURE_NAMES)), dtype=np.int32)
    y = np.zeros(n, dtype=np.int32)
    for i in range(n):
        feats = sample_one(rng)
        for j, name in enumerate(FEATURE_NAMES):
            X[i, j] = feats[name]
        y[i] = assign_plan(feats)
    return X, y


def main():
    print("Generating 10,000 synthetic recovery cases...")
    X, y = generate(n=10_000)
    print(f"  X shape: {X.shape}, y shape: {y.shape}")
    print(f"  Plan distribution:")
    plan_ids, counts = np.unique(y, return_counts=True)
    for pid, c in zip(plan_ids, counts):
        print(f"    Plan {pid:2d}: {c:5d} cases ({c/len(y)*100:.1f}%)")
    np.savez_compressed("synthetic_data.npz", X=X, y=y)
    print("Saved to synthetic_data.npz")


if __name__ == "__main__":
    main()
