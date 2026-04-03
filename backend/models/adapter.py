import asyncio
import json
import os
import threading
import time
from typing import Optional

import httpx
from backend.config import (
    OPENROUTER_BASE_URL,
    OPENROUTER_API_KEY,
    OPENROUTER_MAX_CONCURRENT,
    APP_SITE_URL,
    APP_NAME,
)

# Queues parallel models so only N requests hit OpenRouter at once (reduces 429 when comparing 2–3 models).
_openrouter_slots = threading.Semaphore(OPENROUTER_MAX_CONCURRENT)
_openrouter_async_slots = asyncio.Semaphore(OPENROUTER_MAX_CONCURRENT)
_async_http: Optional[httpx.AsyncClient] = None
_async_http_lock = asyncio.Lock()

def _parse_429_backoff_seconds() -> tuple[float, ...]:
    """
    Seconds to wait before each retry when OpenRouter returns 429 without Retry-After.
    Env OPENROUTER_429_BACKOFF_S: comma-separated, e.g. 45,90,180,240
    (more segments = more total attempts; free :models often need longer tails).
    """
    raw = (os.getenv("OPENROUTER_429_BACKOFF_S") or "").strip()
    if not raw:
        return (45.0, 90.0, 180.0, 240.0)
    out: list[float] = []
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        try:
            out.append(max(5.0, float(p)))
        except ValueError:
            continue
    return tuple(out) if out else (45.0, 90.0, 180.0, 240.0)


# After 429 (not daily): sleep before retry. Longer defaults help Venice / :free upstream windows.
_RATE_LIMIT_BACKOFF_S = _parse_429_backoff_seconds()
# On 429, fail after this many attempts index (0-based) equals len(backoffs)
RATE_LIMIT_MAX_RETRIES = len(_RATE_LIMIT_BACKOFF_S)


async def _shared_async_client() -> httpx.AsyncClient:
    global _async_http
    async with _async_http_lock:
        if _async_http is None:
            _async_http = httpx.AsyncClient(timeout=90.0)
        return _async_http


async def shutdown_shared_async_client() -> None:
    """Close the process-wide httpx.AsyncClient (FastAPI lifespan shutdown)."""
    global _async_http
    async with _async_http_lock:
        if _async_http is not None:
            try:
                await _async_http.aclose()
            finally:
                _async_http = None


def _openrouter_429_body_msg(response: httpx.Response) -> str:
    try:
        body = response.json()
        return str(body).lower()
    except Exception:
        return response.text.lower()


def _openrouter_http_error_detail(response: httpx.Response) -> str:
    """Best-effort message from OpenRouter error JSON (metadata often has the real provider error)."""
    raw = (response.text or "").strip()
    try:
        body = response.json()
    except Exception:
        return (raw[:1500] if raw else f"empty body (HTTP {response.status_code})")

    err = body.get("error")
    if isinstance(err, dict):
        parts: list[str] = []
        m = err.get("message")
        if m:
            parts.append(str(m))
        code = err.get("code")
        if code is not None:
            parts.append(f"code={code}")
        for key in ("metadata", "param", "type"):
            if key in err and err[key] not in (None, {}, []):
                try:
                    parts.append(json.dumps(err[key], ensure_ascii=False)[:600])
                except Exception:
                    parts.append(str(err[key])[:600])
        if parts:
            return " | ".join(parts)
        return json.dumps(err, ensure_ascii=False)[:800]
    if err:
        return str(err)
    return json.dumps(body, ensure_ascii=False)[:800]


