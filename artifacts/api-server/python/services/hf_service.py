"""
HuggingFace Playground service — powered by Groq LLMs.

All tasks are performed via Groq API (llama-3.3-70b / llama-4-scout) with
structured JSON prompts that match the original HuggingFace pipeline output
format exactly. No torch, transformers, or HF token required.
"""

import json
import time
import logging
import re
from services.gemini_client import generate_text

logger = logging.getLogger(__name__)

# ─── Model registry (UI display only) ────────────────────────────────────────

MODEL_MAP = {
    "sentiment":       ("sentiment-analysis",        "distilbert-base-uncased-finetuned-sst-2-english"),
    "summarization":   ("summarization",             "facebook/bart-large-cnn"),
    "ner":             ("ner",                       "dbmdz/bert-large-cased-finetuned-conll03-english"),
    "zero-shot":       ("zero-shot-classification",  "facebook/bart-large-mnli"),
    "translation-fr":  ("translation",               "Helsinki-NLP/opus-mt-en-fr"),
    "translation-de":  ("translation",               "Helsinki-NLP/opus-mt-en-de"),
    "translation-hi":  ("translation",               "Helsinki-NLP/opus-mt-en-hi"),
}

MODEL_INFO = {
    "sentiment":      {"name": "Sentiment Analysis",        "model": "distilbert-base-uncased-finetuned-sst-2-english",         "description": "Detect positive/negative sentiment in text"},
    "summarization":  {"name": "Text Summarization",        "model": "facebook/bart-large-cnn",                                 "description": "Summarize long text into concise paragraphs"},
    "ner":            {"name": "Named Entity Recognition",  "model": "dbmdz/bert-large-cased-finetuned-conll03-english",        "description": "Identify people, places, organizations in text"},
    "zero-shot":      {"name": "Zero-Shot Classification",  "model": "facebook/bart-large-mnli",                                "description": "Classify text into any custom categories without training"},
    "translation-fr": {"name": "Translation EN→FR",         "model": "Helsinki-NLP/opus-mt-en-fr",                              "description": "Translate English text to French"},
    "translation-de": {"name": "Translation EN→DE",         "model": "Helsinki-NLP/opus-mt-en-de",                              "description": "Translate English text to German"},
    "translation-hi": {"name": "Translation EN→HI",         "model": "Helsinki-NLP/opus-mt-en-hi",                              "description": "Translate English text to Hindi"},
}

# ─── Prompt builders ──────────────────────────────────────────────────────────

def _prompt_sentiment(text: str) -> str:
    return f"""Analyze the sentiment of the following text. Reply ONLY with a valid JSON object — no extra text, no markdown.

Format: {{"label": "POSITIVE" or "NEGATIVE", "score": <float 0.0-1.0>}}

Text: {text}"""


def _prompt_zero_shot(text: str, labels: list) -> str:
    labels_str = ", ".join(f'"{l}"' for l in labels)
    return f"""Classify the following text into the given categories. Assign a probability score to each label (all scores must sum to 1.0). Reply ONLY with a valid JSON object — no extra text, no markdown.

Format: {{"labels": [{labels_str}], "scores": [<float>, ...]}}

Text: {text}"""


def _prompt_ner(text: str) -> str:
    return f"""Extract all named entities from the following text. For each entity include: entity_group (one of PER, ORG, LOC, MISC), word, score (confidence 0.0-1.0), start (char index), end (char index). Reply ONLY with a valid JSON object — no extra text, no markdown.

Format: {{"entities": [{{"entity_group": "PER", "word": "...", "score": 0.99, "start": 0, "end": 4}}, ...]}}

Text: {text}"""


def _prompt_summarization(text: str) -> str:
    return f"""Summarize the following text in 2-3 concise sentences. Reply ONLY with a valid JSON object — no extra text, no markdown.

Format: {{"summary_text": "..."}}

Text: {text}"""


