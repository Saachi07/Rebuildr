"""Scorer test — verify `priority_floor` promotes gio-ombud for a
denied claim, and that dismissals filter out resources entirely."""

from datetime import date

import numpy as np

from recommender import (
    DocumentFindings,
    Recommender,
)


TODAY = date(2026, 6, 9)
UNIFORM = np.array([1.0 / 12] * 12)


def _build():
    # No embedder, no DB — feed the seed list directly.
    return Recommender(load_embedder=False)


def test_priority_floor_promotes_gio_ombud_on_denial():
    rec = _build()
    intake = {
        "housing": 1,            # owner, displaced
        "insurance": 0,          # insured
        "already_applied": 1,    # claim filed
        "income_affected": 0,
        "has_id": 1,
    }
    doc = DocumentFindings(denial_flag=True)

    result = rec.recommend(
        UNIFORM,
        {
            "region": "AB",
            "disaster_type": "wildfire",
            "disaster_date": "2026-06-01",
            "intake_answers": intake,
        },
        document_findings=doc,
        today=TODAY,
    )

    financial = result["by_category"].get("financial", [])
    assert financial, "expected at least one financial recommendation"
    top_id = financial[0].resource["id"]
    assert top_id == "gio-ombud", (
        f"expected gio-ombud to lead financial category for a denial; got {top_id}"
    )
    # And the floor (0.85) should be visible in the final score.
    assert financial[0].score >= 0.85


def test_priority_floor_does_not_promote_when_resource_filtered_out():
    """Without insurance_claim_filed, gio-ombud is filtered — the floor
    cannot resurrect a resource that failed the hard filter."""
    rec = _build()
    intake = {
        "housing": 1, "insurance": 0,
        "already_applied": 0,    # NOT filed → no insurance_claim_filed tag
        "income_affected": 0, "has_id": 1,
    }
    doc = DocumentFindings(denial_flag=True)

    result = rec.recommend(
        UNIFORM,
        {"region": "AB", "disaster_type": "wildfire",
         "disaster_date": "2026-06-01", "intake_answers": intake},
        document_findings=doc,
        today=TODAY,
    )
    all_ids = [
        r.resource["id"]
        for recs in result["by_category"].values()
        for r in recs
    ]
    assert "gio-ombud" not in all_ids


def test_dismissed_resource_is_filtered_out():
    rec = _build()
    intake = {"housing": 5, "insurance": 2, "income_affected": 0, "has_id": 1}

    result = rec.recommend(
        UNIFORM,
        {"region": "AB", "disaster_type": "wildfire",
         "disaster_date": "2026-06-01", "intake_answers": intake},
        dismissed_resource_ids={"red-cross-lodging"},
        debug=True,
        today=TODAY,
    )
    all_ids = [
        r.resource["id"]
        for recs in result["by_category"].values()
        for r in recs
    ]
    assert "red-cross-lodging" not in all_ids
    assert result["debug"]["filtered_out"].get("red-cross-lodging") == "dismissed by user"


def test_top_pick_is_the_highest_scoring():
    rec = _build()
    intake = {"housing": 1, "insurance": 0, "already_applied": 1, "has_id": 1}
    result = rec.recommend(
        UNIFORM,
        {"region": "AB", "disaster_type": "wildfire",
         "disaster_date": "2026-06-01", "intake_answers": intake},
        document_findings=DocumentFindings(denial_flag=True),
        today=TODAY,
    )
    top = result["top_pick"]
    assert top is not None
    all_recs = [r for recs in result["by_category"].values() for r in recs]
    assert top.score == max(r.score for r in all_recs)
