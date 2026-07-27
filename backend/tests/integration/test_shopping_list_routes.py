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


# ── Entry-based lists: resolve by the list's own ID ───────────────────────────

async def _create_entry_based_list(
    client, db_engine, token: str, user_id: str, name: str = "Week list"
) -> tuple[str, str]:
    """Build a timeline entry, generate an entry-based list from it.

    Returns (list_id, recipe_id). Entry-based lists have meal_plan_id=NULL, so
    they can only be addressed by their own primary key.
    """
    from app.services.shopping import generate_shopping_list_from_entries

    recipe_id = await _create_recipe(client, token)

    # Create via the timeline route — that is what the New List view reads from,
    # and unlike the meal-plan route it stamps entry.user_id, which
    # generate_shopping_list_from_entries filters on.
    entry_r = await client.post(
        "/api/v1/timeline/entries",
        json={
            "date": "2026-05-05",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "entry_type": "recipe",
            "servings": 2,
            "source": "manual",
            "position": 0,
        },
        headers=_auth(token),
    )
    assert entry_r.status_code == 201, entry_r.json()
    entry_id = entry_r.json()["id"]

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

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as db:
        with patch(
            "app.services.ai_service.call_ai_structured",
            new=AsyncMock(return_value=mock_ai_result),
        ):
            shopping_list = await generate_shopping_list_from_entries(
                db, uuid.UUID(user_id), [uuid.UUID(entry_id)], name
            )
        return str(shopping_list.id), recipe_id


async def test_get_entry_based_list_by_its_own_id(client, db_engine):
    """An entry-based list (meal_plan_id=NULL) is retrievable by its own ID.

    Regression: the route resolved the path param only as a meal_plan_id, so
    freshly generated lists 404'd and the detail page rendered empty.
    """
    user_id, token = await _auth_token(client)
    list_id, _ = await _create_entry_based_list(
        client, db_engine, token, user_id, name="Week list"
    )

    r = await client.get(f"/api/v1/shopping-lists/{list_id}", headers=_auth(token))
    assert r.status_code == 200, r.json()
    data = r.json()
    assert data["id"] == list_id
    assert data["name"] == "Week list"
    assert data["meal_plan_id"] is None
    assert [i["ingredient_name"] for i in data["items"]] == ["flour"]


async def test_get_entry_based_list_404_for_other_user(client, db_engine):
    """Ownership is still enforced when resolving by list ID."""
    user_a, token_a = await _auth_token(client)
    _, token_b = await _auth_token(client)

    list_id, _ = await _create_entry_based_list(client, db_engine, token_a, user_a)

    r = await client.get(f"/api/v1/shopping-lists/{list_id}", headers=_auth(token_b))
    assert r.status_code == 404


async def test_patch_item_on_entry_based_list(client, db_engine):
    """Item PATCH resolves entry-based lists by list ID too."""
    user_id, token = await _auth_token(client)
    list_id, _ = await _create_entry_based_list(client, db_engine, token, user_id)

    get_r = await client.get(f"/api/v1/shopping-lists/{list_id}", headers=_auth(token))
    item_id = get_r.json()["items"][0]["id"]

    patch_r = await client.patch(
        f"/api/v1/shopping-lists/{list_id}/items/{item_id}",
        json={"checked": True},
        headers=_auth(token),
    )
    assert patch_r.status_code == 200, patch_r.json()
    assert patch_r.json()["checked"] is True


async def test_create_item_on_entry_based_list(client, db_engine):
    """Ad-hoc item POST resolves entry-based lists by list ID too."""
    user_id, token = await _auth_token(client)
    list_id, _ = await _create_entry_based_list(client, db_engine, token, user_id)

    create_r = await client.post(
        f"/api/v1/shopping-lists/{list_id}/items",
        json={"ingredient_name": "napkins", "quantity": 1, "unit": ""},
        headers=_auth(token),
    )
    assert create_r.status_code == 201, create_r.json()

    get_r = await client.get(f"/api/v1/shopping-lists/{list_id}", headers=_auth(token))
    names = [i["ingredient_name"] for i in get_r.json()["items"]]
    assert "napkins" in names