def _prompt_translation(text: str, lang_code: str) -> str:
    lang_names = {"fr": "French", "de": "German", "hi": "Hindi"}
    lang = lang_names.get(lang_code, lang_code)
    return f"""Translate the following English text to {lang}. Reply ONLY with a valid JSON object — no extra text, no markdown.

Format: {{"translation_text": "..."}}

Text: {text}"""


# ─── JSON extraction ──────────────────────────────────────────────────────────

def _extract_json(raw: str) -> dict:
    """Extract the first JSON object from an LLM response."""
    # Strip markdown code fences
    raw = re.sub(r"```(?:json)?", "", raw).strip()
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start < 0 or end <= start:
        return {}
    try:
        return json.loads(raw[start:end])
    except Exception:
        # Fallback: escape stray control characters
        cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", raw[start:end])
        try:
            return json.loads(cleaned)
        except Exception:
            return {}


# ─── Task dispatcher ──────────────────────────────────────────────────────────

async def run_inference(task: str, input_text: str, extra_params: dict = {}, labels: list = None) -> dict:
    if task not in MODEL_MAP:
        raise ValueError(f"Unknown task: {task}. Available: {list(MODEL_MAP.keys())}")
    if not input_text or not input_text.strip():
        raise ValueError("Input text cannot be empty")

    start = time.time()

    # Build task-specific prompt
    if task == "sentiment":
        prompt = _prompt_sentiment(input_text)
    elif task == "zero-shot":
        candidate_labels = labels or (extra_params or {}).get("labels", ["positive", "negative", "neutral"])
        if isinstance(candidate_labels, str):
            candidate_labels = [l.strip() for l in candidate_labels.split(",") if l.strip()]
        prompt = _prompt_zero_shot(input_text, candidate_labels)
    elif task == "ner":
        prompt = _prompt_ner(input_text)
    elif task == "summarization":
        prompt = _prompt_summarization(input_text)
    elif task.startswith("translation"):
        lang_code = task.split("-")[1]
        prompt = _prompt_translation(input_text, lang_code)
    else:
        raise ValueError(f"Unhandled task: {task}")

    raw_response = await generate_text(prompt, max_tokens=1024)
    parsed = _extract_json(raw_response)

    # Validate / normalise each task's output
    if task == "sentiment":
        result = {
            "label": str(parsed.get("label", "UNKNOWN")).upper(),
            "score": float(parsed.get("score", 0.5)),
        }
    elif task == "zero-shot":
        labels_out = parsed.get("labels", candidate_labels)
        scores_out = parsed.get("scores", [])
        # Ensure score count matches label count
        if len(scores_out) != len(labels_out):
            equal = round(1.0 / max(len(labels_out), 1), 4)
            scores_out = [equal] * len(labels_out)
        result = {
            "labels": labels_out,
            "scores": [float(s) for s in scores_out],
        }
    elif task == "ner":
        entities = parsed.get("entities", [])
        result = {
            "entities": [
                {
                    "entity_group": e.get("entity_group", "MISC"),
                    "word": e.get("word", ""),
                    "score": float(e.get("score", 0.9)),
                    "start": int(e.get("start", 0)),
                    "end": int(e.get("end", 0)),
                }
                for e in entities
                if isinstance(e, dict)
            ]
        }
    elif task == "summarization":
        result = {"summary_text": parsed.get("summary_text", raw_response[:500])}
    elif task.startswith("translation"):
        result = {"translation_text": parsed.get("translation_text", raw_response[:500])}
    else:
        result = {"output": raw_response}

    duration_ms = int((time.time() - start) * 1000)
    model_name = MODEL_MAP[task][1]
    logger.info(f"HF playground {task} completed in {duration_ms}ms (via Groq)")
    return {"result": result, "duration_ms": duration_ms, "model": model_name, "task": task}


# ─── Models list ─────────────────────────────────────────────────────────────

def get_available_models() -> list:
    return [
        {"task_id": task_id, **info}
        for task_id, info in MODEL_INFO.items()
    ]
