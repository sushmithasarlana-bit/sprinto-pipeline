"""OpenRouter provider: schema inlining, fence stripping, request shape, and error handling (no network)."""
import json

import pytest

from pipeline import llm
from pipeline.config import get_settings
from pipeline.extract import Extraction
from pipeline.write import EmailDraft


def test_inline_refs_removes_every_ref_and_defs():
    for model in (Extraction, EmailDraft):
        s = json.dumps(llm.inline_refs(model.model_json_schema()))
        assert "$ref" not in s and "$defs" not in s


def test_strip_fences():
    assert llm.strip_fences('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert llm.strip_fences('  {"a": 1} ') == '{"a": 1}'


class FakeResp:
    def __init__(self, status, body):
        self.status_code, self._body = status, body
        self.ok = 200 <= status < 300
        self.headers = {"content-type": "application/json"}
        self.text = json.dumps(body)

    def json(self):
        return self._body


@pytest.fixture
def openrouter_env(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("PIPELINE_ENV", "prod")          # no disk cache in tests
    monkeypatch.setattr(llm, "log_usage", lambda *a, **k: None)
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_request_shape_and_success(openrouter_env, monkeypatch):
    sent = {}
    draft = {"pain_points": [{"text": "p", "evidence_id": "E1"}], "hook": {"text": "x", "evidence_id": "E1"},
             "subject": "s", "body": "b", "claims": []}

    def fake_post(url, **kw):
        sent.update(url=url, **kw)
        return FakeResp(200, {"choices": [{"message": {"content": "```json\n" + json.dumps(draft) + "\n```"}}],
                              "usage": {"prompt_tokens": 120, "completion_tokens": 40}})

    monkeypatch.setattr(llm.requests, "post", fake_post)
    res = llm.generate_json("prompt", EmailDraft, system="sys", stage="write")
    body = sent["json"]
    assert sent["url"] == llm.OPENROUTER_URL
    assert sent["headers"]["Authorization"] == "Bearer test-key"
    assert body["model"] == "google/gemini-3.8-flash"
    assert body["max_tokens"] == 4000
    assert body["response_format"]["type"] == "json_schema"
    assert "$ref" not in json.dumps(body["response_format"])
    assert res.data is not None and res.data.hook.evidence_id == "E1"
    assert (res.tokens_in, res.tokens_out) == (120, 40)


def test_402_is_not_retried_and_never_raises(openrouter_env, monkeypatch):
    calls = []

    def fake_post(url, **kw):
        calls.append(1)
        return FakeResp(402, {"error": {"code": 402, "message": "Insufficient credits"}})

    monkeypatch.setattr(llm.requests, "post", fake_post)
    res = llm.generate_json("prompt", EmailDraft, system="sys", stage="write")
    assert res.data is None and "not enough OpenRouter credit" in res.error
    assert len(calls) == 1


def test_429_is_retried(openrouter_env, monkeypatch):
    calls = []

    def fake_post(url, **kw):
        calls.append(1)
        return FakeResp(429, {"error": {"code": 429, "message": "rate limited"}})

    monkeypatch.setattr(llm.requests, "post", fake_post)
    res = llm.generate_json("prompt", EmailDraft, system="sys", stage="write")
    assert res.data is None and len(calls) == 3