# ── DELETE /api/v1/shopping-lists/{id} ────────────────────────────────────────

async def test_delete_shopping_list_requires_auth(client):
    r = await client.delete(f"/api/v1/shopping-lists/{uuid.uuid4()}")
    assert r.status_code == 401


async def test_delete_shopping_list_404_for_unknown_list(client):
    _, token = await _auth_token(client)
    r = await client.delete(f"/api/v1/shopping-lists/{uuid.uuid4()}", headers=_auth(token))
    assert r.status_code == 404


async def test_delete_shopping_list_removes_list_and_items(client):
    """Deleting a list removes it (404 afterward) and its items."""
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
    list_id = regen.json()["id"]
    assert len(regen.json()["items"]) == 1

    delete_r = await client.delete(f"/api/v1/shopping-lists/{list_id}", headers=_auth(token))
    assert delete_r.status_code == 204

    # The list is gone — subsequent GET-by-meal-plan-id now creates a fresh empty
    # shell (get_or_create_shopping_list semantics), so assert via the list index
    # instead, which reflects actual row deletion.
    index_r = await client.get("/api/v1/shopping-lists", headers=_auth(token))
    assert index_r.status_code == 200
    assert list_id not in [item["id"] for item in index_r.json()]


async def test_delete_shopping_list_404_for_other_user(client):
    """A second user cannot delete another user's shopping list — 404, not 403."""
    _, token_a = await _auth_token(client)
    _, token_b = await _auth_token(client)

    recipe_id = await _create_recipe(client, token_a)
    plan_id = await _create_plan_with_entry(client, token_a, recipe_id)

    get_r = await client.get(f"/api/v1/shopping-lists/{plan_id}", headers=_auth(token_a))
    assert get_r.status_code == 200
    list_id = get_r.json()["id"]

    delete_r = await client.delete(f"/api/v1/shopping-lists/{list_id}", headers=_auth(token_b))
    assert delete_r.status_code == 404

    # Confirm it still exists for the owner
    still_there = await client.get("/api/v1/shopping-lists", headers=_auth(token_a))
    assert list_id in [item["id"] for item in still_there.json()]


# ── POST /api/v1/shopping-lists/{meal_plan_id}/items ──────────────────────────

async def test_create_item_requires_auth(client):
    r = await client.post(
        f"/api/v1/shopping-lists/{uuid.uuid4()}/items",
        json={"ingredient_name": "napkins", "quantity": 1, "unit": ""},
    )
    assert r.status_code == 401


