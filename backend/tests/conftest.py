import os
import tempfile
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_tmp}/test.db"
os.environ["LOCAL_UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["AZURE_STORAGE_ACCOUNT"] = ""
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-bytes-long"

from app.db import init_models  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
async def _db():
    await init_models()


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def auth(client):
    """Fresh user -> Authorization header."""
    r = await client.post("/api/auth/register", json={"email": f"{uuid.uuid4()}@x.io", "password": "password123"})
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def change(id_: str, ts: int, **fields):
    return {"id": id_, "fields": fields, "field_ts": {k: ts for k in fields}}
