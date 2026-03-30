# ArC Safety Evaluator

A web platform for evaluating and comparing LLM reasoning quality on safety-relevant text classification tasks, operationalizing the **Argument-based Consistency (ArC)** framework.

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- An OpenRouter API key (free at [openrouter.ai](https://openrouter.ai) — no credit card required)

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

## ArC Pipeline Stages

Each model processes input text through three sequential stages:

### Stage 1: JUSTIFY
The model states its safety stance (UNSAFE/SAFE) and lists structured reasons supporting that stance. Each reason must be directly relevant to the input text and non-redundant.

### Stage 2: UPHOLD-REASON (Reasoning Stability)
The model is re-prompted up to `MAX_CONSISTENCY_PROMPTS` (default: 5) times to check whether its current set of reasons is jointly sufficient to fully justify the classification. This measures **reasoning stability** — how many prompts it takes for the model to confirm no additional reasons are needed.

- **High stability** (1 prompt): Confident and complete on first try
- **Medium stability** (2–3 prompts): Needs some refinement
- **Low stability** (4+ prompts): Requires significant iteration

### Stage 3: UPHOLD-STANCE (Individual Sufficiency)
Each reason is individually probed: does this reason alone sustain the safety classification? This reveals whether reasons are independently decisive or only contribute as part of a group. Note: in ambiguous cases, no single reason may be individually sufficient — this is expected behavior.

---

## Rate Limits

Free models on OpenRouter are limited to **200 requests/day** and **20 requests/minute** per model. The ArC pipeline makes multiple calls per evaluation (1 JUSTIFY + up to 5 UPHOLD-REASON + N UPHOLD-STANCE), so budget accordingly.
