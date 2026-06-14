"""Unit tests for the pure logic behind the claims-management endpoints:
claim stage validation, readiness date math, export assembly, ALE totals,
and the rate limiter. No live database needed.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

pytest.importorskip("flask")

from app.blueprints.ale import sum_expenses  # noqa: E402
from app.blueprints.cases import CLAIM_STAGES, validate_claim_stage  # noqa: E402
from app.blueprints.me import build_export, is_recent  # noqa: E402
from app.services import rate_limit  # noqa: E402


class TestClaimStage:
    def test_all_known_stages_validate(self):
        for stage in CLAIM_STAGES:
            assert validate_claim_stage(stage)

    def test_unknown_stage_rejected(self):
        assert not validate_claim_stage("settled_maybe")
        assert not validate_claim_stage("")
        assert not validate_claim_stage(None)

    def test_expected_stages_present(self):
        for stage in ("not_started", "reported", "adjuster_assigned", "payout", "denied", "closed"):
            assert stage in CLAIM_STAGES


class TestIsRecent:
    def test_recent_timestamp(self):
        ts = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        assert is_recent(ts, 365)

    def test_old_timestamp(self):
        ts = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
        assert not is_recent(ts, 365)

    def test_none_and_garbage(self):
        assert not is_recent(None, 365)
        assert not is_recent("not a date", 365)

    def test_zulu_suffix(self):
        ts = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        assert is_recent(ts, 365)

    def test_naive_timestamp_assumed_utc(self):
        ts = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
        assert is_recent(ts, 365)


class TestBuildExport:
    def test_contains_every_section(self):
        out = build_export(
            profile={"id": "u1"},
            cases=[{"id": "c1"}],
            items=[],
            documents=[{"id": "d1"}],
            communications=[],
            ale_expenses=[],
            recommendations=[],
        )
        for key in (
            "exported_at",
            "profile",
            "cases",
            "items",
            "documents",
            "communications",
            "ale_expenses",
            "recommendations",
        ):
            assert key in out
        assert out["profile"]["id"] == "u1"
        assert out["cases"][0]["id"] == "c1"

    def test_exported_at_is_iso(self):
        out = build_export(
            profile={}, cases=[], items=[], documents=[],
            communications=[], ale_expenses=[], recommendations=[],
        )
        datetime.fromisoformat(out["exported_at"])


class TestAleTotals:
    def test_sums_amounts(self):
        rows = [{"amount": 100.5}, {"amount": "49.50"}, {"amount": 0}]
        assert sum_expenses(rows) == 150.0

    def test_ignores_garbage(self):
        rows = [{"amount": "abc"}, {"amount": None}, {}, {"amount": 25}]
        assert sum_expenses(rows) == 25.0

    def test_empty(self):
        assert sum_expenses([]) == 0.0


class TestRateLimit:
    def setup_method(self):
        rate_limit.reset()

    def test_allows_under_limit(self):
        for _ in range(5):
            assert rate_limit.check_rate_limit("u1", "k", 5)

    def test_blocks_over_limit(self):
        for _ in range(5):
            rate_limit.check_rate_limit("u1", "k", 5)
        assert not rate_limit.check_rate_limit("u1", "k", 5)

    def test_keys_are_independent(self):
        for _ in range(5):
            rate_limit.check_rate_limit("u1", "a", 5)
        assert rate_limit.check_rate_limit("u1", "b", 5)
        assert rate_limit.check_rate_limit("u2", "a", 5)
