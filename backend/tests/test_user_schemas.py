# backend/tests/test_user_schemas.py
import pytest
from pydantic import ValidationError

from app.schemas.user import UserCreate, UserUpdate


def test_user_create_requires_email_and_password():
    with pytest.raises(ValidationError):
        UserCreate(display_name="Test")


def test_user_create_with_minimal_data():
    user = UserCreate(email="test@example.com", password="securepass123")
    assert user.email == "test@example.com"
    assert user.display_name is None


def test_user_update_all_fields_optional():
    update = UserUpdate()
    assert update.display_name is None
    assert update.dietary_restrictions is None


def test_user_update_with_preferences():
    update = UserUpdate(
        dietary_restrictions={"vegan": True},
        preferred_units="imperial",
        favorite_cuisines=["italian", "japanese"],
    )
    assert update.dietary_restrictions == {"vegan": True}
    assert update.preferred_units == "imperial"
    assert update.favorite_cuisines == ["italian", "japanese"]
