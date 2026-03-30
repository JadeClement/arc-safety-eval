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

# After 429 (not daily): sleep before retry. First wait is short (minute windows often roll soon).
_RATE_LIMIT_BACKOFF_S = (30, 70, 130)
# Max POST attempts in a 429 loop = 1 + len(backoffs)
RATE_LIMIT_MAX_RETRIES = len(_RATE_LIMIT_BACKOFF_S)


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
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": APP_SITE_URL,
            "X-Title": APP_NAME,
        }
        payload = {
            "model": self.model_id,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

        for attempt in range(RATE_LIMIT_MAX_RETRIES + 1):
            with _openrouter_slots:
                response = httpx.post(
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=90.0,
                )

            if response.status_code == 429:
                # OpenRouter often puts "quota" in per-minute errors too — avoid mislabeling as daily.
                try:
                    body = response.json()
                    msg = str(body).lower()
                except Exception:
                    msg = response.text.lower()

                # Log the full 429 body so we know exactly what OpenRouter says
                print(f"[{self.model_id}] 429 body: {msg[:400]}")
                print(f"[{self.model_id}] Retry-After header: {response.headers.get('Retry-After', 'not set')}")
                print(f"[{self.model_id}] X-RateLimit-Reset: {response.headers.get('X-RateLimit-Reset', 'not set')}")

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
                is_daily_limit = is_daily and not is_minute

                if is_daily_limit:
                    raise ValueError(
                        "OpenRouter daily limit reached for this free model. "
                        "Try again tomorrow, pick a different :free model, or use a paid key."
                    )

                if attempt >= RATE_LIMIT_MAX_RETRIES:
                    raise ValueError(
                        f"OpenRouter rate limit still active after {RATE_LIMIT_MAX_RETRIES} retries. "
                        "Adding even $1 credit to openrouter.ai removes free-tier rate limits entirely."
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
                detail = ""
                try:
                    body = e.response.json()
                    err = body.get("error")
                    if isinstance(err, dict):
                        detail = err.get("message") or str(err)
                    elif err:
                        detail = str(err)
                    else:
                        detail = str(body)[:500]
                except Exception:
                    detail = (e.response.text or "").strip()[:500]
                if detail:
                    raise ValueError(
                        f"OpenRouter HTTP {e.response.status_code}: {detail}"
                    ) from e
                raise

            return response.json()["choices"][0]["message"]["content"]

        raise ValueError("Max retries exceeded due to rate limiting.")