def _openrouter_enrich_error(status_code: int, detail: str) -> str:
    """Add hints for common OpenRouter routing / policy errors."""
    d = (detail or "").lower()
    if status_code == 404 and (
        "guardrail" in d or "data policy" in d or "privacy" in d or "no endpoints available" in d
    ):
        return (
            f"{detail} — No provider matched your OpenRouter privacy/guardrails for this request. "
            "Dashboard preview can differ from the API key: confirm the same key in .env, avoid "
            "OPENROUTER_BASE_URL=https://eu.openrouter.ai/api/v1 unless you want EU filtering, check "
            "Guardrails in OpenRouter, then GET /api/models/openrouter-route-check (or /v1/models/user). "
            "Or pick another eval model. Privacy: https://openrouter.ai/settings/privacy"
        )
    if status_code == 400 and ("provider" in d or "invalid" in d):
        return (
            f"{detail} — If this is vague, set GRAPH_COMPARE_JUDGE_MODEL_ID to "
            "meta-llama/llama-3.3-70b-instruct (reliable on OpenRouter) or check openrouter.ai status."
        )
    return detail


def _openrouter_is_daily_quota(msg: str) -> bool:
    compact = msg.replace(" ", "").replace("_", "").replace("-", "")
    is_daily = (
        "perday" in compact
        or "requestsperday" in compact
        or "freetierperday" in compact
        or (
            "daily" in msg
            and "minute" not in msg
            and "min" not in compact
        )
    )
    is_minute = (
        "perminute" in compact
        or "requestsperminute" in compact
        or "/min" in msg
        or ("minute" in msg and "per" in msg)
    )
    return is_daily and not is_minute


def _openrouter_provider_payload() -> Optional[dict]:
    """
    Per-request routing hints so chat/completions matches account privacy intent.
    See https://openrouter.ai/docs/provider-routing — data_collection allow uses
    providers that may retain/train (typical for :free); allow_fallbacks helps
    when the primary endpoint is temporarily unavailable.

    Override with OPENROUTER_PROVIDER_JSON (full JSON object). Disable entirely with
    OPENROUTER_SKIP_PROVIDER_BLOCK=1.
    """
    if os.getenv("OPENROUTER_SKIP_PROVIDER_BLOCK", "").lower() in ("1", "true", "yes"):
        return None
    raw = (os.getenv("OPENROUTER_PROVIDER_JSON") or "").strip()
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            print("OPENROUTER_PROVIDER_JSON is not valid JSON; using default provider block")
    dc = (os.getenv("OPENROUTER_DATA_COLLECTION") or "allow").strip().lower()
    if dc not in ("allow", "deny"):
        dc = "allow"
    fb = os.getenv("OPENROUTER_ALLOW_FALLBACKS", "true").lower() not in ("0", "false", "no")
    return {"data_collection": dc, "allow_fallbacks": fb}


def _openrouter_headers() -> dict:
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": APP_SITE_URL,
        "X-Title": APP_NAME,
        "X-OpenRouter-Title": APP_NAME,
    }


def _openrouter_chat_payload(model_id: str, system_prompt: str, user_prompt: str) -> dict:
    payload: dict = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    prov = _openrouter_provider_payload()
    if prov:
        payload["provider"] = prov
    return payload


def _retry_after_seconds(response: httpx.Response) -> Optional[float]:
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        sec = int(raw)
    except ValueError:
        return None
    return max(5.0, min(float(sec), 180.0))


