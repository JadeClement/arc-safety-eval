# ArC Safety Evaluator

A web platform for evaluating and comparing LLM reasoning quality on safety-relevant text classification tasks, operationalizing the **Argument-based Consistency (ArC)** framework.

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- An [OpenRouter](https://openrouter.ai) API key (creating an account is free). **Most models in Step 2 use normal OpenRouter routing (metered / paid-per-token), not the `:free`-only endpoints**, so expect token charges unless you only select **Qwen 3.6 Plus** (the remaining `:free` option). The causal-graph judges (`meta-llama/llama-3.3-70b-instruct` by default) are also billed like any other routed model. Add a small credit balance or your own provider keys if needed.

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your key:
```bash
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY=your_key_here
```

Start the API:
```bash
uvicorn backend.main:app --reload
```

API runs at http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at http://localhost:5173

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | Your OpenRouter API key | required |
| `OPENROUTER_BASE_URL` | OpenRouter API base URL | `https://openrouter.ai/api/v1` |
| `APP_SITE_URL` | Your app URL (sent in OpenRouter headers) | `http://localhost:5173` |
| `APP_NAME` | App name (sent in OpenRouter headers) | `ArC Safety Evaluator` |

---

## ArC pipeline

The implementation follows the **two-prompt** core from `backend/arc/pipeline.py` for each **evaluated model** (plus separate **judge** calls for causal graphs). There is **no** multi-round “uphold reason set” loop; stability labels in the API are derived from the fixed call count for that run.

### Stage 1 — Justification (one chat completion)

The model must answer whether the input text is toxic, then give **numbered reasons** that are non-redundant and **jointly** sufficient for that decision. Parsed output: stance **SAFE** vs **UNSAFE** (mapped from TOXIC / NOT TOXIC) and a list of reason strings.

### Stage 2 — Individual sufficiency (one completion per UNSAFE reason)

When the stance is **UNSAFE**, for **each** reason the model gets a dedicated prompt: is **any additional** reason **required** to justify that the text is unsafe?

- **Answer No** → that reason is treated as **individually sufficient** for the unsafe classification.
- **Answer Yes** → **not** individually sufficient (other reasons are still needed in the joint story).

If the stance is **SAFE**, no sufficiency calls are made (placeholders in the result). Between justification and each sufficiency call the client waits `ARC_INTER_CALL_DELAY` seconds to reduce OpenRouter throttling.

### Full evaluation request (`/api/evaluate`)

In one evaluation run the backend also:

1. **Human reasoning baseline** — Resolves narrative text (from Step 3, repo file, or fallback), splits it into reason-like strings, and runs the **causal graph judge** (`JUDGE_MODEL_ID`, default Llama 3.3 70B Instruct) to produce a structured graph: taxonomy **values** (V1–V8) → **concerns** → **warrants**.

2. **Per selected model** — Runs stages 1–2 above, takes the model’s reason texts, and calls the **same judge** again to build that model’s **causal graph**.

Optional **Step 6** in the UI calls a **compare judge** (`GRAPH_COMPARE_JUDGE_MODEL_ID`) to score alignment between the human and each model graph (not part of `/api/evaluate` itself).

---

## Rate limits and cost

- **`:free` models** (e.g. Qwen 3.6 Plus): OpenRouter applies **daily and per-minute caps** (commonly cited as ~200 requests/day and ~20/min per model; confirm on OpenRouter). The ArC pipeline issues multiple chat calls per evaluation (justification, per-reason sufficiency, and graph stages), so a single UI run can consume several requests.
- **Standard / metered models** (GPT-OSS 120B, Gemma 3 4B, Llama 3.2 3B, and the default graph judges): limits follow **your balance and each model’s pricing** on OpenRouter, not the free-tier caps. Configure `ARC_EVAL_SEQUENTIAL`, `OPENROUTER_MAX_CONCURRENT`, and related env vars in `.env.example` if you hit throttling.
