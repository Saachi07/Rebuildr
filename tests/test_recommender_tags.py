"""Unit tests for `derive_tags` — one assertion per new tag plus a few
of the existing intake-only tags to guard against regressions."""

from datetime import date, timedelta

import pytest

from recommender import (
    DamageSeverity,
    DocumentDeadline,
    DocumentFindings,
    InventorySummary,
    derive_tags,
)


TODAY = date(2026, 6, 9)


def test_intake_only_owner_displaced():
    tags = derive_tags({"housing": 1, "insurance": 0})
    assert "owner" in tags
    assert "displaced" in tags
    assert "insured" in tags


def test_inventory_total_loss_implies_structural():
    inv = InventorySummary(damage_severity=DamageSeverity.TOTAL_LOSS)
    tags = derive_tags({}, inventory_summary=inv, today=TODAY)
    assert "total_loss" in tags
    assert "structural_damage" in tags


def test_inventory_structural_only():
    inv = InventorySummary(damage_severity=DamageSeverity.STRUCTURAL)
    tags = derive_tags({}, inventory_summary=inv, today=TODAY)
    assert "structural_damage" in tags
    assert "total_loss" not in tags
    assert "cosmetic_only" not in tags


def test_inventory_cosmetic_only():
    inv = InventorySummary(damage_severity=DamageSeverity.COSMETIC)
    tags = derive_tags({}, inventory_summary=inv, today=TODAY)
    assert "cosmetic_only" in tags
    assert "structural_damage" not in tags


def test_inventory_moderate_emits_no_severity_tag():
    inv = InventorySummary(damage_severity=DamageSeverity.MODERATE)
    tags = derive_tags({}, inventory_summary=inv, today=TODAY)
    assert "cosmetic_only" not in tags
    assert "structural_damage" not in tags
    assert "total_loss" not in tags


@pytest.mark.parametrize("passthrough", [
    "smoke_damage",
    "water_damage",
    "medication_visible",
    "documents_destroyed",
    "pet_items_present",
    "appliances_lost",
])
def test_inventory_passthrough_tags(passthrough):
    inv = InventorySummary(detected_tags={passthrough})
    tags = derive_tags({}, inventory_summary=inv, today=TODAY)
    assert passthrough in tags


def test_inventory_unknown_tag_is_dropped():
    inv = InventorySummary(detected_tags={"unicorn_horn"})
    tags = derive_tags({}, inventory_summary=inv, today=TODAY)
    assert "unicorn_horn" not in tags


def test_document_denial():
    doc = DocumentFindings(denial_flag=True)
    tags = derive_tags({}, document_findings=doc, today=TODAY)
    assert "denial_received" in tags


def test_document_ale_exhausted():
    doc = DocumentFindings(ale_exhausted=True)
    tags = derive_tags({}, document_findings=doc, today=TODAY)
    assert "ale_exhausted" in tags


def test_document_deadline_within_7d():
    doc = DocumentFindings(deadlines=[
        DocumentDeadline("policy.pdf", "DRP deadline", TODAY + timedelta(days=3)),
    ])
    tags = derive_tags({}, document_findings=doc, today=TODAY)
    assert "deadline_within_7d" in tags
    assert "deadline_within_30d" not in tags  # 7d takes precedence


def test_document_deadline_within_30d():
    doc = DocumentFindings(deadlines=[
        DocumentDeadline("policy.pdf", "DRP deadline", TODAY + timedelta(days=18)),
    ])
    tags = derive_tags({}, document_findings=doc, today=TODAY)
    assert "deadline_within_30d" in tags
    assert "deadline_within_7d" not in tags


def test_document_deadline_far_future_emits_no_deadline_tag():
    doc = DocumentFindings(deadlines=[
        DocumentDeadline("policy.pdf", "DRP deadline", TODAY + timedelta(days=120)),
    ])
    tags = derive_tags({}, document_findings=doc, today=TODAY)
    assert "deadline_within_7d" not in tags
    assert "deadline_within_30d" not in tags


def test_combined_signals():
    intake = {"housing": 1, "insurance": 0, "already_applied": 1}
    inv = InventorySummary(
        damage_severity=DamageSeverity.STRUCTURAL,
        detected_tags={"smoke_damage", "medication_visible"},
    )
    doc = DocumentFindings(
        denial_flag=True,
        deadlines=[DocumentDeadline("letter.pdf", "appeal", TODAY + timedelta(days=5))],
    )
    tags = derive_tags(intake, inv, doc, today=TODAY)
    # Every new tag we expect to see in one combined call.
    expected = {
        "owner", "displaced", "insured", "insurance_claim_filed",
        "structural_damage", "smoke_damage", "medication_visible",
        "denial_received", "deadline_within_7d",
    }
    assert expected.issubset(tags), f"missing: {expected - tags}"
