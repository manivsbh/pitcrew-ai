"""Application configuration. Secrets come from the environment only."""

import os

MODEL_ID = "muse-spark-1.3"
API_BASE_URL = "https://api.meta.ai/v1"

# Bounded investigation loop (application-enforced).
MAX_TOOL_CALLS = 8
INVESTIGATION_TIMEOUT_S = 120

# Local serving.
HOST = "127.0.0.1"
PORT = 8000
ALLOWED_ORIGINS = ["http://127.0.0.1:8000", "http://localhost:8000"]


def model_api_key() -> str:
    key = os.environ.get("MODEL_API_KEY", "")
    if not key:
        raise RuntimeError("MODEL_API_KEY is not set in the environment")
    return key
