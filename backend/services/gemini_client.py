import asyncio
import json
import logging
import re
from groq import AsyncGroq
from config import settings

logger = logging.getLogger(__name__)

_client = None

# Only active, non-decommissioned Groq models (as of May 2026)
MODEL_CANDIDATES = [
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.1-8b-instant",
]

_model_index = 0


def get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.groq_api_key)
    return _client


def _current_model() -> str:
    return MODEL_CANDIDATES[_model_index % len(MODEL_CANDIDATES)]


def _rotate_model():
    global _model_index
    _model_index = (_model_index + 1) % len(MODEL_CANDIDATES)
    logger.warning(f"Rotated to Groq model: {_current_model()}")


def robust_json_parse(raw: str) -> dict:
    """Parse JSON from LLM output, gracefully handling control characters inside strings."""
    # Find outermost JSON object
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start < 0 or end <= start:
        return {}
    json_str = raw[start:end]

    # Attempt 1: direct parse
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        pass

    # Attempt 2: escape control characters inside JSON string values
    def escape_control_chars(s: str) -> str:
        result = []
        in_string = False
        i = 0
        while i < len(s):
            ch = s[i]
            if ch == "\\" and in_string:
                result.append(ch)
                i += 1
                if i < len(s):
                    result.append(s[i])
            elif ch == '"':
                in_string = not in_string
                result.append(ch)
            elif in_string and ord(ch) < 32:
                _map = {"\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f"}
                result.append(_map.get(ch, f"\\u{ord(ch):04x}"))
            else:
                result.append(ch)
            i += 1
        return "".join(result)

    try:
        return json.loads(escape_control_chars(json_str))
    except json.JSONDecodeError:
        pass

    # Attempt 3: strip all problematic control chars except standard whitespace
    try:
        cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", json_str)
        return json.loads(cleaned)
    except Exception:
        pass

    return {}


async def generate_text(prompt: str, max_retries: int = 4, max_tokens: int = 4096) -> str:
    client = get_client()
    last_err = None
    tried: set = set()

    for attempt in range(max_retries):
        model = _current_model()
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=0.3,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            last_err = e
            err_str = str(e)
            err = err_str.lower()
            logger.warning(f"Groq attempt {attempt+1} with {model} failed: {err_str[:180]}")

            if "decommissioned" in err or "not found" in err or "404" in err:
                tried.add(model)
                _rotate_model()
                await asyncio.sleep(0.3)
            elif "rate" in err or "429" in err or "quota" in err or "capacity" in err or "overloaded" in err or "tokens per" in err:
                if model not in tried:
                    tried.add(model)
                    _rotate_model()
                    await asyncio.sleep(1)
                else:
                    await asyncio.sleep(min(5 * (attempt + 1), 30))
            elif "413" in err or "too large" in err or "payload" in err:
                # prompt too big for this model — rotate to a model with larger context
                tried.add(model)
                _rotate_model()
                await asyncio.sleep(0.3)
            else:
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                else:
                    raise

    raise last_err


async def generate_with_history(messages: list, system_prompt: str = "") -> str:
    client = get_client()
    groq_messages = []
    if system_prompt:
        groq_messages.append({"role": "system", "content": system_prompt})
    for msg in messages:
        role = "user" if msg.get("role") == "user" else "assistant"
        groq_messages.append({"role": role, "content": msg.get("content", "")})

    last_err = None
    for attempt in range(4):
        model = _current_model()
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=groq_messages,
                max_tokens=4096,
                temperature=0.5,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            last_err = e
            err = str(e).lower()
            logger.warning(f"Groq history attempt {attempt+1} with {model} failed: {str(e)[:180]}")
            if "decommissioned" in err or "not found" in err:
                _rotate_model()
                await asyncio.sleep(0.3)
            elif "rate" in err or "429" in err or "quota" in err or "capacity" in err or "tokens per" in err:
                _rotate_model()
                await asyncio.sleep(3)
            elif attempt < 3:
                await asyncio.sleep(2 ** attempt)
            else:
                raise

    raise last_err or RuntimeError("Groq unavailable after retries")