class OpenRouterAdapter:
    def __init__(self, model_id: str):
        self.model_id = model_id

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        headers = _openrouter_headers()
        payload = _openrouter_chat_payload(self.model_id, system_prompt, user_prompt)

        for attempt in range(RATE_LIMIT_MAX_RETRIES + 1):
            with _openrouter_slots:
                response = httpx.post(
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=90.0,
                )

            if response.status_code == 429:
                msg = _openrouter_429_body_msg(response)

                # Log the full 429 body so we know exactly what OpenRouter says
                print(f"[{self.model_id}] 429 body: {msg[:400]}")
                print(f"[{self.model_id}] Retry-After header: {response.headers.get('Retry-After', 'not set')}")
                print(f"[{self.model_id}] X-RateLimit-Reset: {response.headers.get('X-RateLimit-Reset', 'not set')}")

                if _openrouter_is_daily_quota(msg):
                    raise ValueError(
                        "OpenRouter daily limit reached for this free model. "
                        "Try again tomorrow, pick a different :free model, or use a paid key."
                    )

                if attempt >= RATE_LIMIT_MAX_RETRIES:
                    raise ValueError(
                        f"OpenRouter rate limit still active after {RATE_LIMIT_MAX_RETRIES} retries "
                        f"for {self.model_id}. "
                        "Try a non-free model, set ARC_EVAL_SEQUENTIAL=1 and OPENROUTER_MAX_CONCURRENT=1, "
                        "increase OPENROUTER_429_BACKOFF_S waits, or add your own provider key / credits: "
                        "https://openrouter.ai/settings/integrations"
                    )

                # Prefer Retry-After header; fall back to our backoff schedule
                wait = _retry_after_seconds(response) or float(
                    _RATE_LIMIT_BACKOFF_S[min(attempt, len(_RATE_LIMIT_BACKOFF_S) - 1)]
                )
                print(
                    f"[{self.model_id}] Rate limited, retrying in {wait:.0f}s "
                    f"(attempt {attempt + 1}/{RATE_LIMIT_MAX_RETRIES + 1})..."
                )
                time.sleep(wait)
                continue

            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                detail = _openrouter_http_error_detail(e.response)
                if detail:
                    detail = _openrouter_enrich_error(e.response.status_code, detail)
                    raise ValueError(
                        f"OpenRouter HTTP {e.response.status_code}: {detail}"
                    ) from e
                raise

            return response.json()["choices"][0]["message"]["content"]

        raise ValueError("Max retries exceeded due to rate limiting.")

    async def complete_async(self, system_prompt: str, user_prompt: str) -> str:
        headers = _openrouter_headers()
        payload = _openrouter_chat_payload(self.model_id, system_prompt, user_prompt)
        client = await _shared_async_client()

        for attempt in range(RATE_LIMIT_MAX_RETRIES + 1):
            async with _openrouter_async_slots:
                response = await client.post(
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload,
                )

            if response.status_code == 429:
                msg = _openrouter_429_body_msg(response)
                print(f"[{self.model_id}] 429 body: {msg[:400]}")
                print(f"[{self.model_id}] Retry-After header: {response.headers.get('Retry-After', 'not set')}")
                print(f"[{self.model_id}] X-RateLimit-Reset: {response.headers.get('X-RateLimit-Reset', 'not set')}")

                if _openrouter_is_daily_quota(msg):
                    raise ValueError(
                        "OpenRouter daily limit reached for this free model. "
                        "Try again tomorrow, pick a different :free model, or use a paid key."
                    )

                if attempt >= RATE_LIMIT_MAX_RETRIES:
                    raise ValueError(
                        f"OpenRouter rate limit still active after {RATE_LIMIT_MAX_RETRIES} retries "
                        f"for {self.model_id}. "
                        "Try a non-free model, set ARC_EVAL_SEQUENTIAL=1 and OPENROUTER_MAX_CONCURRENT=1, "
                        "increase OPENROUTER_429_BACKOFF_S waits, or add your own provider key / credits: "
                        "https://openrouter.ai/settings/integrations"
                    )

                wait = _retry_after_seconds(response) or float(
                    _RATE_LIMIT_BACKOFF_S[min(attempt, len(_RATE_LIMIT_BACKOFF_S) - 1)]
                )
                print(
                    f"[{self.model_id}] Rate limited, retrying in {wait:.0f}s "
                    f"(attempt {attempt + 1}/{RATE_LIMIT_MAX_RETRIES + 1})..."
                )
                await asyncio.sleep(wait)
                continue

            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                detail = _openrouter_http_error_detail(e.response)
                if detail:
                    detail = _openrouter_enrich_error(e.response.status_code, detail)
                    raise ValueError(
                        f"OpenRouter HTTP {e.response.status_code}: {detail}"
                    ) from e
                raise

            return response.json()["choices"][0]["message"]["content"]

        raise ValueError("Max retries exceeded due to rate limiting.")
