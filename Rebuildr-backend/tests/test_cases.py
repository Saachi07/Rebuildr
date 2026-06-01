import pytest
from app.errors import CaseError, case_error


def test_case_error_returns_correct_shape():
    body, status = case_error("INVALID_CASE_INPUT", "Bad input.", {"fields": {"case_name": "Required."}})
    assert status == 400
    assert body["error"]["code"] == "INVALID_CASE_INPUT"
    assert body["error"]["details"]["fields"]["case_name"] == "Required."


def test_case_error_defaults_empty_details():
    body, status = case_error("CASE_NOT_FOUND", "Not found.", status=404)
    assert status == 404
    assert body["error"]["details"] == {}
