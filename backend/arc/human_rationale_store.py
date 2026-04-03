"""
Hand-written rationales shipped with the app.

Edit backend/data/human_rationales.json (or set HUMAN_RATIONALES_PATH). Each entry:

  { "text": "<exact string sent to evaluate>", "rationale": "<your reasoning>" }

You may use "human_reasoning" instead of "rationale" as the value key. Matching compares
text after normalizing whitespace and mapping curly quotes / apostrophes (e.g. \u201c\u201d\u2019)
to straight ASCII so dataset/UI paste matches JSON typed with " and '.
"""

from __future__ import annotations

import json
import unicodedata
from typing import Any, List, Optional

from backend.config import HUMAN_RATIONALES_FILE

# Minimum chars for prefix matching (avoids trivial overlaps)
_MIN_PREFIX_MATCH_LEN = 28

_cache_mtime: Optional[float] = None
_cache_entries: Optional[List[Any]] = None


# Map curly/smart quotes and apostrophes to ASCII so UI/dataset text matches JSON entries.
_TYPOGRAPHY_TRANSLATE = str.maketrans(
    {
        "\u201c": '"',  # “
        "\u201d": '"',  # ”
        "\u201e": '"',  # „ (often paired with ”)
        "\u201f": '"',  # ‟ double high-reversed-9
        "\u00ab": '"',  # «
        "\u00bb": '"',  # »
        "\u2018": "'",  # ‘
        "\u2019": "'",  # ’ (common typo for apostrophe)
        "\u201a": "'",  # ‚ single low-9
        "\u201b": "'",  # ‛ single high-reversed-9
        "\u2032": "'",  # ′ prime
        "\u02bc": "'",  # ʼ modifier letter apostrophe
        "\uff07": "'",  # ＇ fullwidth apostrophe
        "\uff02": '"',  # ＂ fullwidth quotation mark
        "\u00b4": "'",  # ´ acute (sometimes used as apostrophe)
        "\u0060": "'",  # ` grave used as apostrophe in paste
    }
)

_ZERO_WIDTH = ("\ufeff", "\u200b", "\u200c", "\u200d", "\u2060")


def normalize_freeform(s: str) -> str:
    """Strip, collapse whitespace, NFKC, strip ZWSP, unify smart quotes — for keys and rationale compare."""
    t = (s or "").replace("\\n", "\n").replace("\\r\\n", "\n").replace("\\t", " ")
    t = unicodedata.normalize("NFKC", t)
    t = t.translate(_TYPOGRAPHY_TRANSLATE)
    for z in _ZERO_WIDTH:
        t = t.replace(z, "")
    t = t.strip()
    return " ".join(t.split())


def _normalized_texts_equivalent(a_raw: str, b_raw: str) -> bool:
    """
    Equality after normalize, or strict prefix match so truncated samples (missing tail)
    still match a full JSON `text` row.
    """
    a = normalize_freeform(a_raw)
    b = normalize_freeform(b_raw)
    if not a or not b:
        return False
    if a == b:
        return True
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) < _MIN_PREFIX_MATCH_LEN:
        return False
    return longer.startswith(shorter)


def _load_entries() -> list:
    global _cache_mtime, _cache_entries
    path = HUMAN_RATIONALES_FILE
    if not path.is_file():
        _cache_mtime = -1.0
        _cache_entries = []
        return []

    mtime = path.stat().st_mtime
    if _cache_entries is not None and _cache_mtime == mtime:
        return _cache_entries

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict):
        entries = data.get("entries", [])
    elif isinstance(data, list):
        entries = data
    else:
        entries = []

    if not isinstance(entries, list):
        entries = []

    _cache_mtime = mtime
    _cache_entries = entries
    return _cache_entries


def lookup_repo_rationale(evaluation_text: str) -> Optional[str]:
    """
    Return the rationale for this exact evaluated text, if listed in the JSON file.
    First matching entry wins. Text must match after normalization (use the same
    string the UI sends, including dataset truncation).
    """
    if not normalize_freeform(evaluation_text):
        return None

    for e in _load_entries():
        if not isinstance(e, dict):
            continue
        t = e.get("text")
        if t is None:
            continue
        if not _normalized_texts_equivalent(evaluation_text, str(t)):
            continue
        r = e.get("rationale") or e.get("human_reasoning")
        if r is None:
            continue
        out = str(r).strip()
        if out:
            return out

    return None
