# backend/tests/integration/test_shopping_list_routes.py
"""Integration tests for /api/v1/shopping-lists/* routes."""
import uuid
from unittest.mock import AsyncMock, patch

from app.schemas.ai_responses import ShoppingItemAIResult, ShoppingListAIResult
from tests.conftest import unique_email


# ── Auth helpers ──────────────────────────────────────────────────────────────

async def _auth_token(client, password: str = "SecurePass123!") -> tuple[str, str]:
    """Register a unique user and return (user_id, access_token)."""
    email = unique_email("shopping")
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.json()
    user_id = reg.json()["id"]
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.json()
    return user_id, login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_recipe(client, token: str) -> str:
    """Create a recipe and return its ID."""
    r = await client.post(
        "/api/v1/recipes",
        json={
            "title": "Shopping Test Recipe",
            "ingredients": [
                {"name": "flour", "quantity": "200", "unit": "g"},
                {"name": "eggs", "quantity": "3", "unit": ""},
            ],
            "steps": [{"order": 1, "instruction": "Mix everything."}],
            "servings": 2,
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.json()
    return r.json()["id"]


async def _create_plan_with_entry(client, token: str, recipe_id: str) -> str:
    """Create a meal plan, add an entry, return plan_id."""
    plan_r = await client.post(
        "/api/v1/meal-plans",
        json={"name": "Shopping Plan", "start_date": "2026-05-05", "end_date": "2026-05-05"},
        headers=_auth(token),
    )
    assert plan_r.status_code == 201, plan_r.json()
    plan_id = plan_r.json()["id"]

    entry_r = await client.post(
        f"/api/v1/meal-plans/{plan_id}/entries",
        json={
            "date": "2026-05-05",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "servings": 2,
            "source": "manual",
            "entry_type": "recipe",
            "position": 0,
        },
        headers=_auth(token),
    )
    assert entry_r.status_code == 201, entry_r.json()
    return plan_id


# ── GET /api/v1/shopping-lists/{meal_plan_id} ─────────────────────────────────

async def test_get_shopping_list_requires_auth(client):
    r = await client.get(f"/api/v1/shopping-lists/{uuid.uuid4()}")
    assert r.status_code == 401


async def test_get_shopping_list_404_for_unknown_plan(client):
    _, token = await _auth_token(client)
    r = await client.get(f"/api/v1/shopping-lists/{uuid.uuid4()}", headers=_auth(token))
    assert r.status_code == 404


async def test_get_shopping_list_creates_empty_list_for_new_plan(client):
    _, token = await _auth_token(client)
    recipe_id = await _create_recipe(client, token)
    plan_id = await _create_plan_with_entry(client, token, recipe_id)

    r = await client.get(f"/api/v1/shopping-lists/{plan_id}", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["meal_plan_id"] == plan_id
    assert isinstance(data["items"], list)


async def test_get_shopping_list_returns_same_list_on_second_call(client):
    """Idempotent — repeated GETs return the same list_id."""
    _, token = await _auth_token(client)
    recipe_id = await _create_recipe(client, token)
    plan_id = await _create_plan_with_entry(client, token, recipe_id)

    r1 = await client.get(f"/api/v1/shopping-lists/{plan_id}", headers=_auth(token))
    r2 = await client.get(f"/api/v1/shopping-lists/{plan_id}", headers=_auth(token))
    assert r1.json()["id"] == r2.json()["id"]


async def test_get_shopping_list_forbidden_for_other_user(client):
    """A second user cannot retrieve another user's shopping list."""
    _, token_a = await _auth_token(client)
    _, token_b = await _auth_token(client)

    recipe_id = await _create_recipe(client, token_a)
    plan_id = await _create_plan_with_entry(client, token_a, recipe_id)

    r = await client.get(f"/api/v1/shopping-lists/{plan_id}", headers=_auth(token_b))
    assert r.status_code == 404


# ── POST /api/v1/shopping-lists/{meal_plan_id}/regenerate ────────────────────

async def test_regenerate_returns_items_from_ai(client):
    """Regenerate calls AI and replaces items with the AI result."""
    _, token = await _auth_token(client)
    recipe_id = await _create_recipe(client, token)
    plan_id = await _create_plan_with_entry(client, token, recipe_id)

    mock_ai_result = ShoppingListAIResult(items=[
        ShoppingItemAIResult(
            ingredient_name="flour",
            total_quantity=200.0,
            unit="g",
            detail="200 g for Shopping Test Recipe",
            category="Basic Ingredients for Cooking and Baking",
            recipe_names=["Shopping Test Recipe"],
        ),
        ShoppingItemAIResult(
            ingredient_name="eggs",
            total_quantity=3.0,
            unit="",
            detail="3  for Shopping Test Recipe",
            category="Cooled Products, Milk Products",
            recipe_names=["Shopping Test Recipe"],
        ),
    ])

    with patch(
        "app.services.ai_service.call_ai_structured",
        new=AsyncMock(return_value=mock_ai_result),
    ):
        r = await client.post(
            f"/api/v1/shopping-lists/{plan_id}/regenerate",
            headers=_auth(token),
        )

    assert r.status_code == 200
    data = r.json()
    item_names = [i["ingredient_name"] for i in data["items"]]
    assert "flour" in item_names
    assert "eggs" in item_names


# ── PATCH /api/v1/shopping-lists/{meal_plan_id}/items/{item_id} ──────────────

async def test_generate_shopping_list_returns_202(client):
    _, token = await _auth_token(client)
    from unittest.mock import patch, AsyncMock
    with patch("app.api.routes.shopping_lists.process_shopping_generate", new=AsyncMock()):
        response = await client.post(
            "/api/v1/shopping-lists/generate",
            json={"entry_ids": [], "name": "Test list"},
            headers=_auth(token),
        )
    assert response.status_code == 202
    data = response.json()
    assert "task_id" in data


async def test_list_shopping_lists_empty(client):
    _, token = await _auth_token(client)
    response = await client.get(
        "/api/v1/shopping-lists",
        headers=_auth(token),
    )
    assert response.status_code == 200
    assert response.json() == []


async def test_toggle_item_checked(client):
    """Toggle an item to checked=True, then back to False."""
    _, token = await _auth_token(client)
    recipe_id = await _create_recipe(client, token)
    plan_id = await _create_plan_with_entry(client, token, recipe_id)

    mock_ai_result = ShoppingListAIResult(items=[
        ShoppingItemAIResult(
            ingredient_name="flour",
            total_quantity=200.0,
            unit="g",
            detail="200 g for Shopping Test Recipe",
            category="Basic Ingredients for Cooking and Baking",
            recipe_names=["Shopping Test Recipe"],
        ),
    ])

    with patch(
        "app.services.ai_service.call_ai_structured",
        new=AsyncMock(return_value=mock_ai_result),
    ):
        regen = await client.post(
            f"/api/v1/shopping-lists/{plan_id}/regenerate",
            headers=_auth(token),
        )
    assert regen.status_code == 200
    item_id = regen.json()["items"][0]["id"]

    # Check the item
    check_r = await client.patch(
        f"/api/v1/shopping-lists/{plan_id}/items/{item_id}",
        json={"checked": True},
        headers=_auth(token),
    )
    assert check_r.status_code == 200
    assert check_r.json()["checked"] is True

    # Uncheck the item
    uncheck_r = await client.patch(
        f"/api/v1/shopping-lists/{plan_id}/items/{item_id}",
        json={"checked": False},
        headers=_auth(token),
    )
    assert uncheck_r.status_code == 200
    assert uncheck_r.json()["checked"] is False
