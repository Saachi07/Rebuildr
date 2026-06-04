"""
Interactive demo of the adaptive intake.

Run with:
    python demo.py

This walks one user through the adaptive flow on the command line. It
also includes a `--scripted` mode that runs a pre-defined Sarah scenario
end-to-end, useful for screencasts and tests.
"""

import argparse

from intake_engine import IntakeEngine
from plans import plan_by_id


def render_question(q: dict) -> str:
    lines = [
        "",
        "━" * 60,
        q["title"],
        "  " + q["subtitle"],
        "",
    ]
    for i, opt in enumerate(q["options"], 1):
        lines.append(f"  {i}. {opt['label']}")
    return "\n".join(lines)


def render_plan(plan_id: int, confidence: float) -> str:
    plan = plan_by_id(plan_id)
    lines = [
        "",
        "━" * 60,
        f"  Your recovery plan: {plan['name']}",
        f"  (confidence: {confidence:.0%})",
        "",
        f"  {plan['summary']}",
        "",
        "  Next steps:",
    ]
    for i, task in enumerate(plan["tasks"], 1):
        lines.append(f"    {i}. {task}")
    lines.append("")
    return "\n".join(lines)


def prompt_answer(q: dict):
    while True:
        if q["type"] == "single":
            raw = input("\n  Your answer (number): ").strip()
            try:
                idx = int(raw) - 1
                if 0 <= idx < len(q["options"]):
                    return q["options"][idx]["value"]
            except ValueError:
                pass
            print("  Please enter a valid option number.")
        else:
            raw = input("\n  Your answer (numbers separated by commas, or blank for none): ").strip()
            if not raw:
                return []
            try:
                idxs = [int(x.strip()) - 1 for x in raw.split(",")]
                if all(0 <= i < len(q["options"]) for i in idxs):
                    return [q["options"][i]["value"] for i in idxs]
            except ValueError:
                pass
            print("  Please enter valid option numbers separated by commas.")


def run_interactive():
    engine = IntakeEngine()
    answers = {}
    print()
    print("━" * 60)
    print("  EmberPath — Recovery Intake")
    print("━" * 60)
    print("  Take a breath. We'll ask a few questions, no more than we need.")

    asked = 0
    while True:
        q = engine.next_question(answers)
        if q is None:
            break
        asked += 1
        print(render_question(q))
        ans = prompt_answer(q)
        engine.record_answer(answers, q, ans)

    plan_id, confidence = engine.final_plan(answers)
    print(render_plan(plan_id, confidence))
    print(f"  (We got there in {asked} question{'s' if asked != 1 else ''}.)")
    print()


def run_scripted():
    """The Sarah scenario from the demo plan — should resolve quickly."""
    engine = IntakeEngine()

    # Sarah: homeowner, displaced, insured, has all docs, kids at home,
    # can't work right now, hasn't started anything yet.
    answers = {}

    scenarios = [
        ("Sarah (insured homeowner, fresh start)", {
            "housing": 1, "insurance": 0, "income_affected": 1,
            "already_applied": 0,
            "has_id": 1, "has_insurance_doc": 1, "has_deed": 1,
            "has_financial_records": 1,
            "has_kids": 1, "has_seniors": 0, "has_disability": 0, "has_pets": 1,
        }),
        ("Marcus (renter, no insurance, displaced)", {
            "housing": 3, "insurance": 1, "income_affected": 2,
            "already_applied": 0,
            "has_id": 1, "has_insurance_doc": 0, "has_deed": 0,
            "has_financial_records": 1,
            "has_kids": 0, "has_seniors": 0, "has_disability": 0, "has_pets": 0,
        }),
        ("Daniel (on-reserve, mid-process)", {
            "housing": 4, "insurance": 2, "income_affected": 1,
            "already_applied": 2,
            "has_id": 1, "has_insurance_doc": 0, "has_deed": 0,
            "has_financial_records": 0,
            "has_kids": 1, "has_seniors": 1, "has_disability": 0, "has_pets": 0,
        }),
        ("Eleanor (no shelter — urgent)", {
            "housing": 5, "insurance": 2, "income_affected": 1,
            "already_applied": 0,
            "has_id": 0, "has_insurance_doc": 0, "has_deed": 0,
            "has_financial_records": 0,
            "has_kids": 0, "has_seniors": 1, "has_disability": 1, "has_pets": 1,
        }),
    ]

    for name, full_answers in scenarios:
        print()
        print("━" * 60)
        print(f"  Scripted scenario: {name}")
        print("━" * 60)
        partial = {}
        # Feed answers one at a time in the order the engine asks for them.
        asked = 0
        while True:
            q = engine.next_question(partial)
            if q is None:
                break
            asked += 1
            print(f"  Q{asked}: {q['title']}")
            if q["type"] == "single":
                feat = q["feature"]
                v = full_answers[feat]
                label = next(o["label"] for o in q["options"] if o["value"] == v)
                print(f"     → {label}")
                partial[feat] = v
            else:
                feats = q["feature"]
                selected = [f for f in feats if full_answers[f] == 1]
                labels = [next(o["label"] for o in q["options"] if o["value"] == f)
                          for f in selected]
                print(f"     → {', '.join(labels) if labels else '(none)'}")
                for f in feats:
                    partial[f] = full_answers[f]
        plan_id, confidence = engine.final_plan(partial)
        plan = plan_by_id(plan_id)
        print(f"  → Plan: {plan['name']} (confidence {confidence:.0%}, after {asked} questions)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scripted", action="store_true",
                        help="Run pre-defined scenarios instead of interactive prompts.")
    args = parser.parse_args()
    if args.scripted:
        run_scripted()
    else:
        run_interactive()


if __name__ == "__main__":
    main()
