# Recreation report: independent build of the Sprinto outreach pipeline

**This copy:** repo `github.com/sushmithasarlana-bit/sprinto-pipeline` (private) · live dashboard https://sprinto-outreach-pipeline-xi.vercel.app · Neon project `sprinto-outreach-pipeline`
**Reference:** `github.com/varunagarwal-hub/sprinto-pipeline` · https://sprinto-outreach-delta.vercel.app (kept as the read-only git remote `upstream`; pushing to it is disabled)
**Case:** MESA PGP Cohort 4, Term 2, AI Case 2 "Cold Outreach, at Scale" (3 Nov 2026)

This document records what was audited, what was rebuilt, what was changed and why, what was tested (with results), and what is still limited. Everything marked "tested" below was run on 19 Nov 2026; nothing is claimed that was not run.

---

## 1. Audit summary

### Technology stack
| Layer | Technology |
|---|---|
| Pipeline | Python 3.12, `google-genai` (Gemini), `requests`, `beautifulsoup4`, `feedparser`, `psycopg` 3, `rapidfuzz`, `pydantic` |
| Database | Neon Postgres (13 tables, 7 plain-SQL migrations in `migrations/`) |
| Dashboard | Next.js 16.4 (App Router, server actions), React 19.3, Tailwind 4, shadcn/ui, Magic UI, GSAP, `@neondatabase/serverless` |
| AI | Gemini `gemini-3.8-flash`: extraction and writing only, never decisions |
| Contacts | Hunter.io Domain Search (case Option A) with a mock fixture |
| Email | Resend (the brief says Gmail; the reference chose Resend; this copy keeps Resend by the owner's choice) |
| Automation | GitHub Actions: weekly discovery run + "run on domains" dispatched from the dashboard |
| Hosting | Vercel (dashboard only; Vercel cannot crawl, so research runs in Python locally or on Actions) |

### Architecture (matches the components map)
```
Trigger (Run button / Monday cron / CLI)
  → Google News RSS ─► Stage 1 rules: Series A–C, ≤24 months, name parse, exclude list ─► ranked pool
  → batch of 20 by rank ─► resolve domain ─► crawl home + trust + careers (≤6 fetches)
  → Gemini extract (every fact = value + verbatim quote + URL + date; Python verifies each quote is on the page)
  → Python ICP gates ─► agent loop: fetch the page most likely to answer an unknown (≤3)  [loop: missing info]
  → qualified / qualified+review / flagged / dropped                         [loop: too few fits → next 20]
  → Hunter (1 search) + stage title rules ─► Gemini writes 2 pain points + email
  → code validator (name, ≤120 words, one ask, every number/proper noun grounded)
  → auto-send to MY_EMAIL, or hold for the dashboard human gates
  → edits, ratings, overrides, outcomes ─► feedback_events ─► learnings ─► next drafts  [loop: your edits teach]
Every decision, quote, URL and date is stored in Neon.
```
The principle stated on the map holds in code: **Gemini reads and writes; Python rules decide; a human sees only what the rules can't settle.**

### Blockers found during the audit (and how each was handled)
| Blocker | Resolution |
|---|---|
| Local Python was 3.9; the code needs 3.11+ | `uv` creates a Python 3.12 virtual env |
| `cryptography` 50 has no prebuilt wheel for Intel Macs, so install failed | `requirements.txt` pins `cryptography<49` on Intel macOS only |
| Three Gmail libraries in `requirements.txt` were never imported (the reference moved to Resend) | Removed; no code used them |
| Hard-coded owner repo in the dashboard's Run dispatch | Defaults to this repo; `GITHUB_REPO` still overrides |
| The owner's Google keys (`AQ.` prefix): two of three were refused by the Gemini API (401 `ACCESS_TOKEN_TYPE_UNSUPPORTED`) | Tested each key; the one that works is in use. OpenRouter added as an optional fallback provider (see §3) |
| `sprinto-outreach-pipeline.vercel.app` belongs to another Vercel account | Vercel assigned `sprinto-outreach-pipeline-xi.vercel.app` |
| Dashboard times rendered in UTC on Vercel (5.5 h behind for an India-based reviewer) | Fixed display zone `Asia/Kolkata` (override `NEXT_PUBLIC_TIME_ZONE`) |

---

## 2. Component inventory

### Pipeline (`pipeline/`)
| Module | Component-map box | Role |
|---|---|---|
| `gnews.py`, `stage1.py` | Google News · Shortlist | Funding headlines → regex gates → rank → pool; manual domain injection |
| `resolve.py` | (Shortlist) | Finds the company domain; accepts only when the homepage names the company and shares a topic word |
| `scraper.py`, `ats.py`, `http.py` | Scraper | Homepage, trust, careers pages; Greenhouse/Lever/Ashby job APIs; trust-vendor detection in raw HTML |
| `extract.py`, `llm.py` | Gemini Reader | Structured JSON with quotes; quote verification; provider switch (Gemini / OpenRouter) |
| `qualify.py` | Qualifier · ICP gates | Gates, agent loop, fit score, outcome |
| `poc.py` | Hunter.io | One search per company, credit guard, stage-based title rules |
| `write.py` | Gemini Writer | Evidence catalog, hook choice, writer prompt, validator, one regeneration |
| `mailer.py` | Resend | Send only to `MY_EMAIL`, edit rate, auto-send rule |
| `feedback.py` | Past feedback | Capture → store → retrieve → apply learnings |
| `batch.py`, `actions.py` | Trigger / loops | Batch runner, domain-list runner, queued dashboard actions, sync |
| `db.py`, `usage.py`, `config.py` | Saved to Neon | Migrations, API usage log, settings + `icp.json` |
| `main.py` | Trigger | CLI: `migrate check stage1 pool extract run poc write send learn sync` |
| `scripts/set_keys.py` (new) | n/a | Hidden-prompt key entry, live key checks, optional GitHub secrets |

### Dashboard (`web/`)
| Page / component | Role |
|---|---|
| `app/page.tsx` Overview | Stat strip, 7-step tracker, run measures, drop/flag reasons, tokens, recent signals |
| `app/run` + `run-form.tsx` | Start a discovery or domain run via GitHub Actions (limits: 3 domains, 3 runs/day) |
| `app/review` + `review-card.tsx` | Human gate 1: qualify, drop, provide domain, research |
| `app/drafts` + `draft-editor.tsx` | Human gate 2: edit with live word count / edit rate / grounding, rate, switch hook, Approve & send, outcomes |
| `app/companies`, `app/companies/[id]` + `decision-trail.tsx` | Search; per-company decision trail with quote, URL, date |
| `app/loop` + `loop-diagram.tsx`, `learning-toggle.tsx` | Feedback loop stages, learnings store |
| `app/api/search`, `app/api/webhooks/resend` | Command-palette search; signed Resend webhook |
| `components/shell/*` | Sidebar, top bar, Ctrl/⌘K palette, theme toggle |
| `components/ui/*` | shadcn + Magic UI primitives (unchanged) |
| `proxy.ts` | Optional `DASHBOARD_PASSWORD` basic auth (off in this copy, so the grader can open it) |

---

## 3. Changes from the reference

| Change | Why |
|---|---|
| Own repo, Neon project, Vercel project, keys | Independence; the original is untouched |
| `requirements.txt`: removed unused Gmail libs; Intel-Mac `cryptography` pin | Install failed on this Mac |
| `AI_PROVIDER=gemini\|openrouter` in `pipeline/llm.py` (+5 tests) | Fallback when a Google key is refused. Same model (`google/gemini-3.8-flash`), reply capped (`OPENROUTER_MAX_TOKENS=4000`) so a small balance isn't refused, reasoning `low` because this model always reasons and its thinking otherwise consumes the cap (a 20-token test returned an empty answer). Default stays `gemini`. Currently set to `gemini`. |
| `scripts/set_keys.py` | Keys typed into hidden prompts; never printed or pasted in chat |
| Workflows pass `AI_PROVIDER` and `OPENROUTER_API_KEY`; actions bumped to `checkout@v5`, `setup-python@v6` | So Actions can use either provider; GitHub flagged the Node 20 versions as deprecated |
| `scripts/save_dispatch_token.sh` | Hidden-prompt entry for the GitHub token behind the Run buttons |
| Dashboard date display in `Asia/Kolkata` | Live site showed UTC |
| Doc links point to this copy; DEMO.md notes its examples are the reference's data | Accuracy |

No feature of the reference was removed.

---

## 4. Testing results (19 Nov 2026)

### Automated
| Check | Result |
|---|---|
| `pytest -q` | **122 passed** (117 reference + 5 new OpenRouter tests) |
| `npm run lint` (ESLint) | clean, no warnings |
| `tsc --noEmit` (after `next typegen`) | clean |
| `next build` locally and on Vercel | success, 11 routes |

### Live, end to end (real APIs)
| Step | Evidence |
|---|---|
| Migrations | 7 applied, 13 tables |
| Stage 1 | 668 headlines → 372 unique → **198 companies pooled** (drops: 122 no stage, 25 unparseable name, 4 excluded, 1 out of range) |
| Gemini extraction | pearler.com: facts with verbatim quotes, 0 rejected (via OpenRouter, then via Google directly) |
| Run 1 (`run --target-qualified 2 --max-batches 1`) | 4 researched → **2 qualified**, stop `target_reached` |
| Griffin (Series B fintech) | SaaS gate passed on "Embed bank accounts, payments … via our simple API."; Hunter → **Allen Rohner, CTO**, verified, 96%; draft 79/120 words, all claims grounded; held for review (no dated audit signal) |
| Model ML | Qualified (ISO 27001 certified, no Vanta/Drata), flagged: Hunter returned 0 emails |
| VitusCare, Olyv | Flagged: domain unresolved (nothing guessed) |
| Approve & send (dashboard, human gate 2) | Two-step confirm → Resend → status **delivered** to MY_EMAIL; subject prefixed `[DRAFT for Allen Rohner @ Griffin]`; Sent table + feedback event recorded |
| Hunter credits | 2 spent, 48 left (then 1 more in run 2) |
| **Web-started run** (live Run page → "Find companies for me", stop after 1) | GitHub Actions run 44559491071, 8 min, all steps green: Stage 1 refresh → **Arva AI** (Series A) qualified (+review) → Hunter → **Rhim Shah, CEO** (Series A fallback after CTO / VP Eng / co-founder / compliance) → draft held for review; 122 tests also pass on the runner |

### Dashboard validation
| Check | Result |
|---|---|
| Every route, local and live | `/ /run /review /drafts /companies /companies/[id] /loop /api/search` → 200; unknown company and unknown path → 404; webhook GET → 405 (POST only) |
| Live site without login | Opens publicly |
| Browser console | No application errors (only the dev-server hot-reload socket locally) |
| Empty states | Fresh DB showed "No runs yet"; Drafts shows "No drafts waiting" after sending; Run page shows "No web runs yet" |
| Loading/animation | Stat counters animate to real values (they read 0 until scrolled into view; seen only with a hidden browser pane) |
| Mobile (375 px) | No horizontal page scroll on all 7 pages; cards stack; the 7-step tracker scrolls inside its own box by design |
| Times | Live site shows India time (send at 20:12 IST) |

### Not tested
- "Run on these domains" button (same dispatch path as the tested discovery run, different workflow).
- The weekly scheduled run (active: Mondays 03:30 UTC / 09:00 IST); first one is due Monday 23 Nov 2026.
- Resend delivery webhook (needs a webhook registered in the Resend account and `RESEND_WEBHOOK_SECRET`).
- Dashboard actions Qualify / Drop / Provide domain / switch hook / ratings / outcomes were rendered but not clicked on this copy's data.
- Gmail sending (not built: Resend is used, as in the reference).

---

## 5. Known limitations

1. **Web runs depend on a GitHub token with an expiry.** `GITHUB_DISPATCH_TOKEN` (fine-grained, Actions read/write on this repo only) is on Vercel; when it expires the Run page falls back to its setup notice. Create a new one and run `scripts/save_dispatch_token.sh`, then re-add it on Vercel. The weekly run spends up to ~5 Hunter credits and auto-sends clean drafts to `MY_EMAIL`.
2. **Qualification with unknown certifications (inherited):** a company qualifies (with review) when its certifications and trust vendor are still unknown after the agent loop, e.g. Griffin. The outcome rules only flag when SaaS status or funding stage is unknown, so a company already on Vanta/Drata could slip through if its trust page can't be read.
3. **Domain resolution (inherited):** names that don't map to `name + .com/.io/.ai/.co/.in`, and funding articles behind Google redirects, end up flagged "domain unresolved" (2 of 4 in run 1). A human uses "Provide domain".
4. **Few dated audit signals (inherited):** company sites rarely date signals, so most drafts use the funding round as the hook and need a human review before sending.
5. **Hunter coverage:** some companies return 0 emails (Model ML). Free plan: 50 credits/month.
6. **Resend recipient:** without a verified domain, Resend only delivers to the account's own address, so `MY_EMAIL` must be that address. Brief says Gmail; Resend kept by choice.
7. **Empty feedback memory:** this copy starts with no learnings; the reference's learned phrases (e.g. avoiding "audit fire drills") are not carried over, and the first Griffin draft uses that phrase.
8. **`docs/components-map.png`** still shows the reference's footer URLs; the HTML source is updated.
9. **Google keys:** two of the owner's three Google keys are refused by the Gemini API; OpenRouter remains configured as a fallback (its balance was −$0.02 on 19 Nov).
