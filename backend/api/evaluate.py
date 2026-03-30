import asyncio
import json
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
from concurrent.futures import ThreadPoolExecutor

from backend.arc.pipeline import run_arc_pipeline, run_causal_graph
from backend.config import ARC_EVAL_SEQUENTIAL, JUDGE_MODEL_ID

# Seconds to wait between sequential model calls to avoid rate-limiting.
# Override with INTER_MODEL_DELAY env var.
INTER_MODEL_DELAY = float(os.getenv("INTER_MODEL_DELAY", "15"))

router = APIRouter(prefix="/api/evaluate", tags=["evaluate"])

executor = ThreadPoolExecutor(max_workers=6)

STREAM_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


class EvaluateRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    text: str
    model_ids: List[str]


def _validate_evaluate_request(request: EvaluateRequest) -> str:
    if len(request.model_ids) > 3:
        raise HTTPException(status_code=400, detail="You can compare up to 3 models at a time.")
    if len(request.model_ids) < 1:
        raise HTTPException(status_code=400, detail="Select at least 1 model.")
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")
    return text


@router.post("")
async def evaluate(request: EvaluateRequest):
    text = _validate_evaluate_request(request)

    loop = asyncio.get_event_loop()

    async def run_single(model_id: str):
        result = await loop.run_in_executor(executor, run_arc_pipeline, text, model_id)
        # Stage 4: causal graph — run after pipeline completes
        stabilized_reasons = [r["text"] for r in result.get("justification", [])]
        causal_graph = await loop.run_in_executor(
            executor, run_causal_graph, stabilized_reasons
        )
        result["causal_graph"] = causal_graph
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
        "results": final_results,
    }


@router.post("/stream")
async def evaluate_stream(request: EvaluateRequest):
    """Stream each model's result over SSE as soon as it finishes (JSON lines in `data:` fields)."""
    text = _validate_evaluate_request(request)

    async def event_generator():
        loop = asyncio.get_event_loop()

        async def run_one(model_id: str):
            try:
                r = await loop.run_in_executor(executor, run_arc_pipeline, text, model_id)
                stabilized_reasons = [item["text"] for item in r.get("justification", [])]
                r["causal_graph"] = await loop.run_in_executor(
                    executor, run_causal_graph, stabilized_reasons
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
