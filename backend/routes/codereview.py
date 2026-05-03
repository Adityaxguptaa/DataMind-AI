import logging
import json
import os
import base64
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from models.db_models import User
from auth.dependencies import get_current_user
from pydantic import BaseModel
from services.gemini_client import generate_text, get_client, robust_json_parse
from typing import Optional, List

router = APIRouter(prefix="/api", tags=["code-review"])
logger = logging.getLogger(__name__)

VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


class CodeReviewRequest(BaseModel):
    code: str
    language: str = "python"
    checks: List[str] = ["vulnerabilities", "quality", "suggestions", "plagiarism_risk"]


class CodeExplainRequest(BaseModel):
    code: str
    language: str = "python"
    question: Optional[str] = None


class CodeComplexityRequest(BaseModel):
    code: str
    language: str = "python"


class GenerateTestsRequest(BaseModel):
    code: str
    language: str = "python"
    framework: str = "pytest"


@router.post("/codereview/analyze")
async def review_code(
    req: CodeReviewRequest,
    current_user: User = Depends(get_current_user),
):
    prompt = f"""You are a world-class code reviewer, security researcher, and software architect. Perform an exhaustive analysis.

LANGUAGE: {req.language}
CODE:
```{req.language}
{req.code[:10000]}
```

Provide the MOST DETAILED analysis possible as ONLY valid JSON:
{{
  "overall_score": <0-100>,
  "language_detected": "{req.language}",
  "lines_of_code": <integer>,
  "summary": "<3-4 sentence technical overview of code quality>",
  "vulnerabilities": [
    {{
      "severity": "<critical|high|medium|low|info>",
      "cwe_id": "<CWE-XXX if applicable>",
      "title": "...",
      "description": "<detailed explanation of the vulnerability>",
      "line_hint": "<which function/line is affected>",
      "attack_vector": "<how this could be exploited>",
      "fix": "<specific code fix>",
      "fix_example": "<code example of the fix>"
    }}
  ],
  "code_quality": {{
    "readability": <0-10>,
    "maintainability": <0-10>,
    "performance": <0-10>,
    "security": <0-10>,
    "testability": <0-10>,
    "documentation": <0-10>,
    "solid_principles": <0-10>,
    "comments": ["<specific comment about quality aspect>"]
  }},
  "complexity_analysis": {{
    "cyclomatic_complexity": "<low|medium|high|very_high>",
    "cognitive_complexity": "<low|medium|high>",
    "nested_depth": <max nesting depth>,
    "long_methods": ["<method name if too long>"],
    "explanation": "<brief complexity assessment>"
  }},
  "performance_issues": [
    {{"severity": "<high|medium|low>", "issue": "<description>", "location": "<where>", "fix": "<how to fix>"}}
  ],
  "suggestions": [
    {{
      "type": "<refactor|performance|style|security|design|testing>",
      "priority": "<high|medium|low>",
      "title": "...",
      "description": "<detailed suggestion>",
      "improved_snippet": "<code snippet showing the improvement>"
    }}
  ],
  "plagiarism_risk": {{
    "risk_level": "<none|low|medium|high>",
    "explanation": "...",
    "originality_score": <0-100>,
    "similar_patterns": ["<pattern that seems copied>"]
  }},
  "documentation_gaps": ["<what documentation is missing>"],
  "test_coverage_estimate": "<none|low|partial|good>",
  "design_patterns": ["<pattern used>"],
  "anti_patterns": ["<anti-pattern detected>"],
  "dependencies": ["<external dependency detected>"],
  "positive_aspects": ["<what is done well>"],
  "best_practices_violations": ["<violation with severity>"],
  "improved_code": "<complete refactored version with all suggestions applied, properly commented>",
  "diff_summary": ["<specific change made in improved version>"]
}}"""
    try:
        raw = await generate_text(prompt, max_tokens=6000)
        result = robust_json_parse(raw)
        if not result:
            result = {"summary": raw[:300], "overall_score": 50}
    except Exception as e:
        logger.error(f"Code review failed: {e}")
        raise HTTPException(status_code=500, detail="Code review failed. Please try again.")
    return result


