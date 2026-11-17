import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Reveal, GrowBar } from "@/components/motion/reveal";
import { CompanyLink, Empty, PageHeader, Panel, StatStrip, StatusBadge, fmtDate, pct } from "@/components/common";
import { PipelineTracker } from "@/components/pipeline-tracker";
import { RunSelect } from "@/components/run-select";
import { BATCH_SIZE, MAX_FETCHES, TARGET_QUALIFIED, getLoop, getOverview, getRuns } from "@/lib/queries";
import { loopStages } from "@/lib/loop";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const runs = await getRuns();
  const runId = sp.run ? Number(sp.run) : (runs[0]?.id ?? null);
  const run = runs.find((r) => r.id === runId);
  const [o, loop] = await Promise.all([getOverview(runId), getLoop()]);
  const stages = loopStages(loop.stages as never);
  const liveStages = stages.filter((s) => s.live).length;
  const f = o.funnel;
  const flagRate = run?.researched ? run.flagged / run.researched : null;

  return (
    <Reveal>
      <PageHeader
        eyebrow={run ? `Run ${run.id} · ${fmtDate(run.started_at, true)}` : "No runs yet"}
        title="Pipeline overview"
        description="Funded SaaS companies, shortlisted by rules, researched in batches, qualified in Python and emailed automatically when nothing needs a human."
        actions={runs.length ? <RunSelect runs={runs as never} current={runId} /> : null}
      />

      {!run ? (
        <Empty>No runs yet. Use <Link href="/run" className="text-plum underline">Run on domains</Link> or <code>python main.py run</code>.</Empty>
      ) : (
        <div className="space-y-6">
          <StatStrip stats={[
            { label: "Pool", value: run.pool_size, hint: `${o.eligible} still unseen` },
            { label: "Researched", value: run.researched, hint: `${run.batches_used} batch${run.batches_used === 1 ? "" : "es"} used` },
            { label: "Qualified", value: run.qualified, suffix: run.stop_reason === "domain_list" ? undefined : `/ ${TARGET_QUALIFIED}`, tone: "plum", hint: (run.stop_reason ?? "running").replace(/_/g, " ") },
            { label: "Flagged", value: run.flagged, hint: "waiting on a human" },
            { label: "Dropped", value: run.dropped, hint: "a gate failed" },
            { label: "Hunter left", value: o.hunter.remaining ?? 50, hint: `${o.hunter.spent} searches spent` },
          ]} />

          <PipelineTracker c={{ pool: f.pool, scraped: f.scraped, qualified: f.qualified, contacts: f.contacts, drafted: f.drafted, sent: f.sent, review: f.review }} />

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="How the run performed" description="The case's measures for this run" className="lg:col-span-2">
              <dl className="grid gap-6 sm:grid-cols-4">
                {[
                  { k: "Batch-1 hit rate", v: `${o.batch1.q}/${BATCH_SIZE}`, sub: `${o.batch1.q} of ${o.batch1.n} researched`, p: o.batch1.q / BATCH_SIZE },
                  { k: "Flag rate", v: pct(flagRate), sub: `${run.flagged} of ${run.researched}`, p: flagRate ?? 0 },
                  { k: "Fetches / company", v: (o.fetches.avg ?? 0).toFixed(1), sub: `cap ${MAX_FETCHES}`, p: (o.fetches.avg ?? 0) / MAX_FETCHES },
                  { k: "Avg edit rate", v: pct(o.editRate.avg, 1), sub: `${o.editRate.n} sent`, p: o.editRate.avg ?? 0 },
                ].map((m, i) => (
                  <div key={m.k} className="space-y-2">
                    <dt className="eyebrow">{m.k}</dt>
                    <dd className="tabular text-[26px] leading-none font-semibold tracking-tight">{m.v}</dd>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <GrowBar pct={m.p * 100} delay={0.25 + i * 0.08} className="h-full rounded-full bg-plum" />
                    </div>
                    <div className="text-xs text-muted-foreground">{m.sub}</div>
                  </div>
                ))}
              </dl>
            </Panel>
            <Link href="/loop" data-animate
              className="group flex flex-col justify-between rounded-2xl bg-plum p-6 text-primary-foreground transition-transform hover:-translate-y-0.5">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.1em] uppercase opacity-80">
                <Sparkles className="size-3.5" /> Feedback loop
              </div>
              <div>
                <div className="tabular text-[40px] leading-none font-semibold">{liveStages}<span className="text-xl opacity-70">/6</span></div>
                <p className="mt-2 text-sm opacity-85">stages hold data · {loop.stages.stored} learnings in memory · {loop.stages.applied_drafts} drafts shaped by them</p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">Open the loop <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Why companies dropped" description="First gate that failed">
              <ReasonList rows={o.drops as never} empty="Nothing dropped in this run." tone="destructive" />
            </Panel>
            <Panel title="Why a human is needed" description="Flags and hook reviews">
              <ReasonList rows={o.flags as never} empty="Nothing flagged in this run." tone="warning" />
            </Panel>
            <Panel title="Gemini tokens" description="This run, non-cached">
              {o.tokens.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left"><tr className="eyebrow [&>th]:pb-2 [&>th]:font-semibold"><th>Stage</th><th className="text-right">Calls</th><th className="text-right">In</th><th className="text-right">Out</th></tr></thead>
                  <tbody className="tabular">
                    {o.tokens.map((t) => (
                      <tr key={t.stage} className="border-t">
                        <td className="py-2 capitalize">{t.stage}</td>
                        <td className="py-2 text-right">{t.calls}</td>
                        <td className="py-2 text-right">{t.tokens_in.toLocaleString()}</td>
                        <td className="py-2 text-right">{t.tokens_out.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <Empty>No Gemini calls logged for this run.</Empty>}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Companies in this run" className="lg:col-span-2" flush
              action={<Link href="/companies" className="text-sm text-plum hover:underline">All companies</Link>}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-y bg-muted/50 text-left">
                    <tr className="eyebrow [&>th]:px-5 [&>th]:py-2.5 [&>th]:font-semibold sm:[&>th]:px-6">
                      <th>Company</th><th>Stage</th><th>Status</th><th className="text-right">Fit</th><th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.companies.map((c) => (
                      <tr key={c.id} className="border-b last:border-0 transition-colors hover:bg-muted/40 [&>td]:px-5 [&>td]:py-3 sm:[&>td]:px-6">
                        <td><CompanyLink id={c.id} name={c.name} /><div className="text-xs text-muted-foreground">{c.domain ?? "no domain"}</div></td>
                        <td className="text-muted-foreground">{c.funding_stage ?? "—"}</td>
                        <td><StatusBadge status={c.status} />{c.queued_action && <span className="ml-1.5 text-[11px] text-info">queued</span>}</td>
                        <td className="tabular text-right">{c.fit != null ? c.fit.toFixed(2) : "—"}</td>
                        <td className="max-w-[280px] truncate text-xs text-muted-foreground" title={c.reason ?? ""}>{c.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Recent signals" description="Captured for the feedback loop">
              {o.activity.length ? (
                <ol className="relative space-y-4 border-l pl-4">
                  {o.activity.map((a) => (
                    <li key={a.id} className="relative text-sm">
                      <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-plum ring-4 ring-card" />
                      <div className="truncate"><span className="font-medium capitalize">{a.kind.replace(/_/g, " ")}</span>
                        {a.company && <> · <CompanyLink id={a.company_id} name={a.company} /></>}</div>
                      <div className="text-xs text-muted-foreground">{a.source} · {fmtDate(a.created_at, true)}</div>
                    </li>
                  ))}
                </ol>
              ) : <Empty>No signals yet.</Empty>}
            </Panel>
          </div>
        </div>
      )}
    </Reveal>
  );
}

function ReasonList({ rows, empty, tone }: { rows: { reason: string; n: number; companies: string }[]; empty: string; tone: "destructive" | "warning" }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...rows.map((r) => r.n));
  return (
    <ul className="space-y-4">
      {rows.map((r, i) => (
        <li key={r.reason} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium first-letter:uppercase">{r.reason.replace(/_/g, " ")}</span>
            <span className="tabular text-muted-foreground">{r.n}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <GrowBar pct={(r.n / max) * 100} delay={0.2 + i * 0.06}
              className={cn("h-full rounded-full", tone === "destructive" ? "bg-destructive/70" : "bg-warning")} />
          </div>
          <div className="truncate text-xs text-muted-foreground" title={r.companies}>{r.companies}</div>
        </li>
      ))}
    </ul>
  );
}
