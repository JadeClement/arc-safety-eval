"""On-demand human vs model causal graph comparison (Step 6); not part of /api/evaluate."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.arc.pipeline import run_graph_consistency_async

router = APIRouter(prefix="/api/graph-consistency", tags=["graph-consistency"])


class CompareGraphsBody(BaseModel):
    reference_graph: dict[str, Any] = Field(..., description="Human baseline graph (values, concerns, warrants)")
    candidate_graph: dict[str, Any] = Field(..., description="Model graph (values, concerns, warrants)")


@router.post("/compare")
async def compare_graphs(body: CompareGraphsBody):
    """Run the compare judge only when called (e.g. Step 6). Returns score 0–1 or error."""
    return await run_graph_consistency_async(body.reference_graph, body.candidate_graph)
