"""Put `questions/` on the import path so the standalone recommender
module is importable as `recommender`, just like `recommend_demo.py`
runs it."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS = ROOT / "questions"
if str(QUESTIONS) not in sys.path:
    sys.path.insert(0, str(QUESTIONS))
