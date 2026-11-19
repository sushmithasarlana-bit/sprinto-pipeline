"""Gemini wrapper: structured JSON output, on-disk cache in dev, retries, token logging.

Gemini only extracts and writes. It never makes a pipeline decision.

Two ways to reach the same Gemini Flash model (AI_PROVIDER in .env):
  gemini      Google's Gemini API with GEMINI_API_KEY (the default, as in the reference build)
  openrouter  Gemini Flash through OpenRouter with OPENROUTER_API_KEY. A fallback for Google keys the
              Gemini API refuses (401 ACCESS_TOKEN_TYPE_UNSUPPORTED).
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import TypeVar

import requests
from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from pipeline.config import CACHE_DIR, get_settings
from pipeline.usage import log_usage

log = logging.getLogger(__name__)

LLM_CACHE = CACHE_DIR / "gemini"
T = TypeVar("T", bound=BaseModel)
_client: genai.Client | None = None


@dataclass
class LLMResult:
    data: BaseModel | None
    raw_text: str
    tokens_in: int
    tokens_out: int
    cached: bool
    error: str | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        key = get_settings().gemini_api_key
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not set in .env")
        _client = genai.Client(api_key=key)
    return _client


def _cache_key(model: str, system: str, prompt: str, schema: type[BaseModel]) -> str:
    blob = json.dumps([model, system, prompt, schema.model_json_schema()], sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()


# ---------------------------------------------------------------- OpenRouter

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
RETRYABLE = (429, 500, 502, 503, 504)


class ProviderError(Exception):
    def __init__(self, code: int | None, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def inline_refs(schema: dict) -> dict:
    """Pydantic puts nested models under $defs and points at them with $ref. Inline them so the
    schema is self-contained for providers that don't resolve references."""
    defs = schema.get("$defs", {})

    def walk(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return walk(defs[node["$ref"].split("/")[-1]])
            return {k: walk(v) for k, v in node.items() if k != "$defs"}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


def strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        t = t.rsplit("```", 1)[0]
    return t.strip()


def _openrouter(model: str, system: str, prompt: str, schema: type[BaseModel], temperature: float,
                max_tokens: int) -> tuple[str, int, int]:
    """One chat/completions call with a JSON schema. Returns (text, tokens_in, tokens_out)."""
    key = get_settings().openrouter_api_key
    if not key:
        raise ProviderError(None, "OPENROUTER_API_KEY is not set in .env")
    try:
        r = requests.post(OPENROUTER_URL, timeout=120, headers={
            "Authorization": f"Bearer {key}", "Content-Type": "application/json", "X-Title": "Sprinto Outreach Pipeline"},
            json={
                "model": model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                "response_format": {"type": "json_schema", "json_schema": {
                    "name": schema.__name__, "strict": False, "schema": inline_refs(schema.model_json_schema())}},
                "temperature": temperature,
                # Without a cap OpenRouter reserves credit for the model's maximum output and refuses (402)
                # on a small balance. Long enough for the extractor's JSON.
                "max_tokens": max_tokens,
                # Gemini 3.8 Flash on OpenRouter always reasons ("none" is refused) and its reasoning tokens
                # count against max_tokens; at the default effort a short cap returns an empty answer.
                "reasoning": {"effort": get_settings().openrouter_reasoning},
            })
    except requests.RequestException as e:
        raise ProviderError(None, f"network error: {type(e).__name__}") from None
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if not r.ok or body.get("error"):
        code = r.status_code if not r.ok else (body.get("error") or {}).get("code")
        msg = (body.get("error") or {}).get("message") or r.text[:200]
        hint = " (not enough OpenRouter credit)" if code == 402 else " (key not accepted)" if code == 401 else ""
        raise ProviderError(code if isinstance(code, int) else None, f"HTTP {code}: {msg}{hint}"[:400])
    choice = (body.get("choices") or [{}])[0]
    text = strip_fences((choice.get("message") or {}).get("content") or "")
    if not text:
        raise ProviderError(None, f"empty response ({choice.get('finish_reason') or 'no text'})")
    usage = body.get("usage") or {}
    return text, int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0)


# ---------------------------------------------------------------- public API

def generate_json(prompt: str, schema: type[T], *, system: str, stage: str,
                  temperature: float = 0.0, use_cache: bool | None = None) -> LLMResult:
    """Call Gemini in JSON mode with a pydantic response schema. Never raises on API failure."""
    settings = get_settings()
    openrouter = settings.ai_provider == "openrouter"
    model = f"openrouter:{settings.openrouter_model}" if openrouter else settings.gemini_model
    if use_cache is None:
        use_cache = settings.is_dev
    path = LLM_CACHE / f"{_cache_key(model, system, prompt, schema)}.json"
    if use_cache and path.exists():
        c = json.loads(path.read_text(encoding="utf-8"))
        log_usage("gemini", stage=stage, model=model, tokens_in=c["tokens_in"], tokens_out=c["tokens_out"],
                  cached=True)
        return LLMResult(schema.model_validate_json(c["text"]), c["text"], c["tokens_in"], c["tokens_out"], True)

    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=temperature,
    )
    last_err = None
    for attempt in range(3):          # first try + 2 retries
        if openrouter:
            try:
                text, t_in, t_out = _openrouter(settings.openrouter_model, system, prompt, schema, temperature,
                                                settings.openrouter_max_tokens)
                data = schema.model_validate_json(text)
                log_usage("gemini", stage=stage, model=model, tokens_in=t_in, tokens_out=t_out)
                if use_cache:
                    LLM_CACHE.mkdir(parents=True, exist_ok=True)
                    path.write_text(json.dumps({"text": text, "tokens_in": t_in, "tokens_out": t_out}),
                                    encoding="utf-8")
                return LLMResult(data, text, t_in, t_out, False)
            except ProviderError as e:
                last_err = e.message
                if e.code is not None and e.code not in RETRYABLE:
                    break
            except ValueError as e:  # schema validation of the model's JSON
                last_err = f"invalid JSON from model: {str(e)[:200]}"
            if attempt < 2:
                time.sleep(2 * (2 ** attempt))
            continue
        try:
            resp = _get_client().models.generate_content(model=model, contents=prompt, config=config)
            um = resp.usage_metadata
            t_in = (um.prompt_token_count or 0) if um else 0
            t_out = ((um.candidates_token_count or 0) + (getattr(um, "thoughts_token_count", 0) or 0)) if um else 0
            text = resp.text or ""
            data = schema.model_validate_json(text)
            log_usage("gemini", stage=stage, model=model, tokens_in=t_in, tokens_out=t_out)
            if use_cache:
                LLM_CACHE.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps({"text": text, "tokens_in": t_in, "tokens_out": t_out}), encoding="utf-8")
            return LLMResult(data, text, t_in, t_out, False)
        except errors.APIError as e:
            last_err = f"APIError {e.code}: {e.message}"
            if e.code not in (429, 500, 502, 503, 504):
                break
        except ValueError as e:      # schema validation of the model's JSON
            last_err = f"invalid JSON from model: {e}"
        if attempt < 2:
            time.sleep(2 * (2 ** attempt))
    log.warning("Gemini call failed (%s): %s", stage, last_err)
    log_usage("gemini", stage=stage, model=model, ok=False, error=last_err)
    return LLMResult(None, "", 0, 0, False, last_err)
