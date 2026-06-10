"""Integration test for `personalize_more` — verify the dollar math
adds up across the unlocked resources, and that already-answered
questions don't appear."""

from datetime import date

import numpy as np

from recommender import Recommender


TODAY = date(2026, 6, 9)
UNIFORM = np.array([1.0 / 12] * 12)


def _build():
    return Recommender(load_embedder=False)


def test_personalize_more_suggests_unanswered_income_question():
    """A user who hasn't said anything about income shouldn't be
    matched against EI / income-support resources yet. The
    personalize_more block should call that out and value it correctly."""
    rec = _build()

    # Only answer housing — leave income_affected unset entirely.
    intake = {"housing": 1, "has_id": 1}

    result = rec.recommend(
        UNIFORM,
        {
            "region": "AB",
            "disaster_type": "wildfire",
            "disaster_date": "2026-06-01",
            "intake_answers": intake,
        },
        today=TODAY,
    )

    income_hint = next(
        (s for s in result["personalize_more"] if s["question_id"] == "income"),
        None,
    )
    assert income_hint is not None, "expected the income question to surface"

    # Saying "can't work temporarily" unlocks EI ($25k) + ab-income-support ($20k).
    # The best option should at least include EI ($25k).
    assert income_hint["estimated_unlock_cad"] >= 25_000
    assert "ei" in income_hint["would_unlock"]

    # And the copy should mention dollars in the expected format.
    assert "$" in income_hint["copy"]


def test_personalize_more_does_not_include_already_answered_questions():
    rec = _build()
    intake = {
        "housing": 1, "insurance": 0, "income_affected": 1,
        "already_applied": 1, "has_id": 1,
    }
    result = rec.recommend(
        UNIFORM,
        {"region": "AB", "disaster_type": "wildfire",
         "disaster_date": "2026-06-01", "intake_answers": intake},
        today=TODAY,
    )
    qids = {s["question_id"] for s in result["personalize_more"]}
    assert "housing" not in qids
    assert "insurance" not in qids
    assert "income" not in qids
    assert "applied" not in qids


def test_personalize_more_unlock_sum_matches_resource_max_benefits():
    """Stronger check: for the option the recommender picks, the
    `estimated_unlock_cad` must exactly equal the sum of
    `max_benefit_cad` across the listed `would_unlock` resource ids."""
    rec = _build()
    intake = {"housing": 1, "has_id": 1}

    result = rec.recommend(
        UNIFORM,
        {"region": "AB", "disaster_type": "wildfire",
         "disaster_date": "2026-06-01", "intake_answers": intake},
        today=TODAY,
    )

    # Look up max_benefit_cad on the seed resources via the recommender's
    # own resource list — same source of truth as the unlock estimator.
    resources_by_id = {r["id"]: r for r in rec.resources}

    for hint in result["personalize_more"]:
        expected = sum(
            int(resources_by_id[rid].get("max_benefit_cad") or 0)
            for rid in hint["would_unlock"]
        )
        assert hint["estimated_unlock_cad"] == expected, (
            f"{hint['question_id']}: copy says ${hint['estimated_unlock_cad']:,} "
            f"but sum of max_benefit_cad over {hint['would_unlock']} is ${expected:,}"
        )
