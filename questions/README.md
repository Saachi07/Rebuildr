# Rebuildr Intake Engine

An adaptive (Akinator-style) intake module for the Rebuildr recovery
assistant. Asks the user a small number of questions and routes them to
one of 12 recovery plans aligned with real Alberta / Canadian programs
(DRP, ISC, IBC, 211 Alberta, EI, AHS).

**No API calls. All local.** A trained `DecisionTreeClassifier` ships as
a pickle (~100 KB). The engine wraps it with information-gain question
selection so clear-cut cases finish in 1–2 questions while ambiguous
ones use all 6.

## What's in here

| File | Purpose |
|---|---|
| `questions.py` | The 6 intake questions with their option labels |
| `plans.py` | The 12 recovery plans with summaries and task lists |
| `routing_rules.py` | Hand-coded rules mapping features → plan_id (the ground truth) |
| `synthetic_data.py` | Generates 10 000 fake users + labels for training |
| `train_model.py` | Trains and pickles the decision tree |
| `intake_engine.py` | The adaptive engine (info gain, partial-answer inference) |
| `demo.py` | Interactive CLI demo + scripted scenarios |
| `flask_blueprint.py` | Drop-in Flask blueprint for the existing app |

## Quick start

```bash
pip install -r requirements.txt
python synthetic_data.py    # creates synthetic_data.npz
python train_model.py       # creates intake_model.pkl
python demo.py --scripted   # see 4 scenarios run end-to-end
python demo.py              # interactive walk-through
```

## How it works

1. **Synthetic data.** `synthetic_data.py` draws random users from
   plausible Alberta-flavored priors, then labels each with the plan
   our routing rules would assign. Output: `synthetic_data.npz`.

2. **Train.** `train_model.py` fits a `DecisionTreeClassifier` with
   `max_depth=12`, `min_samples_leaf=15`, `class_weight="balanced"`.
   On a held-out 20% split, accuracy is ~100% — expected, since the
   labels come from rules the tree can perfectly learn.

3. **Adaptive runtime.** `intake_engine.IntakeEngine` does two things:
   - **Partial-answer inference.** For unanswered features it draws
     samples from the training-data marginals, runs `predict_proba`
     on each, and averages. This gives a calibrated distribution over
     plans even with only one answer collected.
   - **Information-gain question selection.** At each step it loops
     over the unanswered questions, simulates each possible answer,
     computes the expected entropy of the resulting distribution, and
     picks the question with the largest expected drop. Stops when
     one plan has probability ≥ 80%.

## UX architecture: recovery plan as the central spine

The recovery plan questionnaire is the primary user journey through the
app. The three other Hub modules — **inventory**, **documents**, and
**emergency contacts** — are not separate tabs the user navigates to
independently. Instead, they surface *contextually* as offers during the
adaptive questioning flow, triggered by specific answers.

This means the intake engine drives the entire experience. The engine
picks the next feature to resolve (via information gain), the UX layer
wraps that feature in warm conversational language, the user answers,
and if that answer is relevant to a module, the module surfaces inline
as an optional offer.

### Why this matters

Someone who just lost their home doesn't want a dashboard with four
tiles to choose from. They want to be *guided*. The recovery plan
questionnaire acts as that guide — it asks one question at a time, in
the order that matters most for *this specific person*, and offers the
right tools at the right moment. The inventory doesn't appear until the
user mentions property damage. The document upload doesn't appear until
they confirm they have insurance. The contacts module doesn't appear
until they mention income disruption.

### Warm question framing

Each feature in the engine maps to a warm, conversational question
instead of a survey-style field. The `questions.py` file should include
a `warm_text` field alongside the existing `text` field. The engine
doesn't change — only the display layer.

| Feature | Cold (avoid) | Warm (use) |
|---|---|---|
| `housing` | "Select your housing status" | "Do you have a safe place to stay tonight?" |
| `has_id` | "Do you have government ID? Y/N" | "Do you have your ID with you, or was it lost in the disaster?" |
| `insurance` | "Insurance status: Insured / Uninsured / Not sure" | "Do you have home insurance, or are you not sure right now? Either way is fine." |
| `income_affected` | "Has your income been impacted? Yes/No" | "Has the disaster affected your work or income at all?" |
| `already_applied` | "Have you applied for aid? Y/N" | "Have you already started any applications for help, or is this your first step?" |

The pattern: acknowledge the situation, ask in plain language, normalize
all answers. Never ask a bare field label as a question.

### Answer-triggered module surfaces

Specific answers cause the frontend to surface a module offer inline.
These are always optional and phrased as "you can" or "whenever you're
ready" — never mandatory steps.

