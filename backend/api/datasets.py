import json
import csv
import io
import uuid
from collections import Counter
from typing import Union
from urllib.request import Request, urlopen
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session

from backend.config import CURATED_DATASETS, DATASET_SAMPLE_MAX_CHARS
from backend.db.session import get_db
from backend.db.schema import UploadedDataset

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

# In-memory cache for loaded HuggingFace datasets
_dataset_cache: dict = {}


def _clip_sample_text(text: str) -> str:
    t = (text or "").strip()
    # ToxiGen (and similar) often store line breaks as literal backslash-n in the string
    t = t.replace("\\n", "\n").replace("\\r\\n", "\n").replace("\\t", "\t")
    if DATASET_SAMPLE_MAX_CHARS <= 0:
        return t
    return t[:DATASET_SAMPLE_MAX_CHARS]

# Official HateXplain JSON (HuggingFace's script mis-handles these URLs with download_and_extract → gzip/UTF-8 errors).
_HATEXPLAIN_DATA_URLS = (
    "https://raw.githubusercontent.com/punyajoy/HateXplain/master/Data/post_id_divisions.json",
    "https://raw.githubusercontent.com/punyajoy/HateXplain/master/Data/dataset.json",
)


def _http_json(url: str, timeout: float = 120.0) -> Union[dict, list]:
    req = Request(url, headers={"User-Agent": "ArC-Safety-Eval/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _load_hatexplain_samples(sample_count: int) -> list[dict]:
    """
    Load HateXplain train split from upstream GitHub JSON (matches HF dataset content).
    Labels on annotators are strings: hatespeech | normal | offensive.
    """
    divisions = _http_json(_HATEXPLAIN_DATA_URLS[0])
    full = _http_json(_HATEXPLAIN_DATA_URLS[1])
    samples: list[dict] = []
    int_to_label = ("hatespeech", "normal", "offensive")

    for tweet_id in divisions.get("train", []):
        if len(samples) >= sample_count:
            break
        item = full.get(tweet_id)
        if not item:
            continue
        tokens = item.get("post_tokens", [])
        text = " ".join(tokens).strip() if isinstance(tokens, list) else str(tokens).strip()
        if not text or len(text) <= 10:
            continue

        annotator_rows = item.get("annotators") or []
        norm_labels: list[str] = []
        for a in annotator_rows:
            if not isinstance(a, dict):
                continue
            lb = a.get("label")
            if lb is None:
                continue
            if isinstance(lb, int) and 0 <= lb < 3:
                norm_labels.append(int_to_label[lb])
            else:
                s = str(lb).lower().strip()
                if s in int_to_label:
                    norm_labels.append(s)
                elif s in ("hate", "hatespeech", "hs"):
                    norm_labels.append("hatespeech")
                elif s == "offensive":
                    norm_labels.append("offensive")
                elif s == "normal":
                    norm_labels.append("normal")

        if not norm_labels:
            continue
        majority = Counter(norm_labels).most_common(1)[0][0]
        if majority not in ("hatespeech", "offensive"):
            continue

        samples.append(
            {
                "id": str(len(samples) + 1),
                "text": _clip_sample_text(text),
                "label": majority,
            }
        )
    return samples


def load_hf_dataset(dataset_config: dict) -> list[dict]:
    name = dataset_config["name"]
    if name in _dataset_cache:
        return _dataset_cache[name]

    try:
        from datasets import load_dataset

        hf_id = dataset_config["hf_id"]
        text_field = dataset_config["text_field"]
        label_field = dataset_config["label_field"]
        sample_count = dataset_config["sample_count"]

        if name == "civil_comments":
            # Only include instances with toxicity >= 0.5 (unsafe)
            ds = load_dataset(hf_id, split="train", streaming=True, trust_remote_code=True)
            samples = []
            for item in ds:
                if len(samples) >= sample_count:
                    break
                text = item.get(text_field, "").strip()
                toxicity = float(item.get(label_field, 0) or 0)
                if text and len(text) > 20 and toxicity >= 0.5:
                    samples.append({
                        "id": str(len(samples) + 1),
                        "text": _clip_sample_text(text),
                        "label": f"{toxicity:.2f}",
                    })
        elif name == "hatexplain":
            # Avoid HuggingFace load_dataset("hatexplain"): builder uses download_and_extract on raw JSON → corrupt cache / UTF-8 errors.
            samples = _load_hatexplain_samples(sample_count)
        elif name == "toxigen":
            # skg/toxigen-data: human toxicity score is in toxicity_human (1–5 mean), not "label".
            ds = load_dataset(hf_id, "annotated", split="train", trust_remote_code=True)
            samples = []
            for item in ds:
                if len(samples) >= sample_count:
                    break
                text = item.get(text_field, "").strip()
                raw_score = item.get("toxicity_human", item.get(label_field))
                try:
                    score = float(raw_score)
                except (TypeError, ValueError):
                    score = 0.0
                # Treat mean human rating >= 2.5 as toxic / biased for curation (per ToxiGen practice)
                if text and len(text) > 10 and score >= 2.5:
                    samples.append({
                        "id": str(len(samples) + 1),
                        "text": _clip_sample_text(text),
                        "label": f"{score:.2f}",
                    })
        else:
            samples = []

        _dataset_cache[name] = samples
        return samples

    except Exception as e:
        print(f"Failed to load dataset {name}: {e}")
        # Return mock samples on failure
        return [
            {
                "id": str(i),
                "text": f"Sample text {i} from {dataset_config['display_name']} (dataset loading failed: {str(e)[:100]})",
                "label": "unknown",
            }
            for i in range(1, 11)
        ]


@router.get("")
def list_datasets():
    return [
        {
            "name": d["name"],
            "display_name": d["display_name"],
            "domain": d["domain"],
            "sample_count": d["sample_count"],
        }
        for d in CURATED_DATASETS
    ]


@router.get("/uploaded/{session_id}/samples")
def get_uploaded_samples(session_id: str, page: int = 1, page_size: int = 20, db: Session = Depends(get_db)):
    record = db.query(UploadedDataset).filter(UploadedDataset.session_id == session_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Uploaded dataset not found")
    samples = record.samples
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "dataset": record.filename,
        "total": len(samples),
        "page": page,
        "page_size": page_size,
        "samples": samples[start:end],
    }


@router.get("/{name}/samples")
def get_samples(name: str, page: int = 1, page_size: int = 20):
    dataset_config = next((d for d in CURATED_DATASETS if d["name"] == name), None)
    if dataset_config:
        samples = load_hf_dataset(dataset_config)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "dataset": name,
            "total": len(samples),
            "page": page,
            "page_size": page_size,
            "samples": samples[start:end],
        }
    raise HTTPException(status_code=404, detail=f"Dataset '{name}' not found")


@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    filename = file.filename or "uploaded"
    samples = []

    try:
        if filename.endswith(".json"):
            data = json.loads(content.decode("utf-8"))
            if isinstance(data, list):
                rows = data
            elif isinstance(data, dict) and "data" in data:
                rows = data["data"]
            else:
                rows = [data]
            for i, row in enumerate(rows):
                if isinstance(row, dict) and "text" in row:
                    samples.append({
                        "id": str(i + 1),
                        "text": _clip_sample_text(str(row["text"])),
                        "label": str(row.get("label", "")),
                    })
        elif filename.endswith(".csv"):
            text_content = content.decode("utf-8")
            reader = csv.DictReader(io.StringIO(text_content))
            for i, row in enumerate(reader):
                if "text" in row:
                    samples.append({
                        "id": str(i + 1),
                        "text": _clip_sample_text(str(row["text"])),
                        "label": str(row.get("label", "")),
                    })
        else:
            raise HTTPException(status_code=400, detail="Only .csv and .json files are supported")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    if not samples:
        raise HTTPException(status_code=400, detail="No valid rows found. Ensure your file has a 'text' column.")

    session_id = str(uuid.uuid4())
    record = UploadedDataset(session_id=session_id, filename=filename, samples=samples)
    db.add(record)
    db.commit()

    return {
        "session_id": session_id,
        "filename": filename,
        "sample_count": len(samples),
        "preview": samples[:5],
    }
