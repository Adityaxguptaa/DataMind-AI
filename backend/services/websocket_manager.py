import asyncio
import json
import logging
import redis.asyncio as aioredis
from fastapi import WebSocket
from typing import Dict
from config import settings

logger = logging.getLogger(__name__)

active_connections: Dict[str, WebSocket] = {}
_redis_client = None


def get_redis():
    global _redis_client
    if _redis_client is None:
        url = settings.redis_url
        if url.startswith("rediss://"):
            _redis_client = aioredis.from_url(url, ssl_cert_reqs=None)
        else:
            _redis_client = aioredis.from_url(url)
    return _redis_client


async def connect(analysis_id: str, websocket: WebSocket):
    await websocket.accept()
    active_connections[analysis_id] = websocket
    logger.info(f"WebSocket connected for analysis {analysis_id}")


async def disconnect(analysis_id: str):
    if analysis_id in active_connections:
        del active_connections[analysis_id]
        logger.info(f"WebSocket disconnected for analysis {analysis_id}")


async def publish_event(analysis_id: str, event: dict):
    try:
        r = get_redis()
        channel = f"ws:{analysis_id}"
        await r.publish(channel, json.dumps(event))
    except Exception as e:
        logger.warning(f"Redis publish error: {e}")
        ws = active_connections.get(analysis_id)
        if ws:
            try:
                await ws.send_json(event)
            except Exception:
                pass


async def listen_and_forward(analysis_id: str, websocket: WebSocket):
    try:
        r = get_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(f"ws:{analysis_id}")
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode()
                await websocket.send_text(data)
    except Exception as e:
        logger.warning(f"WebSocket listen error for {analysis_id}: {e}")
