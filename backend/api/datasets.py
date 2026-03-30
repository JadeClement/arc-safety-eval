import json
import csv
import io
import uuid
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session

from backend.config import CURATED_DATASETS
from backend.db.session import get_db
from backend.db.schema import UploadedDataset

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

# In-memory cache for loaded HuggingFace datasets
_dataset_cache: dict = {}


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
                        "text": text[:1000],
                        "label": f"{toxicity:.2f}",
                    })
        elif name == "hatexplain":
            # Only include hatespeech (0) or offensive (1), not normal (2)
            ds = load_dataset(hf_id, split="train", trust_remote_code=True)
            samples = []
            for item in ds:
                if len(samples) >= sample_count:
                    break
                tokens = item.get(text_field, [])
                text = " ".join(tokens).strip() if isinstance(tokens, list) else str(tokens).strip()
                if text and len(text) > 10:
                    annotators = item.get(label_field, {})
                    label_list = annotators.get("label", []) if isinstance(annotators, dict) else []
                    # majority label: 0=hatespeech, 1=offensive, 2=normal
                    if label_list:
                        from collections import Counter
                        majority = Counter(label_list).most_common(1)[0][0]
                        if majority in (0, 1):  # unsafe only
                            label_name = "hatespeech" if majority == 0 else "offensive"
                            samples.append({
                                "id": str(len(samples) + 1),
                                "text": text[:1000],
                                "label": label_name,
                            })
        elif name == "toxigen":
            # Only include instances labelled as toxic/biased (label >= 2.5 on 0–5 scale, or label == 1)
            ds = load_dataset(hf_id, "annotated", split="train", trust_remote_code=True)
            samples = []
            for item in ds:
                if len(samples) >= sample_count:
                    break
                text = item.get(text_field, "").strip()
                raw_label = item.get(label_field, 0)
                try:
                    label_val = float(raw_label)
                except (TypeError, ValueError):
                    label_val = 0
                # ToxiGen annotated: toxicity_human is mean rating 0–5; >= 2.5 considered toxic
                if text and len(text) > 10 and label_val >= 2.5:
                    samples.append({
                        "id": str(len(samples) + 1),
                        "text": text[:1000],
                        "label": str(raw_label),
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
                        "text": str(row["text"])[:1000],
                        "label": str(row.get("label", "")),
                    })
        elif filename.endswith(".csv"):
            text_content = content.decode("utf-8")
            reader = csv.DictReader(io.StringIO(text_content))
            for i, row in enumerate(reader):
                if "text" in row:
                    samples.append({
                        "id": str(i + 1),
                        "text": str(row["text"])[:1000],
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
