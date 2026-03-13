import pytest


@pytest.mark.asyncio(loop_scope="session")
async def test_health_returns_ok_when_db_connected(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["db"] == "connected"
