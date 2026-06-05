"""
Recommendation demo.

Runs the 4 scripted intake scenarios end-to-end, then prints the
categorised recommendation list each user would see. Use this to
sanity-check that the recommender is actually personalising:
Eleanor should see shelter first, Daniel should see ISC EMAP and
Hope for Wellness, Marcus should see DRP and Income Support, etc.

Run with:
    python recommend_demo.py
"""

from intake_engine import IntakeEngine
from plans import plan_by_id
from recommender import Recommender


# Same 4 scenarios used in demo.py — kept in sync intentionally so the
# recommender output can be eyeballed against the intake plan choice.
SCENARIOS = [
    {
        "name": "Eleanor (no shelter — urgent)",
        "answers": {
            "housing": 5, "insurance": 2, "income_affected": 1,
            "already_applied": 0,
            "has_id": 0, "has_insurance_doc": 0, "has_deed": 0,
            "has_financial_records": 0,
            "has_kids": 0, "has_seniors": 1, "has_disability": 1, "has_pets": 1,
        },
        "context": {
            "region": "AB",
            "disaster_type": "wildfire",
            "disaster_date": "2026-06-02",  # 2 days ago — urgent
            "insurance_company": None,
        },
    },
    {
        "name": "Daniel (on-reserve, mid-process)",
        "answers": {
            "housing": 4, "insurance": 2, "income_affected": 1,
            "already_applied": 2,
            "has_id": 1, "has_insurance_doc": 0, "has_deed": 0,
            "has_financial_records": 0,
            "has_kids": 1, "has_seniors": 1, "has_disability": 0, "has_pets": 0,
        },
        "context": {
            "region": "AB",
            "disaster_type": "flood",
            "disaster_date": "2026-05-10",
            "insurance_company": None,
        },
    },
    {
        "name": "Sarah (insured homeowner)",
        "answers": {
            "housing": 1, "insurance": 0, "income_affected": 1,
            "already_applied": 0,
            "has_id": 1, "has_insurance_doc": 1, "has_deed": 1,
            "has_financial_records": 1,
            "has_kids": 1, "has_seniors": 0, "has_disability": 0, "has_pets": 1,
        },
        "context": {
            "region": "AB",
            "disaster_type": "wildfire",
            "disaster_date": "2026-05-25",
            "insurance_company": "Intact",
        },
    },
    {
        "name": "Marcus (renter, no insurance, displaced)",
        "answers": {
            "housing": 3, "insurance": 1, "income_affected": 2,
            "already_applied": 0,
            "has_id": 1, "has_insurance_doc": 0, "has_deed": 0,
            "has_financial_records": 1,
            "has_kids": 0, "has_seniors": 0, "has_disability": 0, "has_pets": 0,
        },
        "context": {
            "region": "AB",
            "disaster_type": "flood",
            "disaster_date": "2026-05-01",
            "insurance_company": None,
        },
    },
]


CATEGORY_ORDER = ["shelter", "health", "financial", "policy", "documents", "community"]
CATEGORY_LABELS = {
    "shelter": "Shelter & safety",
    "health": "Health & medical",
    "financial": "Financial / insurance",
    "policy": "Government programs",
    "documents": "Document replacement",
    "community": "Community supports",
}


def render_recommendations(by_category: dict) -> str:
    lines = []
    for cat in CATEGORY_ORDER:
        recs = by_category.get(cat, [])
        if not recs:
            continue
        lines.append("")
        lines.append(f"  ── {CATEGORY_LABELS[cat]} " + "─" * (54 - len(CATEGORY_LABELS[cat])))
        for r in recs:
            lines.append(f"    ✦ {r.resource['title']}  (score {r.score:.2f})")
            lines.append(f"      {r.resource['body']}")
            if r.resource.get("phone"):
                lines.append(f"      ☎ {r.resource['phone']}")
            if r.reasons:
                lines.append(f"      → suggested because: {'; '.join(r.reasons)}")
    return "\n".join(lines)


def run():
    engine = IntakeEngine()
    # load_embedder=True will try sentence-transformers; if not installed
    # the embedder soft-disables and semantic_sim contributes zero.
    recommender = Recommender(load_embedder=True)

    for sc in SCENARIOS:
        print()
        print("━" * 70)
        print(f"  {sc['name']}")
        print("━" * 70)

        # Run the intake silently to get a plan distribution.
        answers = {}
        asked = 0
        while True:
            q = engine.next_question(answers)
            if q is None:
                break
            asked += 1
            engine.record_answer(answers, q, _scripted_answer(q, sc["answers"]))

        plan_id, confidence = engine.final_plan(answers)
        plan = plan_by_id(plan_id)
        dist = engine.predict_distribution(answers)
        print(f"  Intake → {plan['name']}  ({confidence:.0%} confidence, "
              f"{asked} question{'s' if asked != 1 else ''})")

        ctx = dict(sc["context"])
        ctx["intake_answers"] = answers
        recs = recommender.recommend(dist, ctx)
        print(render_recommendations(recs))


def _scripted_answer(q: dict, full_answers: dict):
    if q["type"] == "single":
        return full_answers[q["feature"]]
    return [f for f in q["feature"] if full_answers.get(f) == 1]


if __name__ == "__main__":
    run()
