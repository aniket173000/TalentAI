from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from services.file_parser import parse_docx, parse_pdf

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("/", response_model=schemas.JobResponse)
async def create_job(
    title: str = Form(...),
    company: str = Form(default="Our Company"),
    location: str = Form(default="Remote"),
    max_count: int = Form(default=10),
    jd_text: Optional[str] = Form(default=None),
    jd_file: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
):
    final_jd = jd_text or ""

    if jd_file and not final_jd.strip():
        content = await jd_file.read()
        fname = (jd_file.filename or "").lower()
        if fname.endswith(".pdf"):
            final_jd = parse_pdf(content)
        elif fname.endswith(".docx") or fname.endswith(".doc"):
            final_jd = parse_docx(content)
        else:
            final_jd = content.decode("utf-8", errors="ignore")

    if not final_jd.strip():
        raise HTTPException(status_code=400, detail="Job description is required.")

    job = models.Job(
        title=title,
        jd_text=final_jd,
        company=company,
        location=location,
        max_count=max_count,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    resp = schemas.JobResponse.model_validate(job)
    resp.active_applications = 0
    return resp


@router.get("/", response_model=List[schemas.JobResponse])
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(models.Job).order_by(models.Job.created_at.desc()).all()
    result = []
    for job in jobs:
        count = (
            db.query(models.Application)
            .filter(
                models.Application.job_id == job.id,
                models.Application.status == "accepted",
            )
            .count()
        )
        resp = schemas.JobResponse.model_validate(job)
        resp.active_applications = count
        result.append(resp)
    return result


@router.get("/{job_id}", response_model=schemas.JobResponse)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    count = (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
        )
        .count()
    )
    resp = schemas.JobResponse.model_validate(job)
    resp.active_applications = count
    return resp
