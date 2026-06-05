"""
Resource recommender.

Layers on top of the intake engine. Takes the plan probability
distribution the engine produces, plus whatever context the backend
has (region, disaster type, insurance company, disaster date), and
returns a categorised list of "maybe you can do" suggestions.

Design
------
Two-stage pipeline. Eligibility is non-negotiable so it's a hard
filter; relevance is soft so it's a weighted score.

  candidate generation  →  hard filter  →  score  →  diversify

Score components (linear, hand-tuned; swap for a learned ranker once
real click/feedback data exists):

  score(r) = α · plan_alignment(r, plan_distribution)
           + β · feature_match(r, user_tags)
           + γ · semantic_sim(r.body, user_situation_text)
           + δ · freshness(r.scraped_at)
           + ζ · insurer_match(r, user_context.insurance_company)
           + η · urgency_boost(r, days_since_disaster)
           − ε · already_done(r, completed_resource_ids)

`reasons` is a small list of human-readable strings attached to each
recommendation so the UI can render "Suggested because: …" copy. That
transparency is the point of the "maybe you can do" framing.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional

import numpy as np

from embeddings import ResourceEmbedder, user_situation_text
from plans import plan_by_id
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
EPSILON_DONE = 1.0  # penalty for resources the user already marked done

TOP_K_PER_CATEGORY = 3
URGENT_DISASTER_DAYS = 7
FRESH_HALFLIFE_DAYS = 30


@dataclass
class Recommendation:
    resource: dict
    score: float
    reasons: list[str] = field(default_factory=list)

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
        }


# ---------------------------------------------------------------------------
# Tag derivation — the one place numeric intake features get translated
# into semantic tags. The vocabulary here is what `resources.requires` /
# `resources.excludes` reference.
# ---------------------------------------------------------------------------

def derive_tags(intake_answers: dict) -> set[str]:
    """Turn the intake answer dict into a set of semantic tags."""
    tags: set[str] = set()

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

    return tags


# ---------------------------------------------------------------------------
# Recommender
# ---------------------------------------------------------------------------

class Recommender:
    """
    Stateless after construction — safe to share across requests.
    Pass scraped resources in via the constructor:
        Recommender(resources=RESOURCES + load_scraped_resources(...))
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
        # Map resource id → index in self.resources, for embedding lookup.
        self._idx = {r["id"]: i for i, r in enumerate(self.resources)}

    # ---- public ----------------------------------------------------------

    def recommend(
        self,
        plan_distribution: np.ndarray,
        user_context: dict,
        top_k_per_category: int = TOP_K_PER_CATEGORY,
        completed_resource_ids: Optional[set[str]] = None,
    ) -> dict[str, list[Recommendation]]:
        """
        Return suggestions grouped by category type.

        user_context keys (all optional, all soft):
          region            "AB", "BC", ... — filters resources by province
          disaster_type     "wildfire", "flood", "tornado", ...
          disaster_date     ISO date string ("2026-06-01") or date object
          insurance_company str
          intake_answers    the answer dict from IntakeEngine
        """
        intake = user_context.get("intake_answers", {})
        tags = derive_tags(intake)
        days_since = _days_since(user_context.get("disaster_date"))
        done = completed_resource_ids or set()

        # Pre-compute semantic similarities once per call.
        sims = None
        if self.embedder is not None and not self.embedder.disabled:
            sims = self.embedder.similarities(
                user_situation_text(intake, user_context)
            )

        candidates = self._filter(user_context, tags, days_since)
        scored = [
            self._score(r, plan_distribution, user_context, tags,
                        days_since, sims, done)
            for r in candidates
        ]

        by_category: dict[str, list[Recommendation]] = {}
        for rec in scored:
            by_category.setdefault(rec.resource["type"], []).append(rec)
        for cat in by_category:
            by_category[cat].sort(key=lambda r: r.score, reverse=True)
            by_category[cat] = by_category[cat][:top_k_per_category]

        return by_category

    # ---- filter (hard eligibility) --------------------------------------

    def _filter(
        self,
        user_context: dict,
        tags: set[str],
        days_since: Optional[int],
    ) -> list[dict]:
        region = user_context.get("region")
        disaster = user_context.get("disaster_type")
        out = []
        for r in self.resources:
            if not _region_ok(r, region):
                continue
            if not _disaster_ok(r, disaster):
                continue
            if not _audience_ok(r, tags):
                continue
            if not _window_ok(r, days_since):
                continue
            out.append(r)
        return out

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

        fresh_score = _freshness(r.get("scraped_at"))
        if fresh_score >= 0.8 and r.get("scraped_at"):
            reasons.append("recently updated")

        insurer_score = 0.0
        ic = user_context.get("insurance_company")
        if ic and r.get("insurance_companies"):
            if ic.lower() in [s.lower() for s in r["insurance_companies"]]:
                insurer_score = 1.0
                reasons.append(f"specific to {ic}")

        urgency_score = 0.0
        if days_since is not None and days_since <= URGENT_DISASTER_DAYS:
            if r["type"] in {"shelter", "health"}:
                urgency_score = 1.0
                reasons.append("immediate need given how recent this is")

        done_penalty = 1.0 if r["id"] in done else 0.0

        total = (
            ALPHA_PLAN * plan_score
            + BETA_FEATURE * feature_score
            + GAMMA_SEMANTIC * semantic_score
            + DELTA_FRESH * fresh_score
            + ZETA_INSURER * insurer_score
            + ETA_URGENCY * urgency_score
            - EPSILON_DONE * done_penalty
        )

        if not reasons:
            reasons.append("generally applicable in your situation")

        return Recommendation(resource=r, score=total, reasons=reasons)


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


