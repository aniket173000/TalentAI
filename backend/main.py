import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import models
from config import settings
from database import engine
from routers import applications, jobs

logging.basicConfig(level=logging.INFO)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TalentAI",
    description="AI-Powered Recruitment Intelligence Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router)
app.include_router(applications.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "TalentAI API v1"}
