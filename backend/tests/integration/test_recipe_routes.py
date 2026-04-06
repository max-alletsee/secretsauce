# backend/tests/integration/test_recipe_routes.py
import uuid

import pytest

from tests.conftest import unique_email


# ── Auth helper ───────────────────────────────────────────────────────────────

async def _auth_token(client, password: str = "SecurePass123!") -> str:
    """Register a new unique user and return their access token."""
    email = unique_email("recipe")
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201, reg.json()
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.json()
    return login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Create ────────────────────────────────────────────────────────────────────

async def test_create_recipe_requires_auth(client):
    r = await client.post("/api/v1/recipes", json={"title": "Test"})
    assert r.status_code == 401


async def test_create_recipe_minimal(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/recipes", json={"title": "Pasta"}, headers=_auth(token))
    assert r.status_code == 201
    data = r.json()
    assert data["current_version"]["title"] == "Pasta"
    assert data["current_version"]["version_number"] == 1
    assert data["visibility"] == "private"
    assert "id" in data


async def test_create_recipe_full(client):
    token = await _auth_token(client)
    payload = {
        "title": "Carbonara",
        "description": "Classic Roman pasta",
        "ingredients": [
            {"name": "spaghetti", "quantity": "200", "unit": "g"},
            {"name": "guanciale", "quantity": "100", "unit": "g"},
        ],
        "steps": [
            {"order": 1, "instruction": "Cook pasta"},
            {"order": 2, "instruction": "Fry guanciale"},
        ],
        "servings": 2,
        "prep_time_minutes": 10,
        "cook_time_minutes": 20,
        "tags": ["italian", "dinner"],
        "visibility": "shared",
    }
    r = await client.post("/api/v1/recipes", json=payload, headers=_auth(token))
    assert r.status_code == 201
    data = r.json()
    assert len(data["current_version"]["ingredients"]) == 2
    assert len(data["current_version"]["steps"]) == 2
    assert data["visibility"] == "shared"
    assert data["current_version"]["tags"] == ["italian", "dinner"]


async def test_create_recipe_missing_title_returns_422(client):
    token = await _auth_token(client)
    r = await client.post("/api/v1/recipes", json={"description": "no title"}, headers=_auth(token))
    assert r.status_code == 422


# ── Read ──────────────────────────────────────────────────────────────────────

async def test_get_recipe(client):
    token = await _auth_token(client)
    create = await client.post("/api/v1/recipes", json={"title": "Fetch Me"}, headers=_auth(token))
    recipe_id = create.json()["id"]
    r = await client.get(f"/api/v1/recipes/{recipe_id}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["id"] == recipe_id


async def test_get_recipe_requires_auth(client):
    r = await client.get(f"/api/v1/recipes/{uuid.uuid4()}")
    assert r.status_code == 401


async def test_get_recipe_not_found(client):
    token = await _auth_token(client)
    r = await client.get(f"/api/v1/recipes/{uuid.uuid4()}", headers=_auth(token))
    assert r.status_code == 404


async def test_get_private_recipe_as_other_user_returns_404(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Private", "visibility": "private"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.get(f"/api/v1/recipes/{recipe_id}", headers=_auth(other_token))
    assert r.status_code == 404


async def test_get_shared_recipe_as_other_user_returns_200(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Shared", "visibility": "shared"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.get(f"/api/v1/recipes/{recipe_id}", headers=_auth(other_token))
    assert r.status_code == 200


# ── List ──────────────────────────────────────────────────────────────────────

async def test_list_recipes_requires_auth(client):
    r = await client.get("/api/v1/recipes")
    assert r.status_code == 401


async def test_list_only_returns_own_and_shared(client):
    token1 = await _auth_token(client)
    token2 = await _auth_token(client)
    private = await client.post("/api/v1/recipes", json={"title": "Owner1 Private"}, headers=_auth(token1))
    shared = await client.post(
        "/api/v1/recipes",
        json={"title": "Owner1 Shared", "visibility": "shared"},
        headers=_auth(token1),
    )
    private_id = private.json()["id"]
    shared_id = shared.json()["id"]

    # Use large limit to avoid pagination hiding results in a test DB with accumulated data
    r = await client.get("/api/v1/recipes?limit=100", headers=_auth(token2))
    assert r.status_code == 200
    ids = {item["id"] for item in r.json()["items"]}
    assert private_id not in ids   # private recipe from token1 is invisible to token2
    assert shared_id in ids        # shared recipe from token1 is visible to token2


async def test_list_response_has_pagination_fields(client):
    token = await _auth_token(client)
    r = await client.get("/api/v1/recipes", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "next_cursor" in data
    assert "has_more" in data


async def test_list_pagination_cursor(client):
    token = await _auth_token(client)
    # Create 3 recipes and fetch with limit=2
    for i in range(3):
        await client.post("/api/v1/recipes", json={"title": f"Page Recipe {i}"}, headers=_auth(token))
    page1 = await client.get("/api/v1/recipes?limit=2", headers=_auth(token))
    assert page1.status_code == 200
    page1_data = page1.json()
    assert len(page1_data["items"]) == 2
    assert page1_data["has_more"] is True
    assert page1_data["next_cursor"] is not None

    page2 = await client.get(
        f"/api/v1/recipes?limit=2&cursor={page1_data['next_cursor']}",
        headers=_auth(token),
    )
    assert page2.status_code == 200
    page2_data = page2.json()
    assert len(page2_data["items"]) >= 1
    # No overlap between pages
    page1_ids = {item["id"] for item in page1_data["items"]}
    page2_ids = {item["id"] for item in page2_data["items"]}
    assert page1_ids.isdisjoint(page2_ids)


# ── Update (PATCH) ────────────────────────────────────────────────────────────

async def test_update_creates_new_version(client):
    token = await _auth_token(client)
    create = await client.post("/api/v1/recipes", json={"title": "Original"}, headers=_auth(token))
    recipe_id = create.json()["id"]
    r = await client.patch(
        f"/api/v1/recipes/{recipe_id}",
        json={"title": "Updated"},
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["current_version"]["title"] == "Updated"
    assert data["current_version"]["version_number"] == 2


async def test_update_preserves_unchanged_fields(client):
    token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Original", "servings": 4, "tags": ["italian"]},
        headers=_auth(token),
    )
    recipe_id = create.json()["id"]
    r = await client.patch(
        f"/api/v1/recipes/{recipe_id}",
        json={"title": "New Title"},  # only change title
        headers=_auth(token),
    )
    data = r.json()
    assert data["current_version"]["servings"] == 4
    assert data["current_version"]["tags"] == ["italian"]


async def test_update_by_non_owner_returns_403(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Mine", "visibility": "shared"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.patch(
        f"/api/v1/recipes/{recipe_id}",
        json={"title": "Hijacked"},
        headers=_auth(other_token),
    )
    assert r.status_code == 403


# ── Delete ────────────────────────────────────────────────────────────────────

async def test_delete_recipe(client):
    token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes", json={"title": "Delete Me"}, headers=_auth(token)
    )
    recipe_id = create.json()["id"]
    r = await client.delete(f"/api/v1/recipes/{recipe_id}", headers=_auth(token))
    assert r.status_code == 204
    get = await client.get(f"/api/v1/recipes/{recipe_id}", headers=_auth(token))
    assert get.status_code == 404


async def test_delete_by_non_owner_returns_403(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Not Yours", "visibility": "shared"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.delete(f"/api/v1/recipes/{recipe_id}", headers=_auth(other_token))
    assert r.status_code == 403


async def test_delete_nonexistent_recipe_returns_404(client):
    token = await _auth_token(client)
    r = await client.delete(f"/api/v1/recipes/{uuid.uuid4()}", headers=_auth(token))
    assert r.status_code == 404


# ── Version history ───────────────────────────────────────────────────────────

async def test_get_versions_shows_all_versions(client):
    token = await _auth_token(client)
    create = await client.post("/api/v1/recipes", json={"title": "V1"}, headers=_auth(token))
    recipe_id = create.json()["id"]
    await client.patch(f"/api/v1/recipes/{recipe_id}", json={"title": "V2"}, headers=_auth(token))
    await client.patch(f"/api/v1/recipes/{recipe_id}", json={"title": "V3"}, headers=_auth(token))

    r = await client.get(f"/api/v1/recipes/{recipe_id}/versions", headers=_auth(token))
    assert r.status_code == 200
    versions = r.json()
    assert len(versions) == 3
    numbers = [v["version_number"] for v in versions]
    assert numbers == sorted(numbers, reverse=True)  # newest first


async def test_get_versions_of_private_recipe_as_other_user_returns_404(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Private", "visibility": "private"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    r = await client.get(f"/api/v1/recipes/{recipe_id}/versions", headers=_auth(other_token))
    assert r.status_code == 404


# ── Restore ───────────────────────────────────────────────────────────────────

async def test_restore_version_creates_new_version_with_old_content(client):
    token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes", json={"title": "Original"}, headers=_auth(token)
    )
    recipe_id = create.json()["id"]

    # Get version 1 id
    versions_resp = await client.get(
        f"/api/v1/recipes/{recipe_id}/versions", headers=_auth(token)
    )
    v1_id = next(v["id"] for v in versions_resp.json() if v["version_number"] == 1)

    # Edit to version 2
    await client.patch(
        f"/api/v1/recipes/{recipe_id}", json={"title": "Edited"}, headers=_auth(token)
    )

    # Restore v1
    r = await client.post(
        f"/api/v1/recipes/{recipe_id}/versions/{v1_id}/restore",
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["current_version"]["title"] == "Original"
    assert data["current_version"]["version_number"] == 3  # new version, not mutation


async def test_restore_nonexistent_version_returns_404(client):
    token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes", json={"title": "Recipe"}, headers=_auth(token)
    )
    recipe_id = create.json()["id"]
    r = await client.post(
        f"/api/v1/recipes/{recipe_id}/versions/{uuid.uuid4()}/restore",
        headers=_auth(token),
    )
    assert r.status_code == 404


async def test_restore_by_non_owner_returns_403(client):
    owner_token = await _auth_token(client)
    other_token = await _auth_token(client)
    create = await client.post(
        "/api/v1/recipes",
        json={"title": "Mine", "visibility": "shared"},
        headers=_auth(owner_token),
    )
    recipe_id = create.json()["id"]
    versions_resp = await client.get(
        f"/api/v1/recipes/{recipe_id}/versions", headers=_auth(owner_token)
    )
    v1_id = versions_resp.json()[0]["id"]
    r = await client.post(
        f"/api/v1/recipes/{recipe_id}/versions/{v1_id}/restore",
        headers=_auth(other_token),
    )
    assert r.status_code == 403


# ── Tag filter ────────────────────────────────────────────────────────────────

async def _create_recipe(client, token: str, title: str = "Test Recipe", **fields) -> dict:
    payload = {
        "title": title,
        "ingredients": [{"name": "ingredient", "quantity": "1", "unit": "cup"}],
        "steps": [{"order": 1, "instruction": "Do something"}],
        **fields,
    }
    r = await client.post("/api/v1/recipes", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.json()
    return r.json()


async def test_tag_filter_or_returns_recipes_with_any_matching_tag(client):
    token = await _auth_token(client)
    await _create_recipe(client, token, title="Italian Dinner", tags=["italian", "dinner"])
    await _create_recipe(client, token, title="Mexican Lunch", tags=["mexican", "lunch"])
    await _create_recipe(client, token, title="French Breakfast", tags=["french", "breakfast"])

    r = await client.get("/api/v1/recipes?tags=italian&tags=mexican", headers=_auth(token))
    assert r.status_code == 200
    titles = [item["current_version"]["title"] for item in r.json()["items"]]
    assert "Italian Dinner" in titles
    assert "Mexican Lunch" in titles
    assert "French Breakfast" not in titles


async def test_tag_filter_empty_returns_all_recipes(client):
    token = await _auth_token(client)
    await _create_recipe(client, token, title="Untagged Recipe", tags=[])

    r = await client.get("/api/v1/recipes", headers=_auth(token))
    assert r.status_code == 200
    # Returns all user's recipes — at minimum the one just created
    assert r.json()["items"]


# ── Full-text search ──────────────────────────────────────────────────────────

async def test_search_q_returns_matching_recipes(client):
    token = await _auth_token(client)
    await _create_recipe(
        client, token, title="Chicken Parmesan",
        ingredients=[{"name": "chicken breast", "quantity": "2", "unit": "pieces"}],
    )
    await _create_recipe(
        client, token, title="Beef Stew",
        ingredients=[{"name": "beef chuck", "quantity": "500", "unit": "g"}],
    )

    r = await client.get("/api/v1/recipes?q=chicken", headers=_auth(token))
    assert r.status_code == 200
    titles = [item["current_version"]["title"] for item in r.json()["items"]]
    assert "Chicken Parmesan" in titles
    assert "Beef Stew" not in titles


async def test_search_q_matches_ingredient_names(client):
    token = await _auth_token(client)
    await _create_recipe(
        client, token, title="Mystery Dish",
        ingredients=[{"name": "saffron", "quantity": "1", "unit": "pinch"}],
    )
    await _create_recipe(client, token, title="Plain Pasta")

    r = await client.get("/api/v1/recipes?q=saffron", headers=_auth(token))
    assert r.status_code == 200
    titles = [item["current_version"]["title"] for item in r.json()["items"]]
    assert "Mystery Dish" in titles
    assert "Plain Pasta" not in titles


async def test_search_empty_q_returns_all(client):
    token = await _auth_token(client)
    await _create_recipe(client, token, title="Any Recipe")

    r = await client.get("/api/v1/recipes?q=", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["items"]


# ── Sort modes ────────────────────────────────────────────────────────────────

async def test_sort_title_asc_returns_alphabetical_order(client):
    token = await _auth_token(client)
    await _create_recipe(client, token, title="Zucchini Soup")
    await _create_recipe(client, token, title="Apple Pie")
    await _create_recipe(client, token, title="Mango Salad")

    r = await client.get("/api/v1/recipes?sort_by=title_asc", headers=_auth(token))
    assert r.status_code == 200
    titles = [item["current_version"]["title"] for item in r.json()["items"]]
    apple_idx = titles.index("Apple Pie")
    mango_idx = titles.index("Mango Salad")
    zucchini_idx = titles.index("Zucchini Soup")
    assert apple_idx < mango_idx < zucchini_idx


async def test_sort_total_time_asc_orders_by_sum(client):
    token = await _auth_token(client)
    await _create_recipe(client, token, title="Slow Cook", prep_time_minutes=10, cook_time_minutes=120)
    await _create_recipe(client, token, title="Quick Fix", prep_time_minutes=5, cook_time_minutes=10)

    r = await client.get("/api/v1/recipes?sort_by=total_time_asc", headers=_auth(token))
    assert r.status_code == 200
    titles = [item["current_version"]["title"] for item in r.json()["items"]]
    assert titles.index("Quick Fix") < titles.index("Slow Cook")


async def test_sort_popularity_falls_back_to_newest_first(client):
    token = await _auth_token(client)
    await _create_recipe(client, token, title="First Recipe")
    await _create_recipe(client, token, title="Second Recipe")

    r = await client.get("/api/v1/recipes?sort_by=popularity", headers=_auth(token))
    assert r.status_code == 200
    # popularity falls back to created_at_desc — second recipe first
    titles = [item["current_version"]["title"] for item in r.json()["items"]]
    assert titles.index("Second Recipe") < titles.index("First Recipe")


async def test_cursor_mismatch_returns_400(client):
    token = await _auth_token(client)
    # Get a cursor with default sort
    r = await client.get("/api/v1/recipes?limit=1", headers=_auth(token))
    cursor = r.json().get("next_cursor")
    if cursor is None:
        pytest.skip("not enough recipes to get a cursor")

    # Use that cursor with a different sort
    r2 = await client.get(
        f"/api/v1/recipes?cursor={cursor}&sort_by=title_asc", headers=_auth(token)
    )
    assert r2.status_code == 400


# ── Route validation ──────────────────────────────────────────────────────────

async def test_invalid_sort_by_returns_400(client):
    token = await _auth_token(client)
    r = await client.get("/api/v1/recipes?sort_by=invalid_value", headers=_auth(token))
    assert r.status_code == 400
    assert r.json()["error_code"] == "INVALID_SORT_BY"


async def test_unknown_tags_silently_dropped(client):
    token = await _auth_token(client)
    r = await client.get("/api/v1/recipes?tags=not-a-real-tag", headers=_auth(token))
    assert r.status_code == 200  # no error, tag just filtered out


async def test_response_includes_popularity_sort_available(client):
    token = await _auth_token(client)
    r = await client.get("/api/v1/recipes", headers=_auth(token))
    assert r.status_code == 200
    assert "popularity_sort_available" in r.json()
    assert r.json()["popularity_sort_available"] is False


async def test_q_and_tags_work_together(client):
    token = await _auth_token(client)
    await _create_recipe(
        client, token, title="Italian Chicken", tags=["italian"],
        ingredients=[{"name": "chicken", "quantity": "1", "unit": "kg"}],
    )
    await _create_recipe(
        client, token, title="Italian Pasta", tags=["italian"],
        ingredients=[{"name": "pasta", "quantity": "200", "unit": "g"}],
    )

    r = await client.get("/api/v1/recipes?q=chicken&tags=italian", headers=_auth(token))
    assert r.status_code == 200
    titles = [item["current_version"]["title"] for item in r.json()["items"]]
    assert "Italian Chicken" in titles
    assert "Italian Pasta" not in titles
