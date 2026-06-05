import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from damage_analyzer import DamagedItem, PROMPT


def test_damaged_item_has_no_damage_grade_field():
    fields = DamagedItem.model_fields
    assert "damage_grade" not in fields


def test_damaged_item_requires_name_category_description():
    item = DamagedItem(
        name="wooden chair",
        category="furniture",
        damage_description="legs charred",
    )
    assert item.name == "wooden chair"
    assert item.damage_description == "legs charred"


def test_prompt_does_not_mention_damage_grade():
    assert "damage grade" not in PROMPT.lower()
    assert "intact" not in PROMPT
    assert "smoke_damaged" not in PROMPT
    assert "partially_burned" not in PROMPT
    assert "destroyed" not in PROMPT
