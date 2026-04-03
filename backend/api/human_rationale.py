from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from backend.arc.human_rationale_store import lookup_repo_rationale

router = APIRouter(prefix="/api/human-rationale", tags=["human-rationale"])


class SuggestBody(BaseModel):
    text: str = Field(..., min_length=1, description="Same string that will be evaluated")


class MatchTextsBody(BaseModel):
    texts: list[str] = Field(
        ...,
        max_length=200,
        description="Sample texts to check against human_rationales.json (same matching as /suggest)",
    )


def _suggest_payload(text: str) -> dict:
    cleaned = text.strip()
    rationale = lookup_repo_rationale(cleaned) if cleaned else None
    return {"matched": rationale is not None, "rationale": rationale}


@router.post("/suggest")
def suggest_human_rationale_post(body: SuggestBody):
    """Prefer POST so quotes/Unicode survive intact (no query-string ambiguity)."""
    return _suggest_payload(body.text)


@router.get("/suggest")
def suggest_human_rationale(text: str = Query(..., min_length=1, description="Same string that will be evaluated")):
    """Return bundled rationale when it matches human_rationales.json (after normalization)."""
    return _suggest_payload(text)


@router.post("/match-texts")
def match_human_rationale_texts(body: MatchTextsBody):
    """Return per-text booleans: True when human_rationales.json has a rationale for that string."""
    matches = [lookup_repo_rationale(t) is not None for t in body.texts]
    return {"matches": matches}