async def test_create_item_404_for_unknown_plan(client):
    _, token = await _auth_token(client)
    r = await client.post(
        f"/api/v1/shopping-lists/{uuid.uuid4()}/items",
        json={"ingredient_name": "napkins", "quantity": 1, "unit": ""},
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_create_item_404_for_other_users_plan(client):
    """A second user cannot add an ad-hoc item to someone else's shopping list."""
    _, token_a = await _auth_token(client)
    _, token_b = await _auth_token(client)

    recipe_id = await _create_recipe(client, token_a)
    plan_id = await _create_plan_with_entry(client, token_a, recipe_id)

    # Ensure the list shell exists for user A first.
    get_r = await client.get(f"/api/v1/shopping-lists/{plan_id}", headers=_auth(token_a))
    assert get_r.status_code == 200

    r = await client.post(
        f"/api/v1/shopping-lists/{plan_id}/items",
        json={"ingredient_name": "napkins", "quantity": 1, "unit": ""},
        headers=_auth(token_b),
    )
    assert r.status_code == 404


async def test_create_item_appears_in_subsequent_get(client):
    """An ad-hoc item created via POST shows up in a later GET of the list."""
    _, token = await _auth_token(client)
    recipe_id = await _create_recipe(client, token)
    plan_id = await _create_plan_with_entry(client, token, recipe_id)

    create_r = await client.post(
        f"/api/v1/shopping-lists/{plan_id}/items",
        json={"ingredient_name": "napkins", "quantity": 2, "unit": "packs"},
        headers=_auth(token),
    )
    assert create_r.status_code == 201, create_r.json()
    created = create_r.json()
    assert created["ingredient_name"] == "napkins"
    assert created["total_quantity"] == 2
    assert created["unit"] == "packs"
    assert created["checked"] is False
    assert created["recipe_ids"] == []

    get_r = await client.get(f"/api/v1/shopping-lists/{plan_id}", headers=_auth(token))
    assert get_r.status_code == 200
    item_ids = [i["id"] for i in get_r.json()["items"]]
    assert created["id"] in item_ids


async def test_create_item_defaults_category(client):
    """category is optional on the request; a fallback value is applied."""
    _, token = await _auth_token(client)
    recipe_id = await _create_recipe(client, token)
    plan_id = await _create_plan_with_entry(client, token, recipe_id)

    create_r = await client.post(
        f"/api/v1/shopping-lists/{plan_id}/items",
        json={"ingredient_name": "napkins", "quantity": 1, "unit": ""},
        headers=_auth(token),
    )
    assert create_r.status_code == 201, create_r.json()
    assert create_r.json()["category"]


# ── PATCH /items/{item_id} — quantity/unit partial update ────────────────────

async def test_patch_item_updates_quantity_and_unit_when_provided(client):
    _, token = await _auth_token(client)
    recipe_id = await _create_recipe(client, token)
    plan_id = await _create_plan_with_entry(client, token, recipe_id)

    create_r = await client.post(
        f"/api/v1/shopping-lists/{plan_id}/items",
        json={"ingredient_name": "napkins", "quantity": 1, "unit": "pack"},
        headers=_auth(token),
    )
    assert create_r.status_code == 201, create_r.json()
    item_id = create_r.json()["id"]

    patch_r = await client.patch(
        f"/api/v1/shopping-lists/{plan_id}/items/{item_id}",
        json={"quantity": 5, "unit": "packs"},
        headers=_auth(token),
    )
    assert patch_r.status_code == 200, patch_r.json()
    data = patch_r.json()
    assert data["total_quantity"] == 5
    assert data["unit"] == "packs"
    # checked was not provided — must remain unchanged.
    assert data["checked"] is False


async def test_patch_item_partial_update_leaves_other_fields_unchanged(client):
    """Providing only `checked` must not clobber quantity/unit, and vice versa."""
    _, token = await _auth_token(client)
    recipe_id = await _create_recipe(client, token)
    plan_id = await _create_plan_with_entry(client, token, recipe_id)

    create_r = await client.post(
        f"/api/v1/shopping-lists/{plan_id}/items",
        json={"ingredient_name": "napkins", "quantity": 1, "unit": "pack"},
        headers=_auth(token),
    )
    item_id = create_r.json()["id"]

    # Update only checked.
    checked_r = await client.patch(
        f"/api/v1/shopping-lists/{plan_id}/items/{item_id}",
        json={"checked": True},
        headers=_auth(token),
    )
    assert checked_r.status_code == 200
    data = checked_r.json()
    assert data["checked"] is True
    assert data["total_quantity"] == 1
    assert data["unit"] == "pack"

    # Update only quantity — checked must remain True.
    qty_r = await client.patch(
        f"/api/v1/shopping-lists/{plan_id}/items/{item_id}",
        json={"quantity": 3},
        headers=_auth(token),
    )
    assert qty_r.status_code == 200
    data2 = qty_r.json()
    assert data2["total_quantity"] == 3
    assert data2["unit"] == "pack"
    assert data2["checked"] is True
