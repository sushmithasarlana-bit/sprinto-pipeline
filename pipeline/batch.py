"""Batch runner: take the next top-N unseen companies, research each, stop as soon as the run
has target_qualified_per_run qualified companies, or after max_batches_per_run, or when the pool is empty.
One bad company never stops the batch: any exception flags that company and the loop moves on."""
from __future__ import annotations

import hashlib
import logging
from datetime import date
from typing import Any

from psycopg.types.json import Jsonb

from pipeline import db
from pipeline.config import get_icp, icp_raw
from pipeline.extract import extract
from pipeline.mailer import auto_send_for_company
from pipeline.poc import find_poc
from pipeline.qualify import Outcome, gate_rows, qualify_company
from pipeline.resolve import resolve
from pipeline.scraper import Page, Scraper
from pipeline.usage import current_company_id, current_run_id, current_stage
from pipeline.write import run_pending as write_drafts

log = logging.getLogger(__name__)

ELIGIBLE_SQL = """status = 'pooled' AND (seen_at IS NULL OR seen_at < now() - make_interval(days => %s))"""


# ---------------------------------------------------------------- persistence helpers

def _update_company(cid: int, **cols: Any) -> None:
    sets = ", ".join(f"{k} = %s" for k in cols) + ", updated_at = now()"
    vals = [Jsonb(v) if isinstance(v, (dict, list)) and k not in ("unknown_fields", "industry_tags") else v
            for k, v in cols.items()]
    with db.connect() as conn:
        conn.execute(f"UPDATE companies SET {sets} WHERE id = %s", (*vals, cid))


def _decision(cid: int, run_id: int, stage: str, gate: str, result: str, value: Any = None,
              quote: str | None = None, url: str | None = None, date_: str | None = None,
              reason: str | None = None) -> None:
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO decisions (company_id, run_id, stage, gate, result, value, evidence_quote,
                                      source_url, evidence_date, reason)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (cid, run_id, stage, gate, result, Jsonb(value), quote, url, date_, reason))


