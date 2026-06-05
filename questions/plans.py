"""
Recovery plan definitions.

There are 12 distinct plans. The decision tree predicts a plan_id; the
plan_id maps to a structured plan with a name, a one-line summary, and
an ordered list of tasks. Tasks are designed to be actionable and routed
to real Alberta / Canadian programs (DRP, ISC, 211 Alberta, IBC, EI, AHS).

Adding more plans later: just append to PLANS and update routing_rules.
The model will pick up the new plan_id automatically once retrained.
"""

PLANS = {
    0: {
        "name": "Emergency Shelter First",
        "summary": "Your safety tonight is the only thing that matters right now. The rest can wait.",
        "tasks": [
            "Call 211 Alberta (just dial 211) — they'll connect you with the nearest shelter or evacuation centre.",
            "Contact the Canadian Red Cross at 1-800-418-1111 for emergency lodging assistance.",
            "Check your municipality's emergency page for the registered evacuation centre near you.",
            "Once you're somewhere safe, come back and we'll work on the longer-term plan.",
        ],
    },
    1: {
        "name": "Replace Vital Documents First",
        "summary": "Without ID, most aid applications can't move forward. We'll get that fixed first.",
        "tasks": [
            "Visit a Service Alberta / registry office to replace your driver's licence or ID card.",
            "Contact Service Canada at 1-800-622-6232 to replace your SIN and other federal IDs.",
            "Request a free replacement birth certificate from Vital Statistics — fees are often waived for disaster survivors.",
            "Once you have ID, return here and we'll continue with your recovery plan.",
        ],
    },
    2: {
        "name": "Indigenous Services Pathway — Continuing",
        "summary": "You're already in the process. Here's how to keep things moving.",
        "tasks": [
            "Follow up with your band office or Indigenous Services Canada (ISC) on your existing application status.",
            "Keep documenting any new losses or needs that come up — add them to your file.",
            "Stay in touch with your community emergency coordinator for local supports.",
            "If you haven't yet, ask ISC about mental health and wellness supports available to you.",
        ],
    },
    3: {
        "name": "Indigenous Services Pathway — Starting Out",
        "summary": "On-reserve and Métis settlement recovery goes through a separate pathway — and you're not alone in it.",
        "tasks": [
            "Contact your band office or Métis settlement administration first — they coordinate the local response.",
            "Reach Indigenous Services Canada (ISC) at 1-800-567-9604 to open an emergency assistance file.",
            "Document your losses with photos and a written inventory before any cleanup.",
            "Ask about the Emergency Management Assistance Program (EMAP) — it covers eligible response and recovery costs.",
            "Connect with the Hope for Wellness Helpline (1-855-242-3310) for 24/7 culturally grounded support.",
        ],
    },
    4: {
        "name": "Income Disrupted — Uninsured Path",
        "summary": "Lost income and no insurance is one of the hardest places to be. There are programs built for exactly this.",
        "tasks": [
            "Apply for Employment Insurance (EI) at canada.ca/ei — Service Canada activates expedited processing during declared disasters.",
            "Apply for the Alberta Disaster Recovery Program (DRP) at alberta.ca/disaster-recovery-programs — it covers uninsurable losses.",
            "Call 211 Alberta about emergency financial assistance through the Red Cross.",
            "If you were already on AISH or Income Support, contact your caseworker to update your file and confirm direct deposit.",
            "Document your lost income (paystubs, business records) — you'll need this for every application.",
        ],
    },
    5: {
        "name": "Income Disrupted — Insured Path",
        "summary": "Insurance will help with property, but you still need income support while things get sorted.",
        "tasks": [
            "Apply for Employment Insurance (EI) at canada.ca/ei — disaster provisions may apply even without a formal layoff.",
            "Open your insurance claim today if you haven't already — ask specifically about additional living expenses coverage.",
            "Check whether your policy covers loss of income (business owners and some homeowner policies do).",
            "Call 211 Alberta about emergency financial assistance through the Red Cross.",
            "Keep every receipt — temporary housing, food, transportation. These are often reimbursable.",
        ],
    },
    6: {
        "name": "Insured Renter — Standard Path",
        "summary": "Tenant insurance is going to do most of the heavy lifting here. Let's activate it.",
        "tasks": [
            "Call your tenant insurance provider today to open a claim.",
            "Document everything you owned with photos, descriptions, and estimated values.",
            "Ask your insurer about additional living expenses (ALE) — most tenant policies cover hotel and food during displacement.",
            "Coordinate with your landlord about the unit and your lease — get any agreements in writing.",
            "Keep every receipt for temporary expenses for reimbursement.",
        ],
    },
    7: {
        "name": "Uninsured Renter — Aid-Focused Path",
        "summary": "Without tenant insurance, recovery leans on community and provincial support. Here's how to access it.",
        "tasks": [
            "Call 211 Alberta — they coordinate renter-specific emergency assistance and Red Cross financial aid.",
            "Apply for the Alberta Disaster Recovery Program (DRP) for personal essentials replacement.",
            "Contact your landlord in writing about your lease status during displacement — your rights may include rent abatement.",
            "Document your losses with whatever photos or records you have. Bank statements showing past purchases can help.",
            "Look into Alberta Works (Income Support) if you need short-term emergency financial help.",
        ],
    },
    8: {
        "name": "Insured Homeowner — Mid-Process",
        "summary": "You've already filed. Now it's about keeping momentum and avoiding the common pitfalls.",
        "tasks": [
            "Follow up with your insurance adjuster — get all communication in writing.",
            "Request a copy of your full policy and the claim file in writing.",
            "Don't sign anything from contractors until your adjuster has assessed and you've reviewed quotes carefully.",
            "Keep documenting any new losses or expenses as they come up.",
            "If your claim feels stuck, contact the General Insurance OmbudService (giocanada.org) — they mediate for free.",
        ],
    },
    9: {
        "name": "Insured Homeowner — Standard Path",
        "summary": "You own your home and have insurance — that's a strong starting point. Here's how to make the most of it.",
        "tasks": [
            "Call your insurance provider's claims line today and open a claim.",
            "Document every loss with photos before any cleanup happens.",
            "Ask specifically about additional living expenses coverage — it pays for hotels, meals, and transport while you're displaced.",
            "Request a copy of your full policy in writing.",
            "Don't sign anything from contractors until your adjuster has assessed.",
            "Keep a folder (physical or digital) for every receipt, photo, and piece of correspondence.",
        ],
    },
    10: {
        "name": "Uninsured Homeowner — DRP Continuing",
        "summary": "You've applied for DRP — let's keep things moving and make sure nothing falls through.",
        "tasks": [
            "Follow up on your DRP application status at alberta.ca/disaster-recovery-programs or 310-4455.",
            "Keep documenting losses and expenses — DRP often allows supplementary submissions.",
            "If you've been denied for anything, you have the right to appeal — request the reasons in writing.",
            "Check whether you qualify for Habitat for Humanity or other rebuild support programs in your region.",
            "Take care of yourself. Long claims processes are exhausting — 211 Alberta can connect you with mental health supports.",
        ],
    },
    11: {
        "name": "Uninsured Homeowner — DRP Starting Out",
        "summary": "The Alberta Disaster Recovery Program was built for situations like yours. Let's get you started.",
        "tasks": [
            "Apply to the Alberta Disaster Recovery Program at alberta.ca/disaster-recovery-programs as soon as you can.",
            "Document every loss with photos and a written inventory — this is the foundation of your claim.",
            "Get repair estimates from at least two contractors before committing to anything.",
            "Save every receipt for temporary expenses — some are eligible for reimbursement under DRP.",
            "Call 211 Alberta about emergency assistance bridging the gap while your application is processed.",
            "Look into Habitat for Humanity and similar organizations in your region for rebuild support.",
        ],
    },
}


def plan_by_id(plan_id: int) -> dict:
    """Look up a plan by its id."""
    if plan_id not in PLANS:
        raise KeyError(f"Unknown plan id: {plan_id}")
    return PLANS[plan_id]


def n_plans() -> int:
    return len(PLANS)
