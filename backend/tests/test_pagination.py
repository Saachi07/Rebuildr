"""Opt-in pagination helper: defaults, clamping, and bad-input safety."""

from app.pagination import DEFAULT_LIMIT, MAX_LIMIT, parse_pagination


def test_no_limit_means_return_all():
    assert parse_pagination({}) == (None, 0)
    assert parse_pagination({"limit": ""}) == (None, 0)
    # offset alone, without limit, still means "return all"
    assert parse_pagination({"offset": "20"}) == (None, 0)


def test_limit_and_offset_parsed():
    assert parse_pagination({"limit": "25", "offset": "50"}) == (25, 50)


def test_limit_clamped_to_bounds():
    assert parse_pagination({"limit": "0"}) == (1, 0)
    assert parse_pagination({"limit": str(MAX_LIMIT + 1000)}) == (MAX_LIMIT, 0)


def test_bad_values_fall_back_safely():
    # A non-numeric limit should not 500; it falls back to the default.
    assert parse_pagination({"limit": "abc"}) == (DEFAULT_LIMIT, 0)
    # A non-numeric offset falls back to 0.
    assert parse_pagination({"limit": "10", "offset": "xyz"}) == (10, 0)
    # Negative offset is clamped to 0.
    assert parse_pagination({"limit": "10", "offset": "-5"}) == (10, 0)
