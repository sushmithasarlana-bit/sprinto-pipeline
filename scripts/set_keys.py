"""Enter API keys without ever showing them, check each one, and save them.

    .venv/bin/python scripts/set_keys.py

- Keys are typed into hidden prompts (nothing is echoed). Press Enter to keep a value already in .env.
- Each key is checked with a free call; only OK / FAILED and non-secret facts (e.g. searches left) are printed.
- Values are written to .env (git-ignored) and, if you agree, to this repo's GitHub Actions secrets
  so the weekly run and the dashboard's Run button can use them.
"""
from __future__ import annotations

import getpass
import subprocess
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
REPO = "sushmithasarlana-bit/sprinto-pipeline"

SECRET_KEYS = ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "HUNTER_API_KEY", "RESEND_API_KEY"]
PLAIN_KEYS = ["MY_EMAIL", "SENDER_NAME"]
GITHUB_SECRETS = ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "HUNTER_API_KEY", "DATABASE_URL", "RESEND_API_KEY",
                  "RESEND_FROM", "MY_EMAIL"]
GITHUB_VARIABLES = ["AI_PROVIDER"]


def read_env() -> tuple[list[str], dict[str, str]]:
    lines = ENV.read_text(encoding="utf-8").splitlines() if ENV.exists() else []
    values = {}
    for line in lines:
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            values[k.strip()] = v.strip()
    return lines, values


def write_env(lines: list[str], values: dict[str, str]) -> None:
    seen, out = set(), []
    for line in lines:
        k = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else None
        if k and k in values:
            out.append(f"{k}={values[k]}")
            seen.add(k)
        else:
            out.append(line)
    out += [f"{k}={v}" for k, v in values.items() if k not in seen]
    ENV.write_text("\n".join(out) + "\n", encoding="utf-8")
    ENV.chmod(0o600)


def check_gemini(key: str, model: str) -> str:
    try:
        r = requests.get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
                         headers={"x-goog-api-key": key}, timeout=20)
    except requests.RequestException as e:
        return f"FAILED (network: {type(e).__name__})"
    if not r.ok:
        return f"FAILED (HTTP {r.status_code}: {r.json().get('error', {}).get('status', '') if r.headers.get('content-type', '').startswith('application/json') else ''})"
    names = [m.get("name", "").removeprefix("models/") for m in r.json().get("models", [])]
    return "OK" + ("" if model in names else f" (but model '{model}' is not listed for this key)")


def check_openrouter(key: str) -> str:
    h = {"Authorization": f"Bearer {key}"}
    try:
        r = requests.get("https://openrouter.ai/api/v1/key", headers=h, timeout=20)
        if not r.ok:
            return f"FAILED (HTTP {r.status_code})"
        c = requests.get("https://openrouter.ai/api/v1/credits", headers=h, timeout=20)
    except requests.RequestException as e:
        return f"FAILED (network: {type(e).__name__})"
    try:
        d = c.json()["data"]
        left = float(d["total_credits"]) - float(d["total_usage"])
        note = "" if left >= 0.5 else "  <- low: top up at openrouter.ai/settings/credits (about $1-2 is plenty)"
        return f"OK (balance ${left:.2f}){note}"
    except (KeyError, TypeError, ValueError):
        return "OK (balance not readable with this key)"


def check_hunter(key: str) -> str:
    try:
        r = requests.get("https://api.hunter.io/v2/account", params={"api_key": key}, timeout=20)
    except requests.RequestException as e:
        return f"FAILED (network: {type(e).__name__})"
    if not r.ok:
        return f"FAILED (HTTP {r.status_code})"
    try:
        s = r.json()["data"]["requests"]["searches"]
        return f"OK ({int(s['available']) - int(s['used'])} of {s['available']} searches left this month)"
    except (KeyError, TypeError, ValueError):
        return "OK (could not read the search allowance)"


def check_resend(key: str) -> str:
    # A sending-only key cannot call any read endpoint, so only the format is checked here.
    return "looks OK (starts with re_); a real send will confirm it" if key.startswith("re_") else \
        "WARNING: Resend keys start with re_"


def main() -> int:
    lines, values = read_env()
    print("Press Enter to keep a value that is already saved. Secret keys are hidden while you type.\n")
    for k in SECRET_KEYS:
        has = " [saved]" if values.get(k) else ""
        v = getpass.getpass(f"{k}{has}: ").strip()
        if v:
            values[k] = v
    for k in PLAIN_KEYS:
        cur = values.get(k, "")
        v = input(f"{k}{f' [{cur}]' if cur else ''}: ").strip()
        if v:
            values[k] = v
    values.setdefault("RESEND_FROM", "Sprinto Outreach <onboarding@resend.dev>")
    if not values.get("RESEND_FROM"):
        values["RESEND_FROM"] = "Sprinto Outreach <onboarding@resend.dev>"
    if values.get("HUNTER_API_KEY"):
        values["HUNTER_MODE"] = "live"
    # Prefer Google's Gemini API (as in the reference); OpenRouter only if its key is set and Gemini's fails.
    gemini_ok = bool(values.get("GEMINI_API_KEY")) and \
        check_gemini(values["GEMINI_API_KEY"], values.get("GEMINI_MODEL") or "gemini-3.8-flash").startswith("OK")
    values["AI_PROVIDER"] = "gemini" if gemini_ok or not values.get("OPENROUTER_API_KEY") else "openrouter"

    print("\nChecking keys (values are never printed):")
    model = values.get("GEMINI_MODEL") or "gemini-3.8-flash"
    print("  AI provider:", values["AI_PROVIDER"])
    if values.get("OPENROUTER_API_KEY"):
        print("  OpenRouter:", check_openrouter(values["OPENROUTER_API_KEY"]))
    if values.get("GEMINI_API_KEY"):
        print("  Gemini :", check_gemini(values["GEMINI_API_KEY"], model))
    if values.get("HUNTER_API_KEY"):
        print("  Hunter :", check_hunter(values["HUNTER_API_KEY"]))
    if values.get("RESEND_API_KEY"):
        print("  Resend :", check_resend(values["RESEND_API_KEY"]))
    print("  MY_EMAIL:", values.get("MY_EMAIL") or "MISSING (every email goes only to this address)")

    write_env(lines, values)
    print(f"\nSaved to {ENV.name} (git-ignored).")

    if input("\nAlso save them as GitHub Actions secrets for your repo? [Y/n]: ").strip().lower() in ("", "y", "yes"):
        for k in GITHUB_SECRETS:
            if not values.get(k):
                print(f"  {k:<18} skipped (empty)")
                continue
            r = subprocess.run(["gh", "secret", "set", k, "--repo", REPO], input=values[k], text=True,
                               capture_output=True)
            print(f"  {k:<18} {'saved' if r.returncode == 0 else 'FAILED: ' + r.stderr.strip()[:120]}")
        for k in GITHUB_VARIABLES:
            r = subprocess.run(["gh", "variable", "set", k, "--repo", REPO, "--body", values[k]], text=True,
                               capture_output=True)
            print(f"  {k:<18} {'saved as variable' if r.returncode == 0 else 'FAILED: ' + r.stderr.strip()[:120]}")
    print("\nDone. Tell Claude in chat that the keys are in (never paste the keys themselves).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
