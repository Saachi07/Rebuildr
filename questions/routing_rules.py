"""
Hand-coded routing rules.

This is the *ground truth* the decision tree learns from. We deliberately
write it as plain Python rather than as a config so it's easy to read,
debug, and audit. The synthetic data generator runs every fake user
through `assign_plan` to produce labels.

When you want to change how plans are assigned, change this file and
re-run train_model.py. The intake engine will pick up the new behaviour
automatically the next time it loads the pickled model.
"""

from typing import Dict


def assign_plan(features: Dict[str, int]) -> int:
    """
    Map a fully-specified feature dict to a plan_id (see plans.py).

    Priority order matters: earlier rules take precedence. The order
    encodes our routing philosophy — urgent shelter and missing ID
    come first because they block everything else.
    """
    housing = features["housing"]
    insurance = features["insurance"]
    income = features["income_affected"]
    applied = features["already_applied"]

    # 1. Highest urgency: no shelter tonight.
    if housing == 5:
        return 0  # Emergency Shelter First

    # 2. Missing government ID blocks most aid applications.
    if features["has_id"] == 0:
        return 1  # Replace Vital Documents First

    # 3. Indigenous Services pathway is structurally separate from DRP.
    if housing == 4:
        if applied in (2, 3):
            return 2  # ISC Pathway - Continuing
        return 3  # ISC Pathway - Starting Out

    # 4. Severe income disruption gets its own income-priority plan,
    #    but only if the user hasn't already started applications
    #    (otherwise the follow-up plans handle this better).
    if income in (1, 2) and applied == 0:
        if insurance == 1:  # explicitly uninsured
            return 4  # Income Disrupted - Uninsured
        return 5  # Income Disrupted - Insured (or unsure)

    # 5. Renter paths.
    if housing in (2, 3):
        if insurance == 0:
            return 6  # Insured Renter
        return 7  # Uninsured Renter

    # 6. Homeowner paths.
    if housing in (0, 1):
        if insurance == 0:  # insured
            if applied in (1, 3):
                return 8  # Insured Homeowner - Mid-Process
            return 9  # Insured Homeowner - Standard
        else:  # uninsured or not sure
            if applied in (2, 3):
                return 10  # Uninsured Homeowner - DRP Continuing
            return 11  # Uninsured Homeowner - DRP Starting Out

    # Defensive fallback — should not be reached given the question domain.
    return 9
