import ast
import math
import logging
import asyncio
import re
import httpx
from typing import Any

logger = logging.getLogger(__name__)


def ddg_search(query: str) -> str:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
        if not results:
            return "No results found."
        formatted = "\n\n".join([
            f"Title: {r.get('title', '')}\nURL: {r.get('href', '')}\nSnippet: {r.get('body', '')}"
            for r in results
        ])
        return formatted
    except Exception as e:
        return f"Search error: {str(e)}"


def wiki_lookup(query: str) -> str:
    try:
        import wikipedia
        page = wikipedia.page(query, auto_suggest=True)
        return f"Title: {page.title}\n\n{page.summary[:2000]}\n\nURL: {page.url}"
    except Exception as e:
        return f"Wikipedia error: {str(e)}"


def safe_calculate(expression: str) -> str:
    allowed_names = {
        "abs": abs, "round": round,
        "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos,
        "tan": math.tan, "log": math.log, "log10": math.log10,
        "pi": math.pi, "e": math.e, "pow": pow,
    }
    try:
        tree = ast.parse(expression, mode='eval')
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if not isinstance(node.func, ast.Name) or node.func.id not in allowed_names:
                    return f"Calculation error: Function not allowed"
            elif isinstance(node, ast.Name):
                if node.id not in allowed_names:
                    return f"Calculation error: Name '{node.id}' not allowed"
        result = eval(compile(tree, '<string>', 'eval'), {"__builtins__": {}}, allowed_names)
        return f"Result: {result}"
    except Exception as e:
        return f"Calculation error: {str(e)}"


async def get_weather(location: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"https://wttr.in/{location}?format=j1")
            data = resp.json()
            current = data["current_condition"][0]
            temp_c = current.get("temp_C", "?")
            temp_f = current.get("temp_F", "?")
            humidity = current.get("humidity", "?")
            wind_kmph = current.get("windspeedKmph", "?")
            condition = current.get("weatherDesc", [{}])[0].get("value", "?")
            return f"Weather in {location}: {condition}, {temp_c}°C ({temp_f}°F), Humidity: {humidity}%, Wind: {wind_kmph} km/h"
    except Exception as e:
        return f"Weather lookup error: {str(e)}"


async def summarize_url(url: str) -> str:
    try:
        from services.gemini_client import generate_text
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(url)
            html = resp.text
        text = re.sub('<.*?>', '', html)
        text = re.sub(r'\s+', ' ', text).strip()[:3000]
        summary = await generate_text(f"Summarize this webpage content in 3-4 sentences:\n\n{text}")
        return summary
    except Exception as e:
        return f"URL summarize error: {str(e)}"


TOOLS = {
    "web_search": {"name": "web_search", "description": "Search the web with DuckDuckGo. Input: search query string.", "func": ddg_search, "is_async": False},
    "wikipedia": {"name": "wikipedia", "description": "Look up information on Wikipedia. Input: topic to look up.", "func": wiki_lookup, "is_async": False},
    "calculator": {"name": "calculator", "description": "Evaluate math expressions. Input: math expression like '2+2' or 'sqrt(16)'.", "func": safe_calculate, "is_async": False},
    "weather": {"name": "weather", "description": "Get current weather for a location. Input: city name or location.", "func": get_weather, "is_async": True},
    "url_summarizer": {"name": "url_summarizer", "description": "Fetch and summarize a webpage. Input: full URL.", "func": summarize_url, "is_async": True},
}


async def execute_tool(tool_name: str, tool_input: str) -> str:
    tool = TOOLS.get(tool_name)
    if not tool:
        return f"Unknown tool: {tool_name}"
    try:
        if tool["is_async"]:
            result = await tool["func"](tool_input)
        else:
            result = await asyncio.to_thread(tool["func"], tool_input)
        return str(result)
    except Exception as e:
        return f"Tool error: {str(e)}"