| Answer | Module triggered | Contextual offer |
|---|---|---|
| `housing` reveals dwelling type (own/rent) | **Inventory** | "Whenever you're ready, you can take photos of the damage — it'll help with your claim later. No rush." |
| `has_id` = 0 (no ID) | **Documents** | "We can help you track which documents you need to replace. Want to note what's missing?" |
| `insurance` = insured | **Documents** | "If you find your policy, you can snap a photo and we'll pull out the key details — coverage limits, your adjuster's info, deadlines." |
| `income_affected` = severe | **Contacts** | "There are programs that can help with that — want me to save the EI and 211 Alberta numbers so they're easy to find?" |
| `already_applied` = yes | **Documents** | "If you have any confirmation emails or reference numbers, you can upload them and we'll track the status." |

Implementation: in the Flask blueprint's `/answer` endpoint, after
`record_answer()`, check the feature just answered and include a
`module_offer` object in the response JSON if a trigger matches. The
frontend renders it as an inline card the user can act on or dismiss.

### The generated plan is a living checklist

After the engine reaches confidence threshold and selects a plan, the
output is a living checklist — not a static PDF. Each checklist item is
color-coded by module origin (inventory tasks, document tasks, contact
tasks, action items) and deep-links back to the relevant module. A
progress bar shows completion across all modules.

If the user skips a module offer during the questionnaire, the plan
notes it as an incomplete task they can return to later. If they add
data to a module directly (outside the questionnaire), the plan
recognizes it and updates automatically.

## Tier 2: optional personalization

After the core 5–6 questions route the user to one of the 12 base
plans, the app offers an optional second round of questions gated behind
a clear opt-in:

> "Your recovery plan is ready. A few more details could unlock
> additional programs and support specifically for your situation.
> This is completely optional and takes about 2 minutes."
>
> **[See what else is available]**  /  **[Skip for now]**

### What Tier 2 does differently

Tier 2 **enriches** the existing plan — it does not re-route. The base
plan (Emergency Shelter, Insured Homeowner, etc.) stays the same. Tier 2
appends additional resources, contacts, and aid programs as extra
checklist items. The output is a list of `enrichment_tags` (e.g.
`["senior_supports", "medication_emergency"]`) that `plans.py` uses to
extend the task list.

Tier 2 also uses the same adaptive engine architecture. A second
`IntakeEngine` instance is trained on the Tier 2 features and selects
questions by information gain. Most users will only need 2–3 of the 8
possible questions, depending on their base plan.

### Tier 2 features and the programs they unlock

These questions are more sensitive than the core ones (demographics,
disability, immigration status). Each question must explain *why* it's
being asked and what it unlocks. The pattern: name the benefit, ask in
plain language, normalize all answers.

| Feature | Warm question | Programs unlocked |
|---|---|---|
| `is_senior` | "Some programs have extra support for people over 65 — does that apply to you or anyone in your household?" | Alberta Seniors Financial Assistance; Seniors Home Adaptation and Repair Program (SHARP); OAS/GIS emergency provisions |
| `citizenship_status` | "Aid programs vary by residency status. Are you a Canadian citizen, permanent resident, or here on a different visa? This just helps us find the right ones for you." | Settlement agency disaster support (CCIS, EISA); Immigrant Services Alberta navigators; IRCC disaster-specific temporary resident pathways |
| `language_pref` | "Would it help to get recovery resources in a language other than English? We can connect you with services in several languages." | 211 Alberta multilingual interpreters (170+ languages); translated DRP application guides |
| `has_disability` | "Are there any accessibility or mobility needs we should keep in mind for you or your household? There are specific supports available." | AISH emergency provisions; accessible housing priority placement; AHS fast-track medical equipment replacement |
| `has_dependents` | "Do you have kids or anyone else who depends on you at home? Families with children often qualify for extra help." | Alberta Child and Family Benefit emergency top-up; school re-enrollment support; emergency subsidized childcare |
| `has_pets_livestock` | "Do you have pets or animals that were affected? There are people who can help with that too." | Alberta SPCA disaster response (foster, vet care, supplies); AgriRecovery (livestock / farm animals) |
| `needs_medication` | "Did you lose any medications or medical equipment in the disaster? Pharmacies and AHS have emergency provisions for exactly this." | AHS emergency prescriptions (pharmacists can provide 30-day supplies); Alberta Blue Cross emergency coverage |
| `has_business` | "Was a small business or farm affected alongside your home? There are separate recovery programs for that." | Canada Small Business Financing disaster loans; BDC emergency support (deferred payments, bridge financing); AFSC farm-specific disaster lending |

### Tier 2 implementation

| File | Purpose |
|---|---|
| `tier2_questions.py` | The 8 Tier 2 questions with warm text and option labels |
| `tier2_routing_rules.py` | Rules mapping Tier 2 features → enrichment tags |
| `tier2_synthetic_data.py` | Generates fake users with Tier 2 features + enrichment labels |
| `tier2_train_model.py` | Trains the Tier 2 decision tree |
| `tier2_engine.py` | Second `IntakeEngine` instance for the personalization round |

