# backend/tests/unit/test_shopping_attribution.py
"""Shopping-list AI calls must pass call_type/user_id/db so they are logged
in ai_call_logs and count against the user's AI budget."""
import datetime as _dt
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.meal_plan import MealPlan, MealPlanEntry
from app.models.recipe import Recipe, RecipeVersion
from app.models.user import User
from app.schemas.ai_responses import ShoppingListAIResult
from app.services import shopping as shopping_service
from tests.conftest import unique_email


@pytest.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


async def _make_user_and_recipe(db: AsyncSession) -> tuple[User, Recipe]:
    user = User(email=unique_email("shopattr"), hashed_password="x")
    db.add(user)
    await db.commit()
    await db.refresh(user)

    recipe = Recipe(owner_id=user.id)
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)

    version = RecipeVersion(
        recipe_id=recipe.id,
        title="Test Pasta",
        ingredients=[{"name": "pasta", "quantity": "200", "unit": "g"}],
        steps=[{"order": 1, "instruction": "Cook"}],
        servings=2,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)

    recipe.current_version_id = version.id
    db.add(recipe)
    await db.commit()
    return user, recipe


async def test_generate_from_entries_attributes_ai_call(db_session):
    user, recipe = await _make_user_and_recipe(db_session)
    entry = MealPlanEntry(
        user_id=user.id,
        date=_dt.date(2026, 7, 15),
        meal_type="dinner",
        recipe_id=recipe.id,
        servings=2,
    )
    db_session.add(entry)
    await db_session.commit()
    await db_session.refresh(entry)

    mock_call = AsyncMock(return_value=ShoppingListAIResult(items=[]))
    with patch("app.services.ai_service.call_ai_structured", mock_call):
        await shopping_service.generate_shopping_list_from_entries(
            db_session, user.id, [entry.id], name="Test list"
        )

    assert mock_call.call_count == 1
    kwargs = mock_call.call_args.kwargs
    assert kwargs["call_type"] == "shopping_list"
    assert kwargs["user_id"] == user.id
    assert kwargs["db"] is db_session


async def test_regenerate_attributes_ai_call(db_session):
    user, recipe = await _make_user_and_recipe(db_session)
    plan = MealPlan(
        user_id=user.id,
        name="Week",
        start_date=_dt.date(2026, 7, 13),
        end_date=_dt.date(2026, 7, 19),
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)

    entry = MealPlanEntry(
        meal_plan_id=plan.id,
        user_id=user.id,
        date=_dt.date(2026, 7, 15),
        meal_type="dinner",
        recipe_id=recipe.id,
        servings=2,
    )
    db_session.add(entry)
    await db_session.commit()

    mock_call = AsyncMock(return_value=ShoppingListAIResult(items=[]))
    with patch("app.services.ai_service.call_ai_structured", mock_call):
        await shopping_service.regenerate_shopping_list(db_session, user.id, plan.id)

    assert mock_call.call_count == 1
    kwargs = mock_call.call_args.kwargs
    assert kwargs["call_type"] == "shopping_list"
    assert kwargs["user_id"] == user.id
    assert kwargs["db"] is db_session
