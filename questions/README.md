# EmberPath Intake Engine

An adaptive (Akinator-style) intake module for the EmberPath recovery
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

## What the demo proves

Scripted scenarios from `demo.py --scripted`:

| User | Plan reached | Questions used |
|---|---|---|
| Eleanor (no shelter) | Emergency Shelter First | 1 |
| Daniel (on-reserve, mid-process) | Indigenous Services — Continuing | 2 |
| Sarah (insured homeowner) | Income Disrupted — Insured | 4 |
| Marcus (renter, no insurance) | Income Disrupted — Uninsured | 6 |

The variable question count is the demo. The system genuinely adapts to
the user instead of running them through a fixed form.

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