@router.post("/codereview/explain")
async def explain_code(
    req: CodeExplainRequest,
    current_user: User = Depends(get_current_user),
):
    question = req.question or "Explain what this code does in detail"
    prompt = f"""You are a senior software engineer and teacher. Explain this {req.language} code clearly.

CODE:
```{req.language}
{req.code[:8000]}
```

Question: {question}

Provide explanation as ONLY valid JSON:
{{
  "tldr": "<one sentence summary>",
  "purpose": "<what does this code do and why>",
  "how_it_works": "<step-by-step explanation of the logic>",
  "key_concepts": ["<concept used>"],
  "inputs": ["<input name: type - description>"],
  "outputs": "<what the code returns or produces>",
  "edge_cases": ["<edge case to be aware of>"],
  "prerequisites": ["<knowledge needed to understand this code>"],
  "line_by_line": [
    {{"lines": "<line range>", "explanation": "<what these lines do>"}}
  ],
  "real_world_use_case": "<practical example of when/how this would be used>",
  "analogies": "<simple real-world analogy to explain the concept>"
}}"""
    try:
        raw = await generate_text(prompt)
        result = robust_json_parse(raw)
        return result if result else {"tldr": raw[:200], "purpose": raw[:500]}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Explanation failed.")


@router.post("/codereview/complexity")
async def analyze_complexity(
    req: CodeComplexityRequest,
    current_user: User = Depends(get_current_user),
):
    prompt = f"""Analyze the time and space complexity of this {req.language} code in detail.

CODE:
```{req.language}
{req.code[:8000]}
```

Respond ONLY with valid JSON:
{{
  "overall_time_complexity": "<Big O notation, e.g. O(n log n)>",
  "overall_space_complexity": "<Big O notation, e.g. O(n)>",
  "complexity_rating": "<excellent|good|acceptable|poor|terrible>",
  "functions": [
    {{
      "name": "<function/method name>",
      "time_complexity": "<Big O>",
      "space_complexity": "<Big O>",
      "explanation": "<why this complexity>",
      "bottleneck": <true|false>
    }}
  ],
  "bottlenecks": ["<specific bottleneck identified>"],
  "optimizations": [
    {{
      "description": "<what to optimize>",
      "current": "<current approach>",
      "optimized": "<better approach>",
      "improvement": "<from O(n²) to O(n log n)>",
      "code_example": "<optimized code snippet>"
    }}
  ],
  "memory_leaks": ["<potential memory leak>"],
  "scalability_concerns": ["<scalability issue>"],
  "benchmark_estimate": "<rough estimate of performance at scale>"
}}"""
    try:
        raw = await generate_text(prompt)
        result = robust_json_parse(raw)
        return result if result else {"overall_time_complexity": "Unknown"}
    except Exception:
        raise HTTPException(status_code=500, detail="Complexity analysis failed.")


@router.post("/codereview/generate-tests")
async def generate_tests(
    req: GenerateTestsRequest,
    current_user: User = Depends(get_current_user),
):
    prompt = f"""Generate comprehensive unit tests for this {req.language} code using {req.framework}.

CODE:
```{req.language}
{req.code[:8000]}
```

Generate thorough test cases covering: happy path, edge cases, error cases, boundary values.

Respond ONLY with valid JSON:
{{
  "test_framework": "{req.framework}",
  "test_file": "<complete test file as a string>",
  "test_cases": [
    {{
      "name": "<test name>",
      "category": "<happy_path|edge_case|error_case|boundary>",
      "description": "<what this tests>",
      "assertions": <number of assertions>
    }}
  ],
  "coverage_estimate": "<percentage>",
  "mocking_needed": ["<what needs to be mocked>"],
  "setup_instructions": "<how to run these tests>"
}}"""
    try:
        raw = await generate_text(prompt, max_tokens=6000)
        result = robust_json_parse(raw)
        return result if result else {"test_file": raw}
    except Exception:
        raise HTTPException(status_code=500, detail="Test generation failed.")


@router.post("/codereview/analyze-image")
async def review_code_from_image(
    file: UploadFile = File(...),
    language: str = Form(default="auto-detect"),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large. Max 20MB.")
    b64 = base64.b64encode(content).decode()
    mime = file.content_type or "image/jpeg"
    client = get_client()
    try:
        extract_response = await client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    {"type": "text", "text": f"Extract ALL code from this image EXACTLY as written. Preserve ALL indentation, spacing, and formatting. Return ONLY the raw code with no explanation. Detect the programming language: {language}."},
                ],
            }],
            max_tokens=4096,
            temperature=0.0,
        )
        extracted_code = extract_response.choices[0].message.content or ""
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image code extraction failed: {str(e)[:100]}")

    if not extracted_code.strip():
        raise HTTPException(status_code=400, detail="No code found in the image")

    detected_lang = language if language != "auto-detect" else "python"
    req = CodeReviewRequest(code=extracted_code, language=detected_lang)
    result = await review_code(req, current_user)
    result["extracted_code"] = extracted_code
    result["source"] = "image"
    return result


@router.post("/resume/analyze")
async def analyze_resume_legacy(
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(status_code=410, detail="Use /api/resume/full-scan instead")
