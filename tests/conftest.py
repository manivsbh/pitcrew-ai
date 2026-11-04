import pytest


@pytest.fixture(autouse=True)
def _no_live_model_key(monkeypatch):
    """Tests never reach api.meta.ai, even when a local .env holds a key."""
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
