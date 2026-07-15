# backend/tests/unit/test_ai_budget_service.py
from app.models.user import User
from tests.conftest import unique_email


# ── Model default ─────────────────────────────────────────────────────────────

def test_new_user_gets_default_ai_call_budget():
    user = User(email=unique_email(), hashed_password="x")
    assert user.ai_call_budget == 300


def test_ai_call_budget_can_be_set_to_none():
    user = User(email=unique_email(), hashed_password="x", ai_call_budget=None)
    assert user.ai_call_budget is None
