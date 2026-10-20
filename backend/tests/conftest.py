import tempfile
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


_TMP = tempfile.TemporaryDirectory(prefix="mediscribe-test-accounts-")  # removed at exit


def make_settings(**kw) -> Settings:
    base = dict(
        token_secret="test-secret",
        rate_limit_per_minute=1000,
        dev_auth_enabled=True,  # tests use the demo sign-in unless they test real accounts
        accounts_file=Path(_TMP.name) / f"{uuid.uuid4().hex}.json",
    )
    base.update(kw)
    return Settings(_env_file=None, **base)


@pytest.fixture()
def settings():
    return make_settings()


@pytest.fixture()
def app(settings):
    return create_app(settings)


@pytest.fixture()
def client(app):
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def auth(client):
    token = client.post("/auth/dev-login", json={"name": "Dr. Test"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}
