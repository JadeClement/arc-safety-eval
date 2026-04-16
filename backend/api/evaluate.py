import asyncio
import json
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

from backend.arc.pipeline import (
    run_arc_pipeline_async,
    run_causal_graph_async,
    resolve_human_baseline_text,
    human_narrative_to_reasons,
)
from backend.config import ALLOWED_EVAL_MODEL_IDS, ARC_EVAL_SEQUENTIAL, JUDGE_MODEL_ID

# Seconds to wait between sequential model calls to avoid rate-limiting.
# Override with INTER_MODEL_DELAY env var.
INTER_MODEL_DELAY = float(os.getenv("INTER_MODEL_DELAY", "15"))

router = APIRouter(prefix="/api/evaluate", tags=["evaluate"])

STREAM_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


class EvaluateRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    text: str
    model_ids: List[str]
    human_reasoning: Optional[str] = None


def _validate_evaluate_request(request: EvaluateRequest) -> str:
    if len(request.model_ids) > 3:
        raise HTTPException(status_code=400, detail="You can compare up to 3 models at a time.")
    if len(request.model_ids) < 1:
        raise HTTPException(status_code=400, detail="Select at least 1 model.")
    bad = [mid for mid in request.model_ids if mid not in ALLOWED_EVAL_MODEL_IDS]
    if bad:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown or disallowed model_id(s): {', '.join(bad)}",
        )
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")
    return text


async def _human_reasoning_baseline(text: str, human_reasoning: Optional[str] = None) -> dict:
    narrative, source = resolve_human_baseline_text(text, human_reasoning)
    reason_items = human_narrative_to_reasons(narrative)
    graph = await run_causal_graph_async(reason_items, stance="UNSAFE")
    return {"text": narrative, "source": source, "causal_graph": graph}


@router.post("")
async def evaluate(request: EvaluateRequest):
    text = _validate_evaluate_request(request)

    human_baseline = await _human_reasoning_baseline(text, request.human_reasoning)

    async def run_single(model_id: str):
        result = await run_arc_pipeline_async(text, model_id)
        stabilized_reasons = [r["text"] for r in result.get("justification", [])]
        result["causal_graph"] = await run_causal_graph_async(
            stabilized_reasons,
            stance=result.get("stance") or "SAFE",
        )
        return result


    if ARC_EVAL_SEQUENTIAL:
        results = []
        for i, mid in enumerate(request.model_ids):
            try:
                results.append(await run_single(mid))
            except Exception as e:
                results.append(e)
            # Pause between models so we don't immediately hammer the rate limit
            if i < len(request.model_ids) - 1:
                await asyncio.sleep(INTER_MODEL_DELAY)
    else:
        tasks = [run_single(mid) for mid in request.model_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    final_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            final_results.append({
                "model_id": request.model_ids[i],
                "stance": "SAFE",
                "justification": [],
                "self_consistency": None,
                "error": f"Evaluation failed: {str(result)}",
            })
        else:
            final_results.append(result)

    return {
        "input_text": text,
        "judge_model_id": JUDGE_MODEL_ID,
        "human_reasoning_baseline": human_baseline,
        "results": final_results,
    }


@router.post("/stream")
async def evaluate_stream(request: EvaluateRequest):
    """Stream each model's result over SSE as soon as it finishes (JSON lines in `data:` fields)."""
    text = _validate_evaluate_request(request)

    async def event_generator():
        human_baseline = await _human_reasoning_baseline(text, request.human_reasoning)
        hb_payload = json.dumps(
            {"type": "human_baseline", "human_reasoning_baseline": human_baseline},
            default=str,
        )
        yield f"data: {hb_payload}\n\n"

        async def run_one(model_id: str):
            try:
                r = await run_arc_pipeline_async(text, model_id)
                stabilized_reasons = [item["text"] for item in r.get("justification", [])]
                r["causal_graph"] = await run_causal_graph_async(
                    stabilized_reasons,
                    stance=r.get("stance") or "SAFE",
                )
                return r
            except Exception as e:
                return {
                    "model_id": model_id,
                    "stance": "SAFE",
                    "justification": [],
                    "self_consistency": None,
                    "causal_graph": {"error": f"Evaluation failed: {str(e)}"},
                    "error": f"Evaluation failed: {str(e)}",
                }

        try:
            if ARC_EVAL_SEQUENTIAL:
                for i, mid in enumerate(request.model_ids):
                    result = await run_one(mid)
                    payload = json.dumps({"type": "result", "result": result}, default=str)
                    yield f"data: {payload}\n\n"
                    if i < len(request.model_ids) - 1:
                        await asyncio.sleep(INTER_MODEL_DELAY)
            else:
                tasks = [asyncio.create_task(run_one(mid)) for mid in request.model_ids]
                for finished in asyncio.as_completed(tasks):
                    result = await finished
                    payload = json.dumps({"type": "result", "result": result}, default=str)
                    yield f"data: {payload}\n\n"
            done = json.dumps({"type": "done"})
            yield f"data: {done}\n\n"
        except Exception as e:
            err = json.dumps({"type": "error", "message": str(e)}, default=str)
            yield f"data: {err}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=STREAM_HEADERS,
    )
