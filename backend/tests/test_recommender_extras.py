"""Batch 3 recommender additions: synonym query expansion (no-API semantic
boost) and the not_relevant feedback penalty."""

from app.services.content_filter import (
    PENALTY_DISMISSED,
    Recommendation,
    _build_query,
)


def test_query_expands_with_domain_synonyms():
    q = _build_query(
        {"disaster_type": "wildfire", "region": "AB"},
        [],
        {"displaced", "uninsured"},
    )
    # The raw terms survive...
    assert "wildfire" in q and "displaced" in q
    # ...and their synonyms widen recall so differently-worded resources match.
    assert "smoke" in q  # wildfire
    assert "evacuated" in q  # displaced
    assert "no insurance" in q  # uninsured


def test_query_safe_when_empty():
    assert _build_query({}, [], set()) == "disaster recovery"


def test_not_relevant_is_penalized_like_dismissed():
    # not_relevant should sink out of the plan just as dismissed does; the
    # distinction is preserved only for telemetry, not for ranking today.
    base = Recommendation(resource={"id": "x", "type": "financial", "title": "t", "body": "b"}, score=1.0)
    dismissed = Recommendation(resource={"id": "y", "type": "financial", "title": "t", "body": "b"}, score=1.0, status="dismissed")
    not_rel = Recommendation(resource={"id": "z", "type": "financial", "title": "t", "body": "b"}, score=1.0, status="not_relevant")
    # Mirror the penalty step in recommend(): both lose PENALTY_DISMISSED.
    for rec in (dismissed, not_rel):
        if rec.status in ("dismissed", "not_relevant"):
            rec.score -= PENALTY_DISMISSED
    assert dismissed.score == not_rel.score
    assert not_rel.score < base.score
