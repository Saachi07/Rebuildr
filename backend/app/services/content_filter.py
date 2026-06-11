"""Content-based filtering recommender.

This is the primary recommendation engine. It is pure content-based: every
recommendation is justified by feature overlap between the user's case (a
"profile vector") and a resource's metadata (an "item vector"). No
collaborative signal (clicks, ratings, neighbour-similarity) is used.

Pipeline
--------
1. **Build the case query.** Concatenate the case's disaster type, region,
   derived tags, plus the categories / damage descriptors of every item the
   user has logged. This is the textual representation of the user's
   situation.
2. **Eligibility filter (hard).** Drop resources whose ``region``,
   ``disaster_types``, ``requires`` / ``excludes`` tags, or
   ``eligibility_days`` window make them clearly inapplicable. These are
   cheap rules — skipping them would mean recommending an Indigenous
   on-reserve program to a renter in BC and losing the user's trust.
3. **TF-IDF cosine similarity (soft).** Vectorize the survivors'
   ``search_text`` with TF-IDF, vectorize the query the same way, and score
   each survivor by cosine similarity. This is the content-based core.
4. **Small structured boosts.** Insurer match and tag-overlap depth are
   added on top of the cosine score as interpretable bonuses — the kind of
   thing a TF-IDF model misses because it can't see that "insurer = TD"
   exactly matches an insurance-companies array.
5. **Per-category top-K.** Group by resource ``type`` so the UI gets a
   diverse output (a row of shelters, a row of financial programs, etc.)
   instead of all shelters because the case is recent.

The output is a list of ``Recommendation`` dataclasses, each carrying a
score and a list of human-readable reasons for the "Suggested because: …"
UI copy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Iterable, Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .signals import DocumentSignals, InventorySignals


# Weights are interpretable and hand-tuned. Replace with a learned ranker
# once feedback data (saved / dismissed / acted-on) is in place.
W_CONTENT = 1.0
W_TAG_OVERLAP = 0.4
W_INSURER = 0.8
W_FRESHNESS = 0.1
W_URGENCY = 0.5
W_DEADLINE = 0.7
PENALTY_DONE = 1.0

# Resource types where an extracted document deadline (claim window, DRP
# application date) is actually actionable — shelters don't care.
_DEADLINE_TYPES = {"insurance", "financial", "policy", "legal", "documents"}

TOP_K_PER_CATEGORY = 5
URGENT_DAYS = 7
FRESH_HALFLIFE_DAYS = 30


@dataclass
class Recommendation:
    resource: dict
    score: float
    reasons: list[str] = field(default_factory=list)
    rank: int = 0
    days_until_deadline: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "id": self.resource["id"],
            "type": self.resource["type"],
            "title": self.resource["title"],
            "body": self.resource["body"],
            "url": self.resource.get("url"),
            "phone": self.resource.get("phone"),
            "score": round(self.score, 4),
            "reasons": self.reasons,
            "rank": self.rank,
            "days_until_deadline": self.days_until_deadline,
        }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def recommend(
    case: dict,
    items: Iterable[dict],
    resources: list[dict],
    top_k_per_category: int = TOP_K_PER_CATEGORY,
    completed_ids: Optional[set[str]] = None,
    inventory: Optional[InventorySignals] = None,
    documents: Optional[DocumentSignals] = None,
) -> dict[str, list[Recommendation]]:
    """Return content-based recommendations grouped by resource ``type``.

    Parameters
    ----------
    case
        Row from ``recovery_cases``. Reads ``disaster_type``, ``region``,
        ``incident_date``, ``insurance_provider``, ``intake_answers``,
        ``derived_tags``.
    items
        Rows from ``case_items``. Their categories, materials, and damage
        descriptors are folded into the case's content query.
    resources
        Rows from ``resources`` (the shared catalog).
    top_k_per_category
        Max suggestions to keep per resource ``type``.
    completed_ids
        Resource ids the user has already marked done — they get scored down.
    inventory
        Signals derived from the image-classification pipeline
        (``signals.inventory_signals_from_items``). Its tags join the
        eligibility filter and the query vector.
    documents
        Signals derived from the Gemini document analyses
        (``signals.document_signals_from_documents``). Supplies an insurer
        fallback, denial/deadline tags, and deadline pressure scoring.
    """
    completed_ids = completed_ids or set()
    items = list(items)

    region = case.get("region")
    disaster = case.get("disaster_type")
    tags = set(case.get("derived_tags") or [])
    if inventory is not None:
        tags |= inventory.tags
    if documents is not None:
        tags |= documents.tags
    # The case's own insurer wins; the one Gemini lifted from an uploaded
    # policy/claim PDF fills the gap when the user never typed it in.
    insurer = case.get("insurance_provider") or (
        documents.extracted_insurer if documents else None
    )
    days_since = _days_since(case.get("incident_date"))
    soonest_doc_deadline = (
        min(documents.deadlines, key=lambda d: d.due_date)
        if documents and documents.deadlines else None
    )

    # 1. eligibility filter
    candidates = [
        r for r in resources
        if _region_ok(r, region)
        and _disaster_ok(r, disaster)
        and _audience_ok(r, tags)
        and _window_ok(r, days_since)
    ]
    if not candidates:
        return {}

    # 2. content (TF-IDF cosine)
    query = _build_query(case, items, tags)
    docs = [_build_document(r) for r in candidates]
    sims = _cosine(query, docs)

    # 3. score + reasons
    recs: list[Recommendation] = []
    for r, content_score in zip(candidates, sims):
        reasons: list[str] = []
        score = W_CONTENT * float(content_score)
        if content_score >= 0.15:
            reasons.append("matches your situation")

        # tag overlap depth
        overlap = set(r.get("requires") or []) & tags
        if overlap:
            sample = next(iter(overlap)).replace("_", " ")
            reasons.append(f"you mentioned: {sample}")
            score += W_TAG_OVERLAP * (len(overlap) / max(len(r.get("requires") or []), 1))

        # insurer-specific match
        if insurer and r.get("insurance_companies"):
            if insurer.lower() in [s.lower() for s in r["insurance_companies"]]:
                score += W_INSURER
                reasons.append(f"specific to {insurer}")

        # freshness for scraped entries
        fresh = _freshness(r.get("scraped_at"))
        score += W_FRESHNESS * fresh
        if fresh >= 0.8 and r.get("scraped_at"):
            reasons.append("recently updated")

        # urgency for immediate-need categories
        if days_since is not None and days_since <= URGENT_DAYS and r["type"] in {"shelter", "health"}:
            score += W_URGENCY
            reasons.append("immediate need given how recent this is")

        # deadline pressure — own eligibility window or a deadline Gemini
        # pulled out of an uploaded document. Closer = higher.
        deadline_score, days_until = _deadline_pressure(
            r, days_since, soonest_doc_deadline, reasons,
        )
        score += W_DEADLINE * deadline_score

        # photo-derived reason copy — cite the image pipeline when the
        # resource matches a damage signal. Static templates, no LLM here.
        if inventory is not None:
            _add_inventory_reasons(r, tags, reasons)
        if documents is not None and documents.denial_flag and r["id"] == "gio-ombud":
            reasons.append("your insurance documents look like a denial — this is who to call next")

        if r["id"] in completed_ids:
            score -= PENALTY_DONE

        if not reasons:
            reasons.append("generally applicable in your situation")

        recs.append(Recommendation(
            resource=r, score=score, reasons=reasons,
            days_until_deadline=days_until,
        ))

    # 4. group by type, sort, take top-K, set rank
    by_type: dict[str, list[Recommendation]] = {}
    for rec in recs:
        by_type.setdefault(rec.resource["type"], []).append(rec)
    for t in by_type:
        by_type[t].sort(key=lambda x: x.score, reverse=True)
        by_type[t] = by_type[t][:top_k_per_category]
        for i, rec in enumerate(by_type[t]):
            rec.rank = i
    return by_type


# ---------------------------------------------------------------------------
# Query / document construction
# ---------------------------------------------------------------------------

def _build_query(case: dict, items: list[dict], tags: set[str]) -> str:
    parts: list[str] = []
    if case.get("disaster_type"):
        parts.append(case["disaster_type"])
    if case.get("region"):
        parts.append(case["region"])
    parts.extend(sorted(tags))
    for it in items:
        for k in ("category", "material", "damage_type", "damage_severity"):
            v = it.get(k)
            if v:
                parts.append(str(v))
        if it.get("description"):
            parts.append(str(it["description"]))
    return " ".join(parts) if parts else "disaster recovery"


def _build_document(r: dict) -> str:
    # Prefer the DB-generated search_text when present (server materialises it).
    text = r.get("search_text")
    if text:
        return text
    return " ".join([
        r.get("title", ""),
        r.get("body", ""),
        r.get("type", ""),
        " ".join(r.get("disaster_types") or []),
        " ".join(r.get("requires") or []),
    ])


def _cosine(query: str, docs: list[str]) -> np.ndarray:
    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=1)
    matrix = vec.fit_transform(docs + [query])
    return cosine_similarity(matrix[-1], matrix[:-1]).flatten()


# ---------------------------------------------------------------------------
# Eligibility helpers
# ---------------------------------------------------------------------------

def _region_ok(r: dict, region: Optional[str]) -> bool:
    rgn = r.get("region", "*")
    if rgn == "*" or not region:
        return True
    return rgn == region


def _disaster_ok(r: dict, disaster: Optional[str]) -> bool:
    types = r.get("disaster_types") or ["*"]
    if "*" in types or not disaster:
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
    window = r.get("eligibility_days")
    if window is None or days_since is None:
        return True
    return days_since <= window


# ---------------------------------------------------------------------------
# Signal-derived scoring helpers
# ---------------------------------------------------------------------------

def _deadline_pressure(
    r: dict,
    days_since: Optional[int],
    soonest_doc_deadline,
    reasons: list[str],
) -> tuple[float, Optional[int]]:
    """Two deadline sources: the resource's own ``eligibility_days`` window,
    and the soonest deadline extracted from uploaded documents (only for
    resource types where a claim/application date is actionable).
    Returns (score in [0, 1], days_until_deadline)."""
    candidates: list[tuple[int, str]] = []  # (days_left, reason copy)

    window = r.get("eligibility_days")
    if window is not None and days_since is not None:
        days_left = int(window) - days_since
        if days_left >= 0:
            candidates.append((
                days_left,
                f"application window closes in {days_left} day{'s' if days_left != 1 else ''}",
            ))

    if soonest_doc_deadline is not None and r["type"] in _DEADLINE_TYPES:
        days_left = (soonest_doc_deadline.due_date - date.today()).days
        if days_left >= 0:
            candidates.append((
                days_left,
                f"your {soonest_doc_deadline.source_doc} mentions a deadline — "
                f"{days_left} day{'s' if days_left != 1 else ''} left",
            ))

    if not candidates:
        return 0.0, None

    days_left, label = min(candidates, key=lambda c: c[0])
    # 1.0 at 0 days, decaying to 0 by 60 days out.
    score = max(0.0, 1.0 - days_left / 60.0)
    # Only shout about genuinely close deadlines.
    if days_left <= 30:
        reasons.append(label)
    return score, days_left


def _add_inventory_reasons(r: dict, tags: set[str], reasons: list[str]) -> None:
    if "structural_damage" in tags and r["id"] in {"ab-drp", "habitat-ab", "samaritans-purse"}:
        reasons.append("your damage photos suggest structural loss — this program covers that")
    elif "total_loss" in tags and r["id"] in {"ab-drp", "habitat-ab"}:
        reasons.append("photos suggest a total loss — major rebuild programs apply")
    if "medication_visible" in tags and r["type"] == "health":
        reasons.append("photos showed medication left behind — Health Link can help with refills")
    if "documents_destroyed" in tags and r["type"] == "documents":
        reasons.append("photos suggest documents were lost — replacement is fee-waived after a declared disaster")
    if "pet_items_present" in tags and r["id"] in {"red-cross-lodging", "211-alberta", "pet-friendly-shelters"}:
        reasons.append("photos showed pet items — they can help locate pet-friendly lodging")


# ---------------------------------------------------------------------------
# Numeric helpers
# ---------------------------------------------------------------------------

def _freshness(scraped_at) -> float:
    if not scraped_at:
        return 0.5
    try:
        d = date.fromisoformat(str(scraped_at)[:10])
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
