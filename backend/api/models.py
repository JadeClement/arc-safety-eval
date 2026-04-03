import httpx
from fastapi import APIRouter
from backend.config import (
    AVAILABLE_MODELS,
    VALUE_TAXONOMY,
    JUDGE_MODEL_ID,
    GRAPH_COMPARE_JUDGE_MODEL_ID,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
)

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
def list_models():
    return AVAILABLE_MODELS


@router.get("/values")
def list_values():
    """Returns the fixed value taxonomy used by the causal argument graph judge."""
    return {
        "judge_model_id": JUDGE_MODEL_ID,
        "graph_compare_judge_model_id": GRAPH_COMPARE_JUDGE_MODEL_ID,
        "taxonomy": VALUE_TAXONOMY,
    }


@router.get("/openrouter-route-check")
def openrouter_route_check():
    """
    Lists models your OPENROUTER_API_KEY can call after privacy + guardrails
    (same rules as chat/completions). Use when the website eligibility preview disagrees with Step 4.
    """
    base = OPENROUTER_BASE_URL.rstrip("/")
    if not (OPENROUTER_API_KEY or "").strip():
        return {
            "error": "OPENROUTER_API_KEY is empty",
            "openrouter_base_url": base,
        }
    try:
        r = httpx.get(
            f"{base}/models/user",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            timeout=30.0,
        )
    except Exception as e:
        return {"error": str(e), "openrouter_base_url": base}
    body: dict = {}
    try:
        body = r.json()
    except Exception:
        pass
    rows = body.get("data") or []
    ids = [m.get("id") for m in rows if isinstance(m, dict) and m.get("id")]
    target = "openai/gpt-oss-120b"
    ok = target in ids
    return {
        "openrouter_base_url": base,
        "models_user_http_status": r.status_code,
        "eligible_model_count": len(ids),
        "gpt_oss_120b_eligible": ok,
        "hint": None
        if ok
        else (
            "openai/gpt-oss-120b not in this key’s /models/user list — check OpenRouter keys, "
            "Guardrails, privacy settings, and OPENROUTER_BASE_URL (avoid EU host unless intended)."
        ),
    }
