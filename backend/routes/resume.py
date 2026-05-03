import logging
import json
import os
import asyncio
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models.db_models import User
from auth.dependencies import get_current_user
from pydantic import BaseModel
from services.gemini_client import generate_text, robust_json_parse
from typing import Optional, List

router = APIRouter(prefix="/api/resume", tags=["resume"])
logger = logging.getLogger(__name__)


def _extract_resume_text(content: bytes, file_type: str, tmp_path: str) -> str:
    try:
        if file_type == "pdf":
            import fitz
            doc = fitz.open(tmp_path)
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
        elif file_type == "docx":
            from docx import Document as DocxDoc
            doc = DocxDoc(tmp_path)
            text = "\n".join(p.text for p in doc.paragraphs)
        elif file_type in ("txt", "text"):
            text = content.decode("utf-8", errors="ignore")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, DOCX, or TXT.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {str(e)}")
    return text[:8000]


class ResumeTextRequest(BaseModel):
    resume_text: str
    job_description: Optional[str] = None
    role: Optional[str] = None


class SectionSuggestRequest(BaseModel):
    section: str
    current_value: str
    context: Optional[str] = None
    job_description: Optional[str] = None
    role: Optional[str] = None


class GenerateATSRequest(BaseModel):
    structure: dict
    one_page: bool = True
    job_description: Optional[str] = None


async def _run_analysis(text: str, jd: Optional[str], role: Optional[str]) -> dict:
    jd_section = f"\nJOB DESCRIPTION:\n{jd[:2000]}" if jd else ""
    role_line = f"\nTarget Role: {role}" if role else ""
    prompt = f"""You are a senior HR expert and ATS specialist. Analyze this resume comprehensively.

RESUME:
{text}
{jd_section}{role_line}

Respond ONLY with valid JSON:
{{
  "overall_score": <0-100>,
  "ats_score": <0-100>,
  "shortlisting_probability": <0-100>,
  "jd_match_percentage": <0-100 or null>,
  "candidate_level": "<entry|junior|mid|senior|lead|principal>",
  "years_experience": <estimated years as number>,
  "summary": "<3-4 sentence executive assessment>",
  "strengths": ["<specific strength with evidence>"],
  "weaknesses": ["<specific weakness with impact>"],
  "skills_found": ["<skill>"],
  "skills_missing": ["<skill important for role>"],
  "red_flags": ["<potential concern>"],
  "interview_tips": ["<personalized tip>"],
  "rewritten_summary": "<stronger professional summary they should use>",
  "ats_keywords_missing": ["<important keyword not in resume>"],
  "formatting_issues": ["<formatting problem that hurts ATS parsing>"],
  "content_gaps": ["<important section or information missing>"]
}}"""
    raw = await generate_text(prompt)
    result = robust_json_parse(raw)
    return result if result else {"summary": raw[:500], "overall_score": 50}


async def _run_structure_extraction(text: str) -> dict:
    prompt = f"""Extract the structured data from this resume. Be precise and comprehensive.

RESUME:
{text}

Respond ONLY with valid JSON:
{{
  "contact": {{
    "name": "<full name>",
    "email": "<email>",
    "phone": "<phone>",
    "location": "<city, state/country>",
    "linkedin": "<linkedin URL or username>",
    "github": "<github URL or username>",
    "portfolio": "<portfolio/website URL>"
  }},
  "summary": "<professional summary if present, else empty string>",
  "skills": {{
    "technical": ["<skill>"],
    "soft": ["<soft skill>"],
    "tools": ["<tool/software>"],
    "languages": ["<programming language>"]
  }},
  "experience": [
    {{
      "id": "exp1",
      "title": "<job title>",
      "company": "<company name>",
      "duration": "<start - end>",
      "location": "<location>",
      "bullets": ["<achievement bullet>"]
    }}
  ],
  "education": [
    {{
      "id": "edu1",
      "degree": "<degree name>",
      "institution": "<institution name>",
      "year": "<graduation year>",
      "gpa": "<GPA if mentioned, else empty>",
      "honors": "<honors/awards if any>",
      "relevant_coursework": ["<course>"]
    }}
  ],
  "projects": [
    {{
      "id": "proj1",
      "name": "<project name>",
      "description": "<description>",
      "technologies": ["<tech>"],
      "link": "<URL if any>",
      "bullets": ["<key point>"]
    }}
  ],
  "certifications": ["<certification name and issuer>"],
  "awards": ["<award>"],
  "publications": ["<publication>"],
  "volunteer": ["<volunteer experience>"]
}}"""
    raw = await generate_text(prompt)
    return robust_json_parse(raw)