def _recorder(cid: int, run_id: int):
    def record(pages: list[Page], iteration: int, target: str | None, extracted: dict | None) -> None:
        with db.connect() as conn:
            for p in pages:
                conn.execute(
                    """INSERT INTO research (company_id, run_id, iteration, target_field, page_url, page_type,
                                             http_status, text_chars, text_hash, page_text, extracted)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (cid, run_id, iteration, target, p.url, p.page_type, p.status, len(p.text),
                     hashlib.sha256(p.text.encode()).hexdigest()[:16], p.text,
                     Jsonb(extracted) if extracted and p.ok else None))
    return record


def _flag(cid: int, reason: str) -> str:
    _update_company(cid, status="flagged", needs_review=True, flag_reason=reason)
    log.info("  -> FLAGGED: %s", reason)
    return "flagged"


# ---------------------------------------------------------------- one company

def research_company(c: dict, run_id: int, batch_no: int | None = None) -> str:
    cid = c["id"]
    current_company_id.set(cid)
    _update_company(cid, status="researching", seen_at=date.today(), last_run_id=run_id, research_batch=batch_no,
                    flag_reason=None, drop_reason=None, needs_review=False)
    log.info("=== %s (rank %.3f, %s)", c["name"], c["rank_score"], c["funding_stage"] or "stage?")

    # 6a. domain
    domain = c["domain"]
    if not domain:
        current_stage.set("resolve")
        fund = next((g for g in c["stage1_evidence"] or [] if g.get("gate") == "funding_stage"), {})
        res = resolve(c["name"], fund.get("headline"), news_url=fund.get("url"))
        if res.article_url:
            _update_company(cid, article_url=res.article_url)
        _decision(cid, run_id, "resolve", "domain", "pass" if res.domain else "unknown",
                  {"domain": res.domain, "tried": res.tried, "article_url": res.article_url},
                  (res.evidence or {}).get("brand_text"), (res.evidence or {}).get("url"), None,
                  (f"found via {res.evidence['source']}: homepage names '{c['name']}' "
                   f"({', '.join(res.evidence['topic_overlap'])})") if res.domain
                  else "no candidate domain matched name + topic")
        if not res.domain:
            return _flag(cid, f"domain unresolved (tried {', '.join(t['domain'] for t in res.tried)})")
        domain = res.domain
        _update_company(cid, domain=domain, domain_source="resolved")

    # 6b. initial crawl + 6c. extraction
    current_stage.set("scrape")
    scraper = Scraper(domain, company=c["name"])
    pages = scraper.initial_crawl()
    record = _recorder(cid, run_id)
    if not any(p.ok and p.page_type == "homepage" for p in pages):
        record(pages, 0, None, None)
        return _flag(cid, f"site unreachable: {pages[-1].status if pages else 'no response'}")
    current_stage.set("extract")
    evidence = extract(c["name"], domain, pages)
    record(pages, 0, None, evidence)
    if evidence is None:
        return _flag(cid, "extraction failed (Gemini error or empty pages)")

    # 6d. qualifier + agent loop
    current_stage.set("qualify")
    evidence, out = qualify_company(c, scraper, evidence, record)
    _persist_outcome(cid, run_id, evidence, out, scraper)

    # 6e. PoC (qualified only; counts toward the run target even if no contact is found)
    # 6f. pain points + email draft (stored in Neon; a human approves before anything is sent)
    if out.status == "qualified":
        current_stage.set("poc")
        if find_poc({**c, "domain": domain, "status": "qualified"}, run_id) == "qualified":
            write_drafts(run_id, company_id=cid)
            auto_send_for_company(cid, run_id)          # 7. send (only clean drafts; the rest wait for a human)
    return out.status


def _persist_outcome(cid: int, run_id: int, evidence: dict, out: Outcome, scraper: Scraper) -> None:
    with db.connect() as conn:
        conn.execute("DELETE FROM decisions WHERE company_id=%s AND stage='qualify' AND decided_by='rule'", (cid,))
    for g in gate_rows(out):
        _decision(cid, run_id, "qualify", g["gate"], g["result"], g["value"], g["evidence_quote"],
                  g["source_url"], g["evidence_date"], g["reason"])
    evidence = {**evidence, "_loop": out.iterations, "_fetches": scraper.fetches}
    cols: dict[str, Any] = dict(evidence=evidence, status=out.status, needs_review=out.needs_review,
                                unknown_fields=out.unknown_fields, fit_score=out.fit_score,
                                fit_breakdown=out.fit_breakdown)
    if out.status == "dropped":
        cols["drop_reason"] = out.reason
    else:
        cols["flag_reason"] = out.reason
    _update_company(cid, **cols)
    log.info("  -> %s%s | fetches %d | %s", out.status.upper(), " (+review)" if out.needs_review else "",
             scraper.fetches, out.reason or f"fit {out.fit_score}")


# ---------------------------------------------------------------- run

def _counts(run_id: int) -> dict[str, int]:
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT status, count(*) n FROM companies WHERE last_run_id=%s GROUP BY status", (run_id,)).fetchall()
    return {r["status"]: r["n"] for r in rows}


def process_queue() -> list[dict]:
    """Work queued from the web dashboard (which can't crawl or call Gemini on Vercel):
    'research' after a reviewer supplied a domain, 'regenerate' after a hook switch,
    'poc_write' after a reviewer qualified a flagged company."""
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM companies WHERE queued_action IS NOT NULL ORDER BY updated_at").fetchall()
        run_id = conn.execute("SELECT max(id) m FROM runs").fetchone()["m"]
    out = []
    for c in rows:
        action = c["queued_action"]
        log.info("=== queued %s for %s", action, c["name"])
        try:
            if action == "research":
                status = research_company(c, c["last_run_id"] or run_id, c["research_batch"])
            elif action == "regenerate":
                res = write_drafts(company_id=c["id"])
                status = res[0]["status"] if res else "no contact"
            elif action == "poc_write":          # reviewer qualified a flagged company on the web
                status = find_poc({**c, "status": "qualified"}, c["last_run_id"] or run_id)
                if status == "qualified":
                    res = write_drafts(company_id=c["id"])
                    status = res[0]["status"] if res else "no contact"
            else:
                status = f"unknown action {action}"
        except Exception as e:  # noqa: BLE001
            log.exception("queued %s failed for %s", action, c["name"])
            status = f"error: {type(e).__name__}"
        _update_company(c["id"], queued_action=None)
        out.append({"company": c["name"], "action": action, "status": status})
    return out


def sync() -> dict[str, Any]:
    """Close the loop between the web dashboard and the pipeline: run queued work, then learn."""
    from pipeline import feedback

    queued = process_queue()
    backfilled = feedback.backfill()
    learned = feedback.learn()
    return {"queued": queued, "backfilled_events": backfilled, "learned": learned}


def _attach_stage(c: dict, run_id: int) -> dict:
    """Domain-list company without a stage: find its funding round in the news and record the evidence."""
    from pipeline.stage1 import detect_amount, lookup_stage

    item = lookup_stage(c["name"])
    if not item:
        _decision(c["id"], run_id, "stage1", "funding_stage_lookup", "unknown", None, None, None, None,
                  f"no Series A-C headline naming '{c['name']}' in Google News")
        return c
    stage = detect_stage_of(item.headline)
    gate = {"gate": "funding_stage", "result": "pass", "value": stage, "headline": item.headline, "url": item.url,
            "date": item.published.isoformat(), "publisher": item.publisher, "reason": "found by domain-list lookup"}
    _update_company(c["id"], funding_stage=stage, funding_date=item.published,
                    funding_amount=detect_amount(item.headline),
                    stage1_evidence=(c["stage1_evidence"] or []) + [gate])
    _decision(c["id"], run_id, "stage1", "funding_stage_lookup", "pass", stage, item.headline, item.url,
              item.published.isoformat(), "funding round found in the news for a domain-list company")
    log.info("  stage lookup: %s -> %s (%s)", c["name"], stage, item.headline[:80])
    return {**c, "funding_stage": stage, "stage1_evidence": (c["stage1_evidence"] or []) + [gate]}


def detect_stage_of(headline: str) -> str | None:
    from pipeline.stage1 import detect_stage
    return detect_stage(headline)


def run_domains(path: str | None = None, domains: list[str] | None = None) -> dict[str, Any]:
    """The case's repeatable mode: research every domain in a list end to end (resolve stage, crawl,
    qualify, PoC, draft, auto-send) without stopping for decisions. Flags still wait for a human."""
    from pathlib import Path
    from pipeline.stage1 import inject_domains

    icp = get_icp()
    log.info("sync before domain run: %s", sync())
    injected = inject_domains(Path(path) if path else None, lines=domains, ignore_cooldown=True)
    ids = injected.get("ids", [])
    with db.connect() as conn:
        run_id = conn.execute("INSERT INTO runs (icp_snapshot, pool_size, notes) VALUES (%s,%s,%s) RETURNING id",
                              (Jsonb(icp_raw()), len(ids), f"domain list: {path or ', '.join(domains or [])}"[:500])
                              ).fetchone()["id"]
    current_run_id.set(run_id)
    results, qualified = [], 0
    status = "completed"
    try:
        for cid in ids:
            with db.connect() as conn:
                c = conn.execute("SELECT * FROM companies WHERE id=%s", (cid,)).fetchone()
            current_company_id.set(cid)
            try:
                if not c["funding_stage"] and icp.domain_lists.get("stage_lookup"):
                    c = _attach_stage(c, run_id)
                st = research_company(c, run_id, 1)
            except Exception as e:  # noqa: BLE001 - one bad domain never stops the list
                log.exception("domain run failed for %s", c["domain"])
                st = _flag(cid, f"error: {type(e).__name__}: {str(e)[:200]}")
            qualified += st == "qualified"
            with db.connect() as conn:
                row = conn.execute(
                    """SELECT c.name, c.domain, c.status, coalesce(c.drop_reason, c.flag_reason) reason,
                              (SELECT full_name || ', ' || title FROM contacts WHERE company_id=c.id ORDER BY id DESC LIMIT 1) poc,
                              (SELECT status FROM emails WHERE company_id=c.id ORDER BY id DESC LIMIT 1) email
                       FROM companies c WHERE c.id=%s""", (cid,)).fetchone()
            results.append(dict(row))
            counts = _counts(run_id)
            with db.connect() as conn:
                conn.execute("""UPDATE runs SET batches_used=1, researched=%s, qualified=%s, flagged=%s, dropped=%s
                                WHERE id=%s""", (len(results), qualified, counts.get("flagged", 0),
                                                 counts.get("dropped", 0), run_id))
    except Exception:
        status = "failed"
        raise
    finally:
        with db.connect() as conn:
            conn.execute("UPDATE runs SET finished_at=now(), status=%s, stop_reason='domain_list' WHERE id=%s",
                         (status, run_id))
    return {"run_id": run_id, "domains": len(ids), "qualified": qualified, "skipped": injected.get("bad_line", 0),
            "results": results}


def run(target: int | None = None, max_batches: int | None = None) -> dict[str, Any]:
    icp = get_icp()
    log.info("sync before run: %s", sync())     # learn from every signal captured since the last run
    target = target or icp.target_qualified_per_run
    max_batches = max_batches or icp.max_batches_per_run
    with db.connect() as conn:
        run_id = conn.execute("INSERT INTO runs (icp_snapshot) VALUES (%s) RETURNING id",
                              (Jsonb(icp_raw()),)).fetchone()["id"]
        pool_size = conn.execute(f"SELECT count(*) n FROM companies WHERE {ELIGIBLE_SQL}",
                                 (icp.seen_cooldown_days,)).fetchone()["n"]
        conn.execute("UPDATE runs SET pool_size=%s WHERE id=%s", (pool_size, run_id))
    current_run_id.set(run_id)
    log.info("Run %d: pool %d, target %d qualified, up to %d batches of %d",
             run_id, pool_size, target, max_batches, icp.batch_size)

    qualified, researched, stop_reason, batches = 0, 0, "max_batches", 0
    try:
        for b in range(1, max_batches + 1):
            with db.connect() as conn:
                batch = conn.execute(
                    f"SELECT * FROM companies WHERE {ELIGIBLE_SQL} ORDER BY rank_score DESC, funding_date DESC "
                    f"NULLS LAST LIMIT %s", (icp.seen_cooldown_days, icp.batch_size)).fetchall()
            if not batch:
                stop_reason = "pool_empty"
                break
            batches = b
            log.info("--- Batch %d: %d companies", b, len(batch))
            for c in batch:
                try:
                    status = research_company(c, run_id, b)
                except Exception as e:  # noqa: BLE001 - one company must never crash the batch
                    log.exception("research failed for %s", c["name"])
                    status = _flag(c["id"], f"error: {type(e).__name__}: {str(e)[:200]}")
                researched += 1
                qualified += status == "qualified"
                counts = _counts(run_id)
                with db.connect() as conn:
                    conn.execute(
                        """UPDATE runs SET batches_used=%s, researched=%s, qualified=%s, flagged=%s, dropped=%s
                           WHERE id=%s""",
                        (batches, researched, qualified, counts.get("flagged", 0),
                         counts.get("dropped", 0), run_id))
                if qualified >= target:
                    stop_reason = "target_reached"
                    break
            if stop_reason == "target_reached":
                break
        status = "completed"
    except Exception:
        status, stop_reason = "failed", "error"
        log.exception("run %d failed", run_id)
        raise
    finally:
        with db.connect() as conn:
            conn.execute("UPDATE runs SET finished_at=now(), status=%s, stop_reason=%s WHERE id=%s",
                         (status, stop_reason, run_id))
    summary = {"run_id": run_id, "pool_size": pool_size, "batches_used": batches, "researched": researched,
               "qualified": qualified, "stop_reason": stop_reason, **{f"n_{k}": v for k, v in _counts(run_id).items()}}
    log.info("Run %d done: %s", run_id, summary)
    return summary
