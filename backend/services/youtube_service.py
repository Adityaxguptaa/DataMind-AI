import re
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

CLOUD_BLOCK_MSG = (
    "YouTube is blocking transcript access from this server's IP address. "
    "This is a known limitation of cloud-hosted servers — YouTube restricts "
    "their caption API to browser/home connections. "
    "Try a different video, or use the app from a local environment."
)


def extract_video_id(url: str) -> Optional[str]:
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com/watch\?.*?v=([a-zA-Z0-9_-]{11})",
        r"^([a-zA-Z0-9_-]{11})$",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def format_timestamp(seconds: float) -> str:
    seconds = int(seconds)
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


async def fetch_transcript(video_id: str) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_transcript_sync, video_id)


def _fetch_transcript_sync(video_id: str) -> dict:
    from youtube_transcript_api import YouTubeTranscriptApi

    raw_segments = None
    language = "en"

    # Strategy 1: exact user pattern — fetch English directly
    try:
        raw_segments = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
        language = "en"
        logger.info(f"Fetched English transcript for {video_id}")
    except Exception as e:
        err = str(e).lower()
        if "429" in err or "too many requests" in err or "blocked" in err or "ip" in err.lower():
            raise ValueError(CLOUD_BLOCK_MSG)
        logger.warning(f"English transcript not available for {video_id}: {e}")

    # Strategy 2: list all available transcripts and try each
    if raw_segments is None:
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            available = list(transcript_list)

            # 2a. Try any manually-created transcript
            for t in available:
                if not t.is_generated:
                    try:
                        raw_segments = t.fetch()
                        language = t.language_code
                        logger.info(f"Fetched manual transcript ({language}) for {video_id}")
                        break
                    except Exception as e2:
                        err2 = str(e2).lower()
                        if "429" in err2 or "too many requests" in err2 or "blocked" in err2:
                            raise ValueError(CLOUD_BLOCK_MSG)

            # 2b. Try auto-generated
            if raw_segments is None:
                for t in available:
                    if t.is_generated:
                        try:
                            raw_segments = t.fetch()
                            language = t.language_code + "-auto"
                            logger.info(f"Fetched auto-generated transcript ({language}) for {video_id}")
                            break
                        except Exception as e3:
                            err3 = str(e3).lower()
                            if "429" in err3 or "too many requests" in err3 or "blocked" in err3:
                                raise ValueError(CLOUD_BLOCK_MSG)

            # 2c. Translate any available transcript to English
            if raw_segments is None and available:
                for t in available:
                    try:
                        if t.is_translatable:
                            translated = t.translate("en")
                            raw_segments = translated.fetch()
                            language = f"{t.language_code}->en"
                            logger.info(f"Translated transcript to English for {video_id}")
                            break
                    except Exception as e4:
                        err4 = str(e4).lower()
                        if "429" in err4 or "too many requests" in err4 or "blocked" in err4:
                            raise ValueError(CLOUD_BLOCK_MSG)

        except ValueError:
            raise
        except Exception as e:
            err = str(e).lower()
            if "429" in err or "too many requests" in err or "blocked" in err or "ip" in err:
                raise ValueError(CLOUD_BLOCK_MSG)
            logger.warning(f"list_transcripts failed for {video_id}: {e}")

    if raw_segments is None:
        raise ValueError(
            f"No transcript available for video '{video_id}'. "
            "The video may be private, age-restricted, or have captions disabled."
        )

    # Normalize segment format (dict or object from different API versions)
    def _to_dict(s) -> dict:
        if isinstance(s, dict):
            return {"text": s.get("text", ""), "start": float(s.get("start", 0)), "duration": float(s.get("duration", 0))}
        return {"text": getattr(s, "text", ""), "start": float(getattr(s, "start", 0)), "duration": float(getattr(s, "duration", 0))}

    segments = [_to_dict(s) for s in raw_segments]
    segments = [s for s in segments if s.get("text", "").strip()]

    if not segments:
        raise ValueError(f"Transcript for '{video_id}' exists but is empty.")

    total_duration = max((s["start"] + s["duration"] for s in segments), default=0)
    word_count = sum(len(s["text"].split()) for s in segments)

    # Fetch video metadata via oEmbed (lightweight, rarely blocked)
    title = f"YouTube Video ({video_id})"
    channel = "Unknown"
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
    try:
        import urllib.request, json as json_lib
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        with urllib.request.urlopen(oembed_url, timeout=5) as resp:
            data = json_lib.loads(resp.read())
            title = data.get("title", title)
            channel = data.get("author_name", channel)
            thumbnail_url = data.get("thumbnail_url", thumbnail_url)
    except Exception:
        pass

    return {
        "video_id": video_id,
        "title": title,
        "channel": channel,
        "thumbnail_url": thumbnail_url,
        "transcript_segments": segments,
        "total_duration_seconds": int(total_duration),
        "language": language,
        "word_count": word_count,
    }
