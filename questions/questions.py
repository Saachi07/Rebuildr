"""
Question definitions for the EmberPath intake.

Each question is rendered to the user as a card with a title, a short
subtitle, and a set of options. Internally, every question maps to one
or more *features* — these are the columns the trained decision tree
sees. Single-select questions map to one feature; multi-select questions
map to several binary features.

Tone: warm and human, not chirpy. People using this just lost their
homes — we treat them with dignity and keep the friction low.
"""

QUESTIONS = [
    {
        "id": "housing",
        "feature": "housing",
        "type": "single",
        "title": "First things first — where are you right now?",
        "subtitle": "Let's start with the most important thing: making sure you're safe.",
        "options": [
            {"value": 0, "label": "I'm at home and it's still livable"},
            {"value": 1, "label": "I own my home but I'm displaced"},
            {"value": 2, "label": "I rent and my unit is still livable"},
            {"value": 3, "label": "I rent but I'm displaced"},
            {"value": 4, "label": "I live on-reserve or in a Métis settlement"},
            {"value": 5, "label": "I have nowhere to go — I need shelter"},
        ],
    },
    {
        "id": "documents",
        "feature": ["has_id", "has_insurance_doc", "has_deed", "has_financial_records"],
        "type": "multi",
        "title": "What made it out with you?",
        "subtitle": "Anything you have makes the next steps easier. Missing things is okay — we can help replace them.",
        "options": [
            {"value": "has_id", "label": "Government ID"},
            {"value": "has_insurance_doc", "label": "Insurance papers"},
            {"value": "has_deed", "label": "Lease or property deed"},
            {"value": "has_financial_records", "label": "Bank or tax records"},
        ],
    },
    {
        "id": "insurance",
        "feature": "insurance",
        "type": "single",
        "title": "Do you have insurance that might cover this?",
        "subtitle": "Even \"not sure\" is useful — we'll help you find out.",
        "options": [
            {"value": 0, "label": "Yes"},
            {"value": 1, "label": "No"},
            {"value": 2, "label": "Not sure"},
        ],
    },
    {
        "id": "household",
        "feature": ["has_kids", "has_seniors", "has_disability", "has_pets"],
        "type": "multi",
        "title": "Who's in this with you?",
        "subtitle": "We'll make sure their needs are part of the plan.",
        "options": [
            {"value": "has_kids", "label": "Children under 18"},
            {"value": "has_seniors", "label": "Seniors (65+)"},
            {"value": "has_disability", "label": "Someone with a disability or chronic illness"},
            {"value": "has_pets", "label": "Pets"},
        ],
    },
    {
        "id": "income",
        "feature": "income_affected",
        "type": "single",
        "title": "Has this affected your ability to earn?",
        "subtitle": "There are programs for exactly this. No judgment — just a fact we work with.",
        "options": [
            {"value": 0, "label": "Still working as normal"},
            {"value": 1, "label": "Can't work temporarily"},
            {"value": 2, "label": "Lost my job or business"},
            {"value": 3, "label": "Was already on assistance"},
        ],
    },
    {
        "id": "applied",
        "feature": "already_applied",
        "type": "single",
        "title": "Where are you in the process so far?",
        "subtitle": "Wherever you are is the right place to start. We'll meet you there.",
        "options": [
            {"value": 0, "label": "Haven't started anything yet"},
            {"value": 1, "label": "Filed an insurance claim"},
            {"value": 2, "label": "Applied for government aid"},
            {"value": 3, "label": "Both — claim filed and aid applied"},
        ],
    },
]

# The flat list of features the model sees, in fixed order.
# This order must match the columns of X in synthetic_data and train_model.
FEATURE_NAMES = [
    "housing",
    "insurance",
    "income_affected",
    "already_applied",
    "has_id",
    "has_insurance_doc",
    "has_deed",
    "has_financial_records",
    "has_kids",
    "has_seniors",
    "has_disability",
    "has_pets",
]


def question_by_id(qid: str) -> dict:
    """Look up a question definition by its id."""
    for q in QUESTIONS:
        if q["id"] == qid:
            return q
    raise KeyError(f"Unknown question id: {qid}")