def _audience_ok(r: dict, tags: set[str]) -> bool:
    requires = set(r.get("requires") or [])
    excludes = set(r.get("excludes") or [])
    if requires and not requires.issubset(tags):
        return False
    if excludes and excludes & tags:
        return False
    return True


def _window_ok(r: dict, days_since: Optional[int]) -> bool:
    """If the resource has an eligibility window, the disaster must be within it."""
    window = r.get("eligibility_days")
    if window is None or days_since is None:
        return True
    return days_since <= window


# ---------------------------------------------------------------------------
# Score helpers
# ---------------------------------------------------------------------------

def _plan_alignment(r: dict, plan_distribution: np.ndarray) -> float:
    """Dot-product the resource's supported plans with the predicted distribution."""
    plans = r.get("supports_plans") or []
    if not plans:
        return 0.0
    return float(sum(plan_distribution[p] for p in plans))


def _feature_match(r: dict, tags: set[str], reasons: list[str]) -> float:
    """
    Soft score for tag overlap beyond the hard requires/excludes already
    enforced by the filter. Rewards resources whose `requires` overlap
    the user's tags more deeply, so universally-applicable resources
    don't crowd out targeted ones.
    """
    requires = set(r.get("requires") or [])
    if not requires:
        return 0.0
    overlap = requires & tags
    if not overlap:
        return 0.0
    # Cap reason copy to one tag to keep the UI tidy.
    sample = next(iter(overlap))
    reasons.append(f"you mentioned: {sample.replace('_', ' ')}")
    return len(overlap) / max(len(requires), 1)


def _freshness(scraped_at: Optional[str]) -> float:
    """Exponential decay: 1.0 today, ~0.5 at FRESH_HALFLIFE_DAYS old."""
    if not scraped_at:
        # Hand-curated entries get a flat baseline so they don't lose to
        # scraped entries just because they have no timestamp.
        return 0.5
    try:
        d = date.fromisoformat(scraped_at[:10])
    except ValueError:
        return 0.5
    age = max((date.today() - d).days, 0)
    return float(0.5 ** (age / FRESH_HALFLIFE_DAYS))


def _days_since(disaster_date) -> Optional[int]:
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
    return max((date.today() - d).days, 0)