The Tier 2 engine reuses the same `IntakeEngine` class. The only
difference is the model, data, and feature set it loads. In the Flask
blueprint, after the core intake completes, include a
`tier2_available: true` flag in the response. If the user opts in, start
a second intake session with the Tier 2 engine.

### Tier 2 caveat

The specific programs listed above need to be verified against current
Alberta and Canadian program availability. Program names, eligibility
criteria, and availability may have changed. This is a design framework
— the exact program list should be confirmed through research before
the final demo.

## What the demo proves

Scripted scenarios from `demo.py --scripted`:

| User | Plan reached | Questions used |
|---|---|---|
| Eleanor (no shelter) | Emergency Shelter First | 1 |
| Daniel (on-reserve, mid-process) | Indigenous Services — Continuing | 2 |
| Sarah (insured homeowner) | Income Disrupted — Insured | 4 |
| Marcus (renter, no insurance) | Income Disrupted — Uninsured | 6 |

The variable question count is the core demo. The system genuinely
adapts to the user instead of running them through a fixed form.

For the recorded MVP demo, the strongest path is:

1. Show Eleanor: 1 question → immediate shelter routing → contacts
   surface with emergency numbers. Proves the engine stops early.
2. Show Sarah: 4 questions → each answer naturally surfaces a different
   module (inventory, documents, contacts) → base plan generated →
   opt into Tier 2 → 2–3 more questions → plan visibly grows with
   senior/medication/childcare programs. Proves the full flow.

The before/after on Sarah's plan (core vs core + Tier 2) is the
strongest visual moment in the demo.

## Integrating with the existing app

In `app/__init__.py` (or wherever `create_app` lives):

```python
from .intake_engine import IntakeEngine
from .flask_blueprint import init_engine, intake_bp

def create_app():
    app = Flask(__name__)
    # ... existing init ...
    init_engine(
        model_path="path/to/intake_model.pkl",
        data_path="path/to/synthetic_data.npz",
    )
    app.register_blueprint(intake_bp)
    return app
```

Add the `IntakeSession` model (commented at the top of
`flask_blueprint.py`) to your models package and run a migration. The
blueprint exposes:

- `POST /api/cases/<case_id>/intake/start`
- `POST /api/intake/<session_id>/answer`
- `GET  /api/intake/<session_id>`

The `/answer` endpoint response shape with module offers:

```json
{
  "next_question": {
    "feature": "insurance",
    "warm_text": "Do you have home insurance, or are you not sure right now?",
    "type": "single",
    "options": [...]
  },
  "distribution": [0.02, 0.01, ...],
  "module_offer": {
    "module": "inventory",
    "text": "Whenever you're ready, you can take photos of the damage...",
    "action": "open_inventory",
    "scope": { "rooms": ["kitchen", "living_room"] }
  },
  "done": false
}
```

When `done: true`, the response includes `plan_id`, `confidence`, and
`tier2_available: true`. If the user opts in to Tier 2, start a new
session with the Tier 2 engine via:

- `POST /api/cases/<case_id>/intake/tier2/start`
- `POST /api/intake/<session_id>/tier2/answer`

## Customising

- **Add a plan.** Append to `plans.PLANS`, add a routing rule in
  `routing_rules.assign_plan`, re-run `synthetic_data.py` and
  `train_model.py`.
- **Change a question.** Edit `questions.QUESTIONS`. If you add a new
  feature, also add it to `FEATURE_NAMES` and to `PRIORS` in
  `synthetic_data.py`, then retrain.
- **Tune adaptiveness.** `CONFIDENCE_THRESHOLD` in `intake_engine.py`
  controls how confident we want to be before stopping. Lower it for
  fewer questions, raise it for more thorough intake.
- **Add a Tier 2 enrichment.** Add the feature to
  `tier2_questions.py`, add the enrichment tag mapping in
  `tier2_routing_rules.py`, add the tag's checklist items to
  `plans.py`, then regenerate Tier 2 training data and retrain.
- **Change a warm question.** Edit the `warm_text` field in
  `questions.py` or `tier2_questions.py`. No retraining needed — only
  the display text changes.

## Honest caveats for the demo

The training data is synthetic, generated from the same routing rules
the tree learns. This means the tree is essentially recompiling our
hand-coded rules into a decision tree — not learning anything beyond
them. That's a legitimate MVP pattern but worth being upfront about
in the presentation. Frame it as: *"we trained a decision tree on
simulated Alberta recovery scenarios"*, with *"future work: train on
anonymised real recovery case data"* as the next step.

The adaptive question selection itself is real and generalises beyond
the training data — that's the actually interesting AI piece.

The Tier 2 program list (Alberta Seniors Financial Assistance, AISH,
settlement agencies, AgriRecovery, etc.) needs to be verified against
current program availability before the final demo. The design pattern
is sound, but specific eligibility details and program names should be
confirmed.