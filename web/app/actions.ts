"use server";

import { revalidatePath } from "next/cache";
import { distance } from "fastest-levenshtein";
import { sql } from "@/lib/db";
import { capture, humanDecision } from "@/lib/feedback";
import { RUN_LIMITS } from "@/lib/run-limits";

export type ActionResult = { ok: boolean; message: string };

const refresh = () => {
  for (const p of ["/", "/review", "/drafts", "/companies", "/loop"]) revalidatePath(p);
};
const done = (message: string): ActionResult => (refresh(), { ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

function normaliseDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  try {
    const host = new URL(s.includes("//") ? s : `https://${s}`).hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- review queue

export async function qualifyCompany(companyId: number, note: string): Promise<ActionResult> {
  const [c] = await sql`SELECT id, status, domain, EXISTS (SELECT 1 FROM contacts k WHERE k.company_id = c.id) has_contact,
                               EXISTS (SELECT 1 FROM emails e WHERE e.company_id = c.id) has_email
                        FROM companies c WHERE id = ${companyId}`;
  if (!c) return fail("Company not found");
  if (!c.domain) return fail("Needs a domain first: use Provide domain.");
  const queued = !c.has_contact ? "poc_write" : !c.has_email ? "regenerate" : null;
  await humanDecision(companyId, "status", { from: c.status, to: "qualified" }, note || "qualified by reviewer");
  await sql`UPDATE companies SET status = 'qualified', needs_review = false, flag_reason = NULL, drop_reason = NULL,
            queued_action = ${queued}, updated_at = now() WHERE id = ${companyId}`;
  await capture({ kind: "override_qualify", source: "reviewer", companyId, note, payload: { from: c.status, queued } });
  return done(queued ? `Qualified. ${queued === "poc_write" ? "PoC + draft" : "Draft"} queued for the next pipeline sync.` : "Qualified.");
}

export async function approveReview(companyId: number, note: string): Promise<ActionResult> {
  await humanDecision(companyId, "review", { needs_review: false }, note || "reviewed and approved as is");
  await sql`UPDATE companies SET needs_review = false, updated_at = now() WHERE id = ${companyId}`;
  await capture({ kind: "review_approved", source: "reviewer", companyId, note });
  return done("Review cleared.");
}

export async function dropCompany(companyId: number, reason: string): Promise<ActionResult> {
  const why = reason.trim() || "dropped by reviewer";
  const [c] = await sql`SELECT status FROM companies WHERE id = ${companyId}`;
  await humanDecision(companyId, "status", { from: c?.status, to: "dropped" }, why);
  await sql`UPDATE companies SET status = 'dropped', needs_review = false, drop_reason = ${"human: " + why},
            queued_action = NULL, updated_at = now() WHERE id = ${companyId}`;
  await sql`UPDATE emails SET status = 'discarded' WHERE company_id = ${companyId} AND status IN ('drafted','flagged')`;
  await capture({ kind: "override_drop", source: "reviewer", companyId, note: why, payload: { from: c?.status } });
  return done("Dropped.");
}

export async function provideDomain(companyId: number, raw: string): Promise<ActionResult> {
  const domain = normaliseDomain(raw);
  if (!domain) return fail(`'${raw}' is not a domain.`);
  await humanDecision(companyId, "domain", { domain }, "domain provided by reviewer");
  await sql`UPDATE companies SET domain = ${domain}, domain_source = 'human', queued_action = 'research',
            updated_at = now() WHERE id = ${companyId}`;
  await capture({ kind: "domain_provided", source: "reviewer", companyId, payload: { domain } });
  return done(`Saved ${domain}. Research is queued: run "python main.py sync" to crawl, qualify and draft it.`);
}

// ---------------------------------------------------------------- drafts

export async function switchHook(emailId: number, evidenceId: string): Promise<ActionResult> {
  const [e] = await sql`SELECT company_id::int, hook, evidence_catalog FROM emails WHERE id = ${emailId}`;
  if (!e) return fail("Draft not found");
  const cat = (e.evidence_catalog ?? []) as { id: string; field: string }[];
  const from = e.hook?.evidence_id;
  const value = { evidence_id: evidenceId, from, from_field: cat.find((i) => i.id === from)?.field,
                  to_field: cat.find((i) => i.id === evidenceId)?.field };
  await humanDecision(e.company_id, "hook", value, "hook chosen by reviewer");
  await sql`UPDATE companies SET chosen_hook = ${JSON.stringify({ evidence_id: evidenceId, by: "human" })}::jsonb,
            needs_review = false, queued_action = 'regenerate', updated_at = now() WHERE id = ${e.company_id}`;
  await capture({ kind: "hook_switch", source: "reviewer", companyId: e.company_id, emailId, payload: value });
  return done(`Hook set to ${evidenceId}. Regeneration queued for the next pipeline sync.`);
}

export async function rateDraft(emailId: number, rating: 1 | -1, tags: string[], note: string): Promise<ActionResult> {
  const [e] = await sql`UPDATE emails SET rating = ${rating} WHERE id = ${emailId} RETURNING company_id::int`;
  if (!e) return fail("Draft not found");
  await capture({ kind: "draft_rating", source: "reviewer", companyId: e.company_id, emailId, rating, tags,
                  note: note || null });
  return done(rating > 0 ? "Thanks: marked as a good draft." : "Captured: the writer will learn from this.");
}

export async function sendDraft(emailId: number, subject: string, body: string): Promise<ActionResult> {
  const { RESEND_API_KEY, MY_EMAIL } = process.env;
  const from = process.env.RESEND_FROM || "Sprinto Outreach <onboarding@resend.dev>";
  if (!RESEND_API_KEY || !MY_EMAIL) return fail("RESEND_API_KEY and MY_EMAIL must be set on the server.");
  const [e] = await sql`
    SELECT e.id, e.status, e.original_body, e.subject, e.learnings_applied, e.company_id::int, co.name company,
           k.full_name poc FROM emails e JOIN companies co ON co.id = e.company_id
    LEFT JOIN contacts k ON k.id = e.contact_id WHERE e.id = ${emailId}`;
  if (!e) return fail("Draft not found");
  if (e.status === "sent") return fail("Already sent.");
  if (!body.trim()) return fail("Body is empty.");
  const fullSubject = `[DRAFT for ${e.poc ?? "?"} @ ${e.company}] ${subject || e.subject}`;
  // Recipient is always MY_EMAIL. There is deliberately no way to address the prospect from here.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json",
               "Idempotency-Key": `sprinto-web-${emailId}-${body.length}-${fullSubject.length}` },
    body: JSON.stringify({ from, to: [MY_EMAIL], subject: fullSubject, text: body }),
  });
  if (!res.ok) return fail(`Resend: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const { id: messageId } = (await res.json()) as { id?: string };
  const original = e.original_body ?? "";
  const rate = Math.round((distance(original, body) / Math.max(original.length, body.length, 1)) * 10000) / 10000;
  await sql`UPDATE emails SET sent_body = ${body}, sent_subject = ${fullSubject}, sent_to = ${MY_EMAIL},
            edit_distance = ${rate}, provider_message_id = ${messageId ?? null}, status = 'sent', sent_at = now()
            WHERE id = ${emailId}`;
  await sql`UPDATE companies SET status = 'sent', updated_at = now() WHERE id = ${e.company_id}`;
  await sql`INSERT INTO api_usage (company_id, service, stage, ok) VALUES (${e.company_id}, 'resend', 'send', true)`;
  await capture({ kind: "draft_sent", source: "reviewer", companyId: e.company_id, emailId,
                  payload: { edit_rate: rate, original_body: original, sent_body: body, original_subject: e.subject,
                             sent_subject: subject, learnings_applied: e.learnings_applied ?? [] } });
  return done(`Sent to ${MY_EMAIL} · edit rate ${(rate * 100).toFixed(1)}%`);
}

export async function setOutcome(emailId: number, outcome: string, note: string): Promise<ActionResult> {
  const allowed = ["replied", "meeting", "not_interested", "no_reply", "bounced"];
  if (!allowed.includes(outcome)) return fail("Unknown outcome");
  const [e] = await sql`UPDATE emails SET outcome = ${outcome}, outcome_at = now() WHERE id = ${emailId}
                        RETURNING company_id::int`;
  if (!e) return fail("Email not found");
  await capture({ kind: "outcome", source: "prospect", companyId: e.company_id, emailId, note: note || null,
                  rating: ["replied", "meeting"].includes(outcome) ? 1 : -1, payload: { outcome } });
  return done(`Outcome recorded: ${outcome.replace("_", " ")}.`);
}

// ---------------------------------------------------------------- learnings

export async function setLearningStatus(id: number, active: boolean): Promise<ActionResult> {
  await sql`UPDATE learnings SET status = ${active ? "active" : "retired"}, updated_at = now() WHERE id = ${id}`;
  return done(active ? "Learning re-activated." : "Learning retired: it will no longer be retrieved.");
}

// ---------------------------------------------------------------- run on domains (GitHub Actions)



/** Shared guards for web-started runs: token, daily cap, and Hunter live only while credits last. */
async function startRun(mode: "discover" | "domains", domains: string[], target: number | null,
                        describe: (hunterMode: string) => string): Promise<ActionResult> {
  const { dispatchWorkflow, hasDispatchToken } = await import("@/lib/github");
  if (!hasDispatchToken()) {
    return fail("Running from the web needs GITHUB_DISPATCH_TOKEN on the server. Locally: python main.py run");
  }
  const [{ n }] = await sql`SELECT count(*)::int n FROM pipeline_triggers WHERE created_at > now() - interval '1 day'`;
  if (n >= RUN_LIMITS.maxRunsPerDay) return fail(`Daily limit reached (${RUN_LIMITS.maxRunsPerDay} web runs a day). Try tomorrow or run it locally.`);
  const [credits] = await sql`SELECT credits_remaining::int r FROM api_usage WHERE service = 'hunter' AND model = 'live'
                              AND credits_remaining IS NOT NULL ORDER BY ts DESC LIMIT 1`;
  const hunterMode = (credits?.r ?? 0) >= RUN_LIMITS.liveHunterFloor ? "live" : "mock";
  const [t] = await sql`INSERT INTO pipeline_triggers (mode, domains, target, hunter_mode)
                        VALUES (${mode}, ${domains}, ${target}, ${hunterMode}) RETURNING id::int`;
  const inputs: Record<string, string> = mode === "discover"
    ? { hunter_mode: hunterMode, target_qualified: String(target), trigger_id: String(t.id) }
    : { domains: domains.join(","), hunter_mode: hunterMode, trigger_id: String(t.id) };
  try {
    const { runId, url } = await dispatchWorkflow(mode, inputs);
    await sql`UPDATE pipeline_triggers SET github_run_id = ${runId}, github_run_url = ${url} WHERE id = ${t.id}`;
    revalidatePath("/run");
    return { ok: true, message: describe(hunterMode) };
  } catch (err) {
    await sql`UPDATE pipeline_triggers SET status = 'failed', error = ${String(err).slice(0, 300)} WHERE id = ${t.id}`;
    revalidatePath("/run");
    return fail(`Could not start the run: ${String(err).slice(0, 160)}`);
  }
}

/** Main mode: the pipeline finds companies itself from funding news, then researches, contacts and emails. */
export async function triggerDiscovery(target: number): Promise<ActionResult> {
  if (!(RUN_LIMITS.discoverTargets as readonly number[]).includes(target)) return fail("Pick how many companies to find.");
  return startRun("discover", [], target, (h) =>
    `Started: finding up to ${target} qualified ${target === 1 ? "company" : "companies"} from funding news (Hunter ${h}). Takes about 10–25 minutes.`);
}

/** Secondary mode: the same pipeline on domains you already have. */
export async function triggerRun(raw: string): Promise<ActionResult> {
  const domains = [...new Set(raw.split(/[\s,;]+/).map((d) => normaliseDomain(d)).filter((d): d is string => !!d))];
  if (!domains.length) return fail("Enter at least one domain, like acme.io.");
  if (domains.length > RUN_LIMITS.maxDomains) return fail(`Up to ${RUN_LIMITS.maxDomains} domains per run.`);
  return startRun("domains", domains, null, (h) =>
    `Started on ${domains.join(", ")} (Hunter ${h}). Results appear here in about 3–8 minutes.`);
}