async def _run_checkpoints(text: str, jd: Optional[str], role: Optional[str]) -> list:
    jd_section = f"\nJOB DESCRIPTION:\n{jd[:1500]}" if jd else ""
    role_line = f"Target role: {role}" if role else ""
    prompt = f"""You are a professional resume coach. Generate specific, actionable improvement checkpoints for this resume.

RESUME:
{text}
{jd_section}
{role_line}

Generate 8-12 specific checkpoints. Each must reference actual content from the resume.

Respond ONLY with valid JSON:
{{
  "checkpoints": [
    {{
      "id": "cp1",
      "priority": "<high|medium|low>",
      "section": "<summary|experience|skills|education|projects|format|keywords|contact>",
      "type": "<rewrite|add|remove|strengthen|quantify|reorder>",
      "title": "<short descriptive title>",
      "description": "<2-3 sentences explaining what to change and why>",
      "current": "<exact text from resume that needs changing, or empty if adding>",
      "suggested": "<the improved version of the text>",
      "reason": "<specific reason this will improve the resume>",
      "ats_impact": "<high|medium|low>",
      "example_metric": "<if applicable, example of how to quantify this achievement>"
    }}
  ]
}}"""
    raw = await generate_text(prompt)
    data = robust_json_parse(raw)
    return data.get("checkpoints", [])


@router.post("/full-scan")
async def full_scan_resume(
    req: ResumeTextRequest,
    current_user: User = Depends(get_current_user),
):
    if not req.resume_text.strip():
        raise HTTPException(status_code=400, detail="Resume text is required")
    text = req.resume_text[:8000]
    analysis, structure, checkpoints = await asyncio.gather(
        _run_analysis(text, req.job_description, req.role),
        _run_structure_extraction(text),
        _run_checkpoints(text, req.job_description, req.role),
    )
    return {"analysis": analysis, "structure": structure, "checkpoints": checkpoints}


@router.post("/upload-scan")
async def upload_and_scan(
    file: UploadFile = File(...),
    job_description: str = Form(default=""),
    role: str = Form(default=""),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    fname = file.filename or "resume.pdf"
    ext = fname.rsplit(".", 1)[-1].lower()
    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        text = _extract_resume_text(content, ext, tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file")
    req = ResumeTextRequest(
        resume_text=text,
        job_description=job_description or None,
        role=role or None,
    )
    return await full_scan_resume(req, current_user)


@router.post("/suggest-section")
async def suggest_section(
    req: SectionSuggestRequest,
    current_user: User = Depends(get_current_user),
):
    jd_ctx = f"\nJob Description context: {req.job_description[:500]}" if req.job_description else ""
    role_ctx = f"\nTarget role: {req.role}" if req.role else ""
    add_ctx = f"\nAdditional context: {req.context}" if req.context else ""
    prompt = f"""You are a professional resume coach. Improve this specific resume section.

Section: {req.section}
Current content: "{req.current_value}"
{jd_ctx}{role_ctx}{add_ctx}

Provide an improved version that is:
- More impactful and results-focused
- ATS-optimized with relevant keywords
- Quantified where possible
- Professional and concise

Respond ONLY with valid JSON:
{{
  "suggestion": "<the improved text>",
  "reason": "<why this is better>",
  "keywords_added": ["<keyword>"],
  "tips": ["<additional tip for this section>"]
}}"""
    raw = await generate_text(prompt)
    result = robust_json_parse(raw)
    return result if result else {"suggestion": raw[:500], "reason": "AI suggestion"}


@router.post("/generate-ats")
async def generate_ats_resume(
    req: GenerateATSRequest,
    current_user: User = Depends(get_current_user),
):
    structure = req.structure
    jd_ctx = f"\nOptimize for this job description: {req.job_description[:800]}" if req.job_description else ""
    one_page_ctx = "Keep it to ONE PAGE maximum. Be concise." if req.one_page else "Can be up to 2 pages."

    prompt = f"""You are an expert ATS resume writer. Generate a perfectly formatted, ATS-optimized resume.

RESUME DATA:
{json.dumps(structure, indent=2)[:4000]}

INSTRUCTIONS:
- {one_page_ctx}
- Use clean, ATS-parseable formatting (no tables, columns, graphics)
- Use standard section headers that ATS systems recognize
- Prioritize quantified achievements with action verbs
- Include relevant keywords naturally
- Use simple bullet points (•)
- No fancy formatting, no columns
{jd_ctx}

Generate the complete ATS resume as plain text, then respond with JSON:
{{
  "ats_resume": "<complete formatted resume text using \\n for newlines>",
  "word_count": <integer>,
  "estimated_pages": <decimal like 0.8 or 1.0>,
  "ats_score_estimate": <0-100>,
  "improvements_made": ["<improvement applied>"],
  "keywords_included": ["<keyword>"]
}}"""
    raw = await generate_text(prompt)
    result = robust_json_parse(raw)
    if not result or not result.get("ats_resume"):
        return {"ats_resume": raw, "word_count": len(raw.split()), "estimated_pages": 1.0}
    return result


@router.post("/analyze")
async def analyze_resume(
    req: ResumeTextRequest,
    current_user: User = Depends(get_current_user),
):
    if not req.resume_text.strip():
        raise HTTPException(status_code=400, detail="Resume text required")
    return await _run_analysis(req.resume_text[:8000], req.job_description, req.role)


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    job_description: str = Form(default=""),
    role: str = Form(default=""),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    fname = file.filename or "resume.pdf"
    ext = fname.rsplit(".", 1)[-1].lower()
    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        text = _extract_resume_text(content, ext, tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file")
    req2 = ResumeTextRequest(resume_text=text, job_description=job_description or None, role=role or None)
    return await analyze_resume(req2, current_user)
