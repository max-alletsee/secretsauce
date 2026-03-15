# backend/tests/integration/test_auth_routes.py
from tests.conftest import unique_email


async def test_register_new_user(client):
    email = unique_email("register")
    response = await client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == email
    assert "id" in data
    assert "hashed_password" not in data  # never expose password hash


async def test_register_duplicate_email_fails(client):
    email = unique_email("dup")
    payload = {"email": email, "password": "SecurePass123!"}
    await client.post("/api/v1/auth/register", json=payload)
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 400


async def test_login_returns_tokens(client):
    email = unique_email("login")
    await client.post("/api/v1/auth/register", json={"email": email, "password": "SecurePass123!"})
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "SecurePass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_bad_password_fails(client):
    email = unique_email("badpw")
    await client.post("/api/v1/auth/register", json={"email": email, "password": "SecurePass123!"})
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "wrongpassword"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 400


async def test_get_me_requires_auth(client):
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401


async def test_get_me_returns_profile(client):
    email = unique_email("me")
    await client.post("/api/v1/auth/register", json={"email": email, "password": "SecurePass123!"})
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "SecurePass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = login.json()["access_token"]
    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == email
    assert data["preferred_units"] == "metric"
    assert data["default_servings"] == 2


async def test_patch_me_updates_profile(client):
    email = unique_email("patch")
    await client.post("/api/v1/auth/register", json={"email": email, "password": "SecurePass123!"})
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "SecurePass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = login.json()["access_token"]
    response = await client.patch(
        "/api/v1/users/me",
        json={"display_name": "Alice", "preferred_units": "imperial"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["display_name"] == "Alice"
    assert data["preferred_units"] == "imperial"


async def test_refresh_token_issues_new_access_token(client):
    email = unique_email("refresh")
    await client.post("/api/v1/auth/register", json={"email": email, "password": "SecurePass123!"})
    login = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "SecurePass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    refresh_token = login.json()["refresh_token"]
    response = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data  # rotated


async def test_refresh_with_invalid_token_fails(client):
    response = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": "not-a-valid-token"},
    )
    assert response.status_code == 401


async def test_google_oauth_routes_absent_without_credentials(client):
    """Without GOOGLE_CLIENT_ID set, Google OAuth routes must not be registered."""
    response = await client.get("/api/v1/auth/google/authorize")
    assert response.status_code == 404
