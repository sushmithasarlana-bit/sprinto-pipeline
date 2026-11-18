import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleAlert, ExternalLink, ListPlus, Newspaper, Terminal } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { CompanyLink, Empty, PageHeader, Panel, StatusBadge, fmtDate } from "@/components/common";
import { DiscoverForm, RunForm } from "@/components/run-form";
import { getRunPage } from "@/lib/queries";
import { hasDispatchToken, recentRuns, repoActionsUrl } from "@/lib/github";
import { RUN_LIMITS } from "@/lib/run-limits";

export const metadata: Metadata = { title: "Run the pipeline" };
export const dynamic = "force-dynamic";

const STEPS = [
  "Read funding news and shortlist Series A–C SaaS with rules (or take your domains)",
  "Crawl the homepage, trust and careers pages (job boards too)",
  "Extract facts with verbatim quotes; Python verifies each quote",
  "Qualify with rules; an agent loop fetches more pages for unknowns",
  "Find the decision-maker with Hunter and title rules",
  "Write two pain points and an email; a validator checks every claim",
  "Send clean drafts to your inbox; anything flagged waits for you",
];

export default async function RunPage() {
  const enabled = hasDispatchToken();
  const [{ triggers, results, credits, today }, gh] = await Promise.all([getRunPage(), recentRuns()]);
  const ghById = new Map(gh.map((r) => [r.id, r]));
  const hunterMode = (credits ?? 0) >= RUN_LIMITS.liveHunterFloor ? "live" : "mock";
  const runs = [...new Set(results.map((r) => r.run_id))];

  return (
    <Reveal>
      <PageHeader eyebrow="Pipeline" title="Run the pipeline"
        description="It finds recently funded companies on its own, researches and qualifies them, finds the right person with Hunter and sends a personalised email to your inbox. Only what the rules can't settle comes back to you." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {!enabled && (
            <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/[0.07] p-4 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="space-y-1">
                <div className="font-medium">Web runs need one setting</div>
                <p className="text-muted-foreground">Add <code className="font-mono text-xs">GITHUB_DISPATCH_TOKEN</code> (a fine-grained GitHub token with Actions read/write on this repo) to the Vercel project. Until then, run it from a terminal:</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs">python main.py run</pre>
              </div>
            </div>
          )}
          <Panel title="Find companies for me">
            <div className="mb-4 flex gap-3 text-sm text-muted-foreground">
              <Newspaper className="mt-0.5 size-4 shrink-0 text-plum" />
              <p>No input needed. It pulls fresh funding news, shortlists companies that fit Sprinto&apos;s ICP, and takes each one through research, contact and email until enough qualify. It also runs by itself every Monday.</p>
            </div>
            <DiscoverForm enabled={enabled} targets={RUN_LIMITS.discoverTargets} />
          </Panel>
          <Panel title="Or run on specific domains">
            <div className="mb-4 flex gap-3 text-sm text-muted-foreground">
              <ListPlus className="mt-0.5 size-4 shrink-0 text-plum" />
              <p>Already have companies in mind? Paste up to {RUN_LIMITS.maxDomains} domains and the same pipeline runs on just those.</p>
            </div>
            <RunForm enabled={enabled} maxDomains={RUN_LIMITS.maxDomains} />
          </Panel>
          <div className="grid gap-3 rounded-2xl border bg-card px-5 py-4 text-xs text-muted-foreground sm:grid-cols-3">
            <div><div className="eyebrow mb-1">Limits</div>{RUN_LIMITS.maxRunsPerDay} web runs a day ({today} used)</div>
            <div><div className="eyebrow mb-1">Hunter</div>{hunterMode === "live" ? `live · ${credits} searches left` : `mock below ${RUN_LIMITS.liveHunterFloor} searches`}</div>
            <div><div className="eyebrow mb-1">Runs on</div><a href={repoActionsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-plum hover:underline">GitHub Actions <ExternalLink className="size-3" /></a></div>
          </div>
        </div>

        <Panel className="lg:col-span-2" title="What happens to each company">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm">
                <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-plum-soft text-[11px] font-semibold text-plum">{i + 1}</span>
                <span className="pt-0.5 text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-2" title="Recent web runs">
          {triggers.length ? (
            <ul className="space-y-3">
              {triggers.map((t) => {
                const run = ghById.get(Number(String(t.github_run_url ?? "").split("/runs/")[1] ?? 0));
                const state = t.status === "failed" ? "failed" : run ? (run.conclusion ?? run.status) : "dispatched";
                return (
                  <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl border p-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{t.mode === "discover" ? `Find companies · up to ${t.target}` : <span className="font-mono">{t.domains.join(", ")}</span>}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{fmtDate(t.created_at, true)} · Hunter {t.hunter_mode}</div>
                      {t.error && <div className="mt-1 text-xs text-destructive">{t.error}</div>}
                    </div>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={state === "success" ? "pass" : state === "failure" || state === "failed" ? "fail" : "researching"} />
                      {t.github_run_url && <a href={t.github_run_url} target="_blank" rel="noreferrer" className="text-plum" aria-label="Open on GitHub"><ExternalLink className="size-3.5" /></a>}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>No web runs yet.</Empty>}
        </Panel>

        <Panel className="lg:col-span-3" title="Results of recent runs" flush>
          {results.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="border-y bg-muted/50 text-left">
                  <tr className="eyebrow [&>th]:px-5 [&>th]:py-2.5 [&>th]:font-semibold"><th>Company</th><th>Outcome</th><th>Contact</th><th>Email</th></tr>
                </thead>
                <tbody>
                  {runs.map((rid) => (
                    <RunRows key={rid} rows={results.filter((r) => r.run_id === rid)} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 pb-6 sm:px-6"><Empty>No runs yet. <Terminal className="mx-1 inline size-3.5" /> <code>python main.py run</code></Empty></div>
          )}
        </Panel>
      </div>
    </Reveal>
  );
}

const ROWS_PER_RUN = 8;

function RunRows({ rows }: { rows: Record<string, any>[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const first = rows[0];
  const hidden = rows.length - ROWS_PER_RUN;
  return (
    <>
      <tr className="bg-muted/30"><td colSpan={4} className="px-5 py-2 text-xs text-muted-foreground">
        Run {first.run_id} · {first.is_domain_run ? "your domains" : "found from funding news"} · {fmtDate(first.started_at, true)} · {first.run_status}
      </td></tr>
      {rows.slice(0, ROWS_PER_RUN).map((r) => (
        <tr key={r.id} className="border-b last:border-0 [&>td]:px-5 [&>td]:py-3">
          <td><CompanyLink id={r.id} name={r.name} /><div className="text-xs text-muted-foreground">{r.domain}</div></td>
          <td><StatusBadge status={r.status} />{r.reason && <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={r.reason}>{r.reason}</div>}</td>
          <td className="text-xs">{r.poc ?? "—"}</td>
          <td>{r.email === "sent" ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" /> sent</span> : r.email ? <StatusBadge status={r.email} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
        </tr>
      ))}
      {hidden > 0 && (
        <tr className="border-b"><td colSpan={4} className="px-5 py-2 text-xs text-muted-foreground">
          + {hidden} more companies from this run · <Link href="/companies" className="text-plum hover:underline">see all companies</Link>
        </td></tr>
      )}
    </>
  );
}
