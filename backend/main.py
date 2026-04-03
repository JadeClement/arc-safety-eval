from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db.session import engine
from backend.db.schema import Base
from backend.api import datasets, models, evaluate, human_rationale, graph_consistency
from backend.models.adapter import shutdown_shared_async_client

# Create tables
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await shutdown_shared_async_client()
    engine.dispose()


app = FastAPI(title="ArC Safety Evaluator API", version="1.0.0", lifespan=lifespan)

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
app.include_router(human_rationale.router)
app.include_router(graph_consistency.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "ArC Safety Evaluator API"}


@app.get("/health")
def health():
    return {"status": "healthy"}
