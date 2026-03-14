# backend/tests/test_user_model.py
from app.models.user import User


def test_user_model_has_all_required_fields():
    field_names = set(User.model_fields.keys())
    expected = {
        "id", "email", "hashed_password", "is_active", "is_superuser", "is_verified",
        "display_name", "dietary_restrictions", "allergies", "preferred_units",
        "favorite_cuisines", "disliked_ingredients", "default_servings",
        "meal_plan_system_prompt", "auth_providers", "created_at", "updated_at",
    }
    missing = expected - field_names
    assert not missing, f"Missing fields on User model: {missing}"


def test_user_defaults():
    user = User(email="test@example.com", hashed_password="x")
    assert user.preferred_units == "metric"
    assert user.default_servings == 2
    assert user.dietary_restrictions == {}
    assert user.favorite_cuisines == []
    assert user.is_active is True
    assert user.is_superuser is False
