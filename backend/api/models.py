from fastapi import APIRouter
from backend.config import AVAILABLE_MODELS, VALUE_TAXONOMY, JUDGE_MODEL_ID

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
def list_models():
    return AVAILABLE_MODELS


@router.get("/values")
def list_values():
    """Returns the fixed value taxonomy used by the causal argument graph judge."""
    return {
        "judge_model_id": JUDGE_MODEL_ID,
        "taxonomy": VALUE_TAXONOMY,
    }
