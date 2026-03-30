from sqlalchemy import Column, Integer, String, Text, Boolean, Float, JSON, DateTime
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id = Column(Integer, primary_key=True, index=True)
    input_text = Column(Text, nullable=False)
    model_id = Column(String, nullable=False)
    stance = Column(String)
    justification = Column(JSON)
    self_consistency = Column(JSON)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UploadedDataset(Base):
    __tablename__ = "uploaded_datasets"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, nullable=False, index=True)
    filename = Column(String)
    samples = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
