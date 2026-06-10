"""
Resource recommender.

Layers on top of the intake engine. Takes the plan probability
distribution the engine produces, plus whatever context the backend
has (region, disaster type, insurance company, disaster date, image
classifier output, document analyser output), and returns a categorised
list of "maybe you can do" suggestions.

Design
------
Two-stage pipeline. Eligibility is non-negotiable so it's a hard
filter; relevance is soft so it's a weighted score.

  candidate generation  →  hard filter  →  score  →  diversify

Score components (linear, hand-tuned; deliberately not learned —
that's a post-MVP swap):

  score(r) = α · plan_alignment(r, plan_distribution)
           + β · feature_match(r, user_tags)
           + γ · semantic_sim(r.body, user_situation_text)
           + δ · freshness(r.scraped_at)
           + ζ · insurer_match(r, user_context.insurance_company)
           + η · urgency_boost(r, days_since_disaster)
           + θ · deadline_pressure(r, document_findings)
           − ε · already_done(r, completed_resource_ids)

  final_score(r) = max(score(r), r.priority_floor)

`reasons` is a small list of human-readable strings attached to each
recommendation so the UI can render "Suggested because: …" copy. That
transparency is the point of the "maybe you can do" framing.

This module stays importable without a database — `Recommender()` with
no arguments still works from the seed `RESOURCES` list. The backend
injects DB-loaded resources via the `resources=` kwarg.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Optional

import numpy as np

from embeddings import ResourceEmbedder, user_situation_text
from plans import plan_by_id
from questions import QUESTIONS
from resources import RESOURCES


# ---------------------------------------------------------------------------
# Tunable weights — these are starting points. Once feedback events
# (saved / dismissed / acted-on) accumulate, replace this scorer with a
# learning-to-rank model and treat these as the prior.
# ---------------------------------------------------------------------------
ALPHA_PLAN = 0.5
BETA_FEATURE = 0.3
GAMMA_SEMANTIC = 0.2
DELTA_FRESH = 0.1
ZETA_INSURER = 0.8
ETA_URGENCY = 0.6
THETA_DEADLINE = 0.7
EPSILON_DONE = 1.0  # penalty for resources the user already marked done

TOP_K_PER_CATEGORY = 3
URGENT_DISASTER_DAYS = 7
FRESH_HALFLIFE_DAYS = 30
DEADLINE_RADAR_LIMIT = 5


# ---------------------------------------------------------------------------
# Inputs from upstream pipelines
# ---------------------------------------------------------------------------

class DamageSeverity(str, Enum):
    COSMETIC = "cosmetic"
    MODERATE = "moderate"
    STRUCTURAL = "structural"
    TOTAL_LOSS = "total_loss"


@dataclass
class InventorySummary:
    """
    Output of the image classification pipeline (Phase I/II).

    `detected_tags` is an open string set. The vocabulary the recommender
    looks for includes: medication_visible, documents_destroyed,
    pet_items_present, appliances_lost, smoke_damage, water_damage.
    Extra tags are passed through verbatim — fine if they don't match
    anything, they just don't trigger filters.
    """
    total_value_low: float = 0.0
    total_value_high: float = 0.0
    damage_severity: Optional[DamageSeverity] = None
    detected_tags: set[str] = field(default_factory=set)


@dataclass
class DocumentDeadline:
    source_doc: str          # filename / id of the document this came from
    label: str               # human label, e.g. "DRP application deadline"
    due_date: date


@dataclass
class DocumentFindings:
    """
    Output of the document analyser (Phase II) — what the LLM extracted
    from uploaded insurance / aid PDFs.
    """
    deadlines: list[DocumentDeadline] = field(default_factory=list)
    denial_flag: bool = False
    extracted_insurer: Optional[str] = None
    ale_exhausted: bool = False


@dataclass
class Recommendation:
    resource: dict
    score: float
    reasons: list[str] = field(default_factory=list)
    days_until_deadline: Optional[int] = None  # populated when there's a known deadline

    def to_dict(self) -> dict:
        return {
            "id": self.resource["id"],
            "type": self.resource["type"],
            "title": self.resource["title"],
            "body": self.resource["body"],
            "url": self.resource.get("url"),
            "phone": self.resource.get("phone"),
            "score": round(self.score, 3),
            "reasons": self.reasons,
            "days_until_deadline": self.days_until_deadline,
        }


# ---------------------------------------------------------------------------
# Insurer name normalization
# ---------------------------------------------------------------------------

_INSURER_STRIP_TOKENS = (
    "insurance", "company", "inc.", "inc", "ltd.", "ltd",
    "limited", "corp.", "corp", "corporation",
)


def normalize_insurer(name: Optional[str]) -> Optional[str]:
    """
    Cheap one-liner-ish normalizer. Lowercase, trim, strip suffix words
    that don't help with matching. Deliberately NOT a full alias table —
    we accept ambiguity (e.g. "TD" matching both "TD Insurance" and
    "TD General") rather than building a registry we'd have to maintain.
    """
    if not name:
        return None
    s = name.lower().strip()
    for tok in _INSURER_STRIP_TOKENS:
        s = s.replace(tok, "")
    s = " ".join(s.split())
    return s or None


# ---------------------------------------------------------------------------
# Tag derivation — the one place numeric intake features get translated
# into semantic tags. The vocabulary here is what `resources.requires` /
# `resources.excludes` reference.
# ---------------------------------------------------------------------------

# Strings the image pipeline can emit that we pass straight through to tags.
_INVENTORY_PASSTHROUGH_TAGS = {
    "medication_visible",
    "documents_destroyed",
    "pet_items_present",
    "appliances_lost",
    "smoke_damage",
    "water_damage",
}


def derive_tags(
    intake_answers: dict,
    inventory_summary: Optional[InventorySummary] = None,
    document_findings: Optional[DocumentFindings] = None,
    today: Optional[date] = None,
) -> set[str]:
    """
    Turn the intake answer dict (+ optional image / document signals)
    into a set of semantic tags. Pass `today` for deterministic tests.
    """
    tags: set[str] = set()

    # -- Intake-derived tags (unchanged from original behaviour) ---------
    housing = intake_answers.get("housing")
    if housing in (0, 1):
        tags.add("owner")
    if housing in (2, 3):
        tags.add("renter")
    if housing in (1, 3):
        tags.add("displaced")
    if housing == 4:
        tags.add("on_reserve_or_metis")
    if housing == 5:
        tags.add("needs_shelter")
        tags.add("displaced")

    ins = intake_answers.get("insurance")
    if ins == 0:
        tags.add("insured")
    if ins == 1:
        tags.add("uninsured")
    if ins == 2:
        tags.add("insurance_unknown")

    income = intake_answers.get("income_affected")
    if income in (1, 2):
        tags.add("income_disrupted")
    if income == 3:
        tags.add("on_assistance")

    applied = intake_answers.get("already_applied")
    if applied in (1, 3):
        tags.add("insurance_claim_filed")
    if applied in (2, 3):
        tags.add("aid_applied")
    if applied == 0:
        tags.add("not_yet_started")

    if intake_answers.get("has_kids"):
        tags.add("has_kids")
    if intake_answers.get("has_seniors"):
        tags.add("has_seniors")
    if intake_answers.get("has_disability"):
        tags.add("has_disability")
    if intake_answers.get("has_pets"):
        tags.add("has_pets")
    if intake_answers.get("has_id") == 0:
        tags.add("missing_id")

    # -- Image pipeline tags --------------------------------------------
    if inventory_summary is not None:
        sev = inventory_summary.damage_severity
        if sev == DamageSeverity.TOTAL_LOSS:
            tags.add("total_loss")
            tags.add("structural_damage")
        elif sev == DamageSeverity.STRUCTURAL:
            tags.add("structural_damage")
        elif sev == DamageSeverity.COSMETIC:
            tags.add("cosmetic_only")
        # MODERATE deliberately leaves no specific tag — neither cosmetic
        # nor structural, so resources gated on either don't misfire.

        for t in inventory_summary.detected_tags:
            # Pass through known vocabulary; ignore unknowns (they're
            # harmless but mostly come from future pipeline additions
            # we haven't taught the resources to filter on yet).
            if t in _INVENTORY_PASSTHROUGH_TAGS:
                tags.add(t)

    # -- Document pipeline tags -----------------------------------------
    if document_findings is not None:
        if document_findings.denial_flag:
            tags.add("denial_received")
        if document_findings.ale_exhausted:
            tags.add("ale_exhausted")

        soonest = _soonest_deadline(document_findings.deadlines)
        if soonest is not None:
            ref = today or date.today()
            days_left = (soonest - ref).days
            if days_left <= 7:
                tags.add("deadline_within_7d")
            elif days_left <= 30:
                tags.add("deadline_within_30d")

    return tags


def _soonest_deadline(deadlines: list[DocumentDeadline]) -> Optional[date]:
    if not deadlines:
        return None
    return min(d.due_date for d in deadlines)


# ---------------------------------------------------------------------------
# Recommender
# ---------------------------------------------------------------------------

class Recommender:
    """
    Stateless after construction — safe to share across requests.
    Pass scraped or DB-loaded resources in via the constructor:
        Recommender(resources=load_resources_from_db(...))
    The embedder is optional; pass `embedder=None` to skip semantic sim.
    """

    def __init__(
        self,
        resources: Optional[list[dict]] = None,
        embedder: Optional[ResourceEmbedder] = None,
        embedder_cache_path: Optional[str] = "resource_embeddings.npy",
        load_embedder: bool = True,
    ):
        self.resources = resources if resources is not None else RESOURCES
        if embedder is not None:
            self.embedder = embedder
        elif load_embedder:
            self.embedder = ResourceEmbedder(
                self.resources, cache_path=embedder_cache_path,
            )
        else:
            self.embedder = None
        self._idx = {r["id"]: i for i, r in enumerate(self.resources)}

    # ---- public ----------------------------------------------------------

    def recommend(
        self,
        plan_distribution: np.ndarray,
        user_context: dict,
        top_k_per_category: int = TOP_K_PER_CATEGORY,
        completed_resource_ids: Optional[set[str]] = None,
        dismissed_resource_ids: Optional[set[str]] = None,
        inventory_summary: Optional[InventorySummary] = None,
        document_findings: Optional[DocumentFindings] = None,
        debug: bool = False,
        today: Optional[date] = None,
    ) -> dict:
        """
        Return suggestions plus surrounding context.

        Response shape:
          {
            "by_category": { type: [Recommendation, ...] },
            "top_pick":    Recommendation | None,
            "deadline_radar": [Recommendation, ...],   # sorted by soonest
            "personalize_more": [
              {question_id, estimated_unlock_cad, would_unlock, copy}
            ],
            "debug": {"filtered_out": {resource_id: reason}}   # debug=True only
          }
        """
        intake = dict(user_context.get("intake_answers") or {})

        # If the document analyser pulled an insurer and the user hasn't
        # typed one in the intake, use that. Cheap normalization only —
        # see normalize_insurer() for the explicit non-goal of an alias
        # table.
        if document_findings and document_findings.extracted_insurer:
            existing = (user_context.get("insurance_company") or "").strip()
            if not existing:
                user_context = dict(user_context)
                user_context["insurance_company"] = normalize_insurer(
                    document_findings.extracted_insurer
                )

        tags = derive_tags(intake, inventory_summary, document_findings, today=today)
        days_since = _days_since(user_context.get("disaster_date"), today=today)
        done = completed_resource_ids or set()
        dismissed = dismissed_resource_ids or set()

        sims = None
        if self.embedder is not None and not self.embedder.disabled:
            sims = self.embedder.similarities(
                user_situation_text(intake, user_context)
            )

        candidates, filtered_out = self._filter(
            user_context, tags, days_since, dismissed,
        )

        soonest_doc_deadline = (
            _soonest_deadline(document_findings.deadlines)
            if document_findings else None
        )

        scored = [
            self._score(
                r, plan_distribution, user_context, tags,
                days_since, sims, done,
                inventory_summary=inventory_summary,
                document_findings=document_findings,
                soonest_doc_deadline=soonest_doc_deadline,
                today=today,
            )
            for r in candidates
        ]

        # by_category
        by_category: dict[str, list[Recommendation]] = {}
        for rec in scored:
            by_category.setdefault(rec.resource["type"], []).append(rec)
        for cat in by_category:
            by_category[cat].sort(key=lambda r: r.score, reverse=True)
            by_category[cat] = by_category[cat][:top_k_per_category]

        # top_pick — single best across all categories (after diversification)
        flat = [rec for recs in by_category.values() for rec in recs]
        top_pick = max(flat, key=lambda r: r.score) if flat else None

        # deadline_radar — anything with a known deadline, soonest first
        radar = [r for r in scored if r.days_until_deadline is not None]
        radar.sort(key=lambda r: r.days_until_deadline)  # ascending
        radar = radar[:DEADLINE_RADAR_LIMIT]

        # personalize_more — what would more intake answers unlock?
        personalize_more = self._personalize_more(
            user_context=user_context,
            intake=intake,
            tags=tags,
            days_since=days_since,
            dismissed=dismissed,
            current_passing_ids={r["id"] for r in candidates},
            inventory_summary=inventory_summary,
            document_findings=document_findings,
            today=today,
        )

        result: dict = {
            "by_category": by_category,
            "top_pick": top_pick,
            "deadline_radar": radar,
            "personalize_more": personalize_more,
        }
        if debug:
            result["debug"] = {"filtered_out": filtered_out}
        return result

    # ---- filter (hard eligibility) --------------------------------------

    def _filter(
        self,
        user_context: dict,
        tags: set[str],
        days_since: Optional[int],
        dismissed: set[str],
    ) -> tuple[list[dict], dict[str, str]]:
        """Return (passing, filtered_out_with_reasons)."""
        region = user_context.get("region")
        disaster = user_context.get("disaster_type")
        passing = []
        rejected: dict[str, str] = {}
        for r in self.resources:
            if r["id"] in dismissed:
                rejected[r["id"]] = "dismissed by user"
                continue
            if not _region_ok(r, region):
                rejected[r["id"]] = f"wrong region (needs {r.get('region')})"
                continue
            if not _disaster_ok(r, disaster):
                rejected[r["id"]] = f"wrong disaster type (needs {r.get('disaster_types')})"
                continue
            ok, why = _audience_ok_with_reason(r, tags)
            if not ok:
                rejected[r["id"]] = why
                continue
            if not _window_ok(r, days_since):
                rejected[r["id"]] = (
                    f"deadline passed ({days_since}d since disaster, "
                    f"window {r.get('eligibility_days')}d)"
                )
                continue
            passing.append(r)
        return passing, rejected

    # ---- score ----------------------------------------------------------

    def _score(
        self,
        r: dict,
        plan_distribution: np.ndarray,
        user_context: dict,
        tags: set[str],
        days_since: Optional[int],
        sims: Optional[np.ndarray],
        done: set[str],
        inventory_summary: Optional[InventorySummary],
        document_findings: Optional[DocumentFindings],
        soonest_doc_deadline: Optional[date],
        today: Optional[date],
    ) -> Recommendation:
        reasons: list[str] = []

        plan_score = _plan_alignment(r, plan_distribution)
        if plan_score >= 0.15:
            top_pid = max(r["supports_plans"],
                          key=lambda p: float(plan_distribution[p]))
            reasons.append(f"matches \"{plan_by_id(top_pid)['name']}\"")

        feature_score = _feature_match(r, tags, reasons)

        semantic_score = 0.0
        if sims is not None:
            i = self._idx.get(r["id"])
            if i is not None:
                semantic_score = float(max(sims[i], 0.0))

        fresh_score = _freshness(r.get("scraped_at"), today=today)
        if fresh_score >= 0.8 and r.get("scraped_at"):
            reasons.append("recently updated")

        insurer_score = 0.0
        ic = user_context.get("insurance_company")
        if ic and r.get("insurance_companies"):
            normalized_user = normalize_insurer(ic) or ic.lower()
            insurers = [normalize_insurer(s) or s.lower()
                        for s in r["insurance_companies"]]
            if normalized_user in insurers:
                insurer_score = 1.0
                reasons.append(f"specific to {ic}")

        urgency_score = 0.0
        if days_since is not None and days_since <= URGENT_DISASTER_DAYS:
            if r["type"] in {"shelter", "health"}:
                urgency_score = 1.0
                reasons.append("immediate need given how recent this is")

        # Deadline pressure — closer to deadline = higher score.
        deadline_score, days_until = _deadline_pressure(
            r, days_since, soonest_doc_deadline, document_findings,
            tags, reasons, today=today,
        )

        # Photo-derived reason copy
        if inventory_summary is not None:
            _add_inventory_reasons(r, inventory_summary, tags, reasons)

        done_penalty = 1.0 if r["id"] in done else 0.0

        total = (
            ALPHA_PLAN * plan_score
            + BETA_FEATURE * feature_score
            + GAMMA_SEMANTIC * semantic_score
            + DELTA_FRESH * fresh_score
            + ZETA_INSURER * insurer_score
            + ETA_URGENCY * urgency_score
            + THETA_DEADLINE * deadline_score
            - EPSILON_DONE * done_penalty
        )

        floor = float(r.get("priority_floor") or 0.0)
        final = max(total, floor)
        if floor > 0 and final == floor and floor > total:
            # Floor actually changed the ranking — say so, but keep tone
            # in the "maybe you can do" register.
            if "denial_received" in tags and r["id"] == "gio-ombud":
                reasons.append("your insurance documents look like a denial — this is who to call next")
            else:
                reasons.append("flagged as a high-priority next step")

        if not reasons:
            reasons.append("generally applicable in your situation")

        return Recommendation(
            resource=r,
            score=final,
            reasons=reasons,
            days_until_deadline=days_until,
        )

    # ---- personalize_more ----------------------------------------------

    def _personalize_more(
        self,
        user_context: dict,
        intake: dict,
        tags: set[str],
        days_since: Optional[int],
        dismissed: set[str],
        current_passing_ids: set[str],
        inventory_summary: Optional[InventorySummary],
        document_findings: Optional[DocumentFindings],
        today: Optional[date],
    ) -> list[dict]:
        """
        For each unanswered intake question, simulate each possible
        answer, see which currently-filtered resources would pass, sum
        their `max_benefit_cad`, take the best option.

        Only returns entries with unlock_cad > 0 or a meaningful change
        in passing count (>= 1 new resource).
        """
        suggestions: list[dict] = []
        for q in QUESTIONS:
            if _question_already_answered(q, intake):
                continue

            best_unlock = 0
            best_ids: list[str] = []
            for option in q["options"]:
                sim_intake = _apply_simulated_answer(intake, q, option["value"])
                sim_tags = derive_tags(
                    sim_intake, inventory_summary, document_findings, today=today,
                )
                sim_passing, _ = self._filter(
                    user_context, sim_tags, days_since, dismissed,
                )
                sim_ids = {r["id"] for r in sim_passing}
                newly_unlocked = sim_ids - current_passing_ids
                if not newly_unlocked:
                    continue
                unlock = sum(
                    int(r.get("max_benefit_cad") or 0)
                    for r in sim_passing
                    if r["id"] in newly_unlocked
                )
                if unlock > best_unlock or (
                    unlock == best_unlock and len(newly_unlocked) > len(best_ids)
                ):
                    best_unlock = unlock
                    best_ids = sorted(newly_unlocked)

            if best_unlock > 0:
                suggestions.append({
                    "question_id": q["id"],
                    "estimated_unlock_cad": best_unlock,
                    "would_unlock": best_ids,
                    "copy": (
                        f"Answer 1 more question to unlock up to "
                        f"${best_unlock:,} in rebuild support"
                    ),
                })
            elif best_ids:
                # Non-monetary unlock (shelters, helplines) — still useful.
                suggestions.append({
                    "question_id": q["id"],
                    "estimated_unlock_cad": 0,
                    "would_unlock": best_ids,
                    "copy": (
                        f"Answer 1 more question to see "
                        f"{len(best_ids)} more option"
                        f"{'s' if len(best_ids) != 1 else ''}"
                    ),
                })

        suggestions.sort(key=lambda s: s["estimated_unlock_cad"], reverse=True)
        return suggestions


# ---------------------------------------------------------------------------
# Filter helpers
# ---------------------------------------------------------------------------

def _region_ok(r: dict, region: Optional[str]) -> bool:
    rgn = r.get("region", "*")
    if rgn == "*" or region is None:
        return True
    if isinstance(rgn, list):
        return region in rgn or "*" in rgn
    return rgn == region


def _disaster_ok(r: dict, disaster: Optional[str]) -> bool:
    types = r.get("disaster_types") or ["*"]
    if "*" in types or disaster is None:
        return True
    return disaster in types


def _audience_ok_with_reason(r: dict, tags: set[str]) -> tuple[bool, str]:
    requires = set(r.get("requires") or [])
    excludes = set(r.get("excludes") or [])
    if requires and not requires.issubset(tags):
        missing = sorted(requires - tags)
        return False, f"requires tags you don't have: {missing}"
    if excludes and excludes & tags:
        blocking = sorted(excludes & tags)
        return False, f"excluded by tags: {blocking}"
    return True, ""


def _window_ok(r: dict, days_since: Optional[int]) -> bool:
    window = r.get("eligibility_days")
    if window is None or days_since is None:
        return True
    return days_since <= window


# ---------------------------------------------------------------------------
# Score helpers
# ---------------------------------------------------------------------------

def _plan_alignment(r: dict, plan_distribution: np.ndarray) -> float:
    plans = r.get("supports_plans") or []
    if not plans:
        return 0.0
    return float(sum(plan_distribution[p] for p in plans))


def _feature_match(r: dict, tags: set[str], reasons: list[str]) -> float:
    requires = set(r.get("requires") or [])
    if not requires:
        return 0.0
    overlap = requires & tags
    if not overlap:
        return 0.0
    sample = next(iter(overlap))
    reasons.append(f"you mentioned: {sample.replace('_', ' ')}")
    return len(overlap) / max(len(requires), 1)


def _freshness(scraped_at: Optional[str], today: Optional[date] = None) -> float:
    if not scraped_at:
        return 0.5
    try:
        d = date.fromisoformat(scraped_at[:10])
    except ValueError:
        return 0.5
    ref = today or date.today()
    age = max((ref - d).days, 0)
    return float(0.5 ** (age / FRESH_HALFLIFE_DAYS))


def _days_since(disaster_date, today: Optional[date] = None) -> Optional[int]:
    if disaster_date is None:
        return None
    if isinstance(disaster_date, datetime):
        d = disaster_date.date()
    elif isinstance(disaster_date, date):
        d = disaster_date
    else:
        try:
            d = date.fromisoformat(str(disaster_date)[:10])
        except ValueError:
            return None
    ref = today or date.today()
    return max((ref - d).days, 0)


def _deadline_pressure(
    r: dict,
    days_since: Optional[int],
    soonest_doc_deadline: Optional[date],
    document_findings: Optional[DocumentFindings],
    tags: set[str],
    reasons: list[str],
    today: Optional[date],
) -> tuple[float, Optional[int]]:
    """
    Two deadline sources:
      1. The resource's own `eligibility_days` window vs days_since disaster.
      2. The soonest extracted deadline from uploaded documents.
    Closer deadlines score higher. Returns (score, days_until_deadline).
    """
    ref = today or date.today()
    candidates: list[tuple[int, str, str]] = []  # (days_left, label, kind)

    window = r.get("eligibility_days")
    if window is not None and days_since is not None:
        days_left = window - days_since
        if days_left >= 0:
            candidates.append((
                days_left,
                f"application window closes in {days_left} day{'s' if days_left != 1 else ''}",
                "eligibility",
            ))

    if document_findings and document_findings.deadlines:
        soonest = soonest_doc_deadline
        if soonest is not None:
            days_left = (soonest - ref).days
            if days_left >= 0:
                # Find the matching deadline record for the label
                match = min(document_findings.deadlines, key=lambda d: d.due_date)
                candidates.append((
                    days_left,
                    f"your {match.source_doc} mentions a deadline — {days_left} day{'s' if days_left != 1 else ''} left",
                    "document",
                ))

    if not candidates:
        return 0.0, None

    days_left, label, _ = min(candidates, key=lambda c: c[0])

    # Score: 1.0 at 0 days, decays to ~0 by 60 days out.
    score = max(0.0, 1.0 - days_left / 60.0)

    # Only attach the reason copy if the deadline is genuinely close — we
    # don't want every resource shouting about an 80-day window.
    if days_left <= 30:
        reasons.append(label)

    return score, days_left


def _add_inventory_reasons(
    r: dict,
    inv: InventorySummary,
    tags: set[str],
    reasons: list[str],
) -> None:
    """
    Citing the image pipeline when the resource matches a damage signal.
    Static templates only — no LLM in the request path.
    """
    if "structural_damage" in tags and r["id"] in {"ab-drp", "habitat-ab", "samaritans-purse"}:
        reasons.append("your damage photos suggest structural loss — this program covers that")
    elif "total_loss" in tags and r["id"] in {"ab-drp", "habitat-ab"}:
        reasons.append("photos suggest a total loss — major rebuild programs apply")
    if "medication_visible" in tags and r["type"] == "health":
        reasons.append("photos showed medication left behind — Health Link can help with refills")
    if "documents_destroyed" in tags and r["type"] == "documents":
        reasons.append("photos suggest documents were lost — replacement is fee-waived after a declared disaster")
    if "pet_items_present" in tags and r["id"] in {"red-cross-lodging", "211-alberta"}:
        reasons.append("photos showed pet items — they can help locate pet-friendly lodging")


# ---------------------------------------------------------------------------
# personalize_more helpers
# ---------------------------------------------------------------------------

def _question_already_answered(q: dict, intake: dict) -> bool:
    feats = q["feature"]
    if isinstance(feats, str):
        return intake.get(feats) is not None
    # Multi-select — treat answered if ANY of the binary features is set.
    # (Submitting an empty multi-select still counts as answered, but
    # since we can't distinguish "skipped" from "selected nothing" here,
    # we conservatively only suggest filling in multi-selects when ALL
    # features are missing.)
    return all(intake.get(f) is not None for f in feats)


def _apply_simulated_answer(intake: dict, q: dict, value) -> dict:
    sim = dict(intake)
    if q["type"] == "single":
        sim[q["feature"]] = value
    else:
        # multi-select: option value is the feature name; flip just that
        # one on, leave the rest at 0 so we get an isolated effect.
        for f in q["feature"]:
            sim.setdefault(f, 0)
        sim[value] = 1
    return sim
