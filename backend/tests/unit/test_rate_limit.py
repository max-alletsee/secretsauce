# backend/tests/unit/test_rate_limit.py
"""Verify in-memory rate limit values match the spec."""
from datetime import timedelta

from app.core.rate_limit import _AUTH_LIMIT, _AUTH_WINDOW, _IMPORT_LIMIT, _IMPORT_WINDOW


def test_auth_rate_limit_is_10_per_minute():
    assert _AUTH_LIMIT == 10
    assert _AUTH_WINDOW == timedelta(minutes=1)


def test_import_rate_limit_is_100_per_hour():
    assert _IMPORT_LIMIT == 100
    assert _IMPORT_WINDOW == timedelta(hours=1)
