"""Application configuration. Secrets come from the environment only."""

import os

MODEL_ID = "muse-spark-1.3"
API_BASE_URL = "https://api.meta.ai/v1"

# Bounded investigation loop (application-enforced).
# Timeout calibrated from live runs: ~20-40 s per serial tool turn.
MAX_TOOL_CALLS = 8
INVESTIGATION_TIMEOUT_S = 300
# Low reasoning effort: this loop needs tool orchestration, not deep reasoning.
REASONING_EFFORT = "low"

# Reference stats built from K001 development repetitions.
REFS_PATH = "backend/app/refs.json"

# Local serving.
HOST = "127.0.0.1"
PORT = 8000
ALLOWED_ORIGINS = ["http://127.0.0.1:8000", "http://localhost:8000"]


def model_api_key() -> str:
    key = os.environ.get("MODEL_API_KEY", "")
    if not key:
        raise RuntimeError("MODEL_API_KEY is not set in the environment")
    return key
