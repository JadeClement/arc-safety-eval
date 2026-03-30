from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db.session import engine
from backend.db.schema import Base
from backend.api import datasets, models, evaluate

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="ArC Safety Evaluator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets.router)
app.include_router(models.router)
app.include_router(evaluate.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "ArC Safety Evaluator API"}


@app.get("/health")
def health():
    return {"status": "healthy"}
