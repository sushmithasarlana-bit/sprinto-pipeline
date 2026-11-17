import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { CompanyLink, Empty, PageHeader, Panel, fmtDate, pct } from "@/components/common";
import { DraftEditor, type Draft } from "@/components/draft-editor";
import { OutcomeSelect } from "@/components/outcome-select";
import { getDrafts, getSent } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Drafts & sends" };
export const dynamic = "force-dynamic";

export default async function DraftsPage({ searchParams }: PageProps<"/drafts">) {
  const sp = await searchParams;
  const [drafts, sent] = (await Promise.all([getDrafts(), getSent()])) as [Draft[], Record<string, any>[]]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const selectedId = sp.id ? Number(sp.id) : drafts[0]?.id;
  const selected = drafts.find((d) => d.id === selectedId) ?? drafts[0];
  const myEmail = process.env.MY_EMAIL ?? "MY_EMAIL";

  return (
    <Reveal>
      <PageHeader eyebrow="Human gate 2" title="Drafts & sends"
        description="Drafts that need a hook review or that you want to edit wait here. Clean drafts already went out automatically. Every edit, rating and outcome teaches the writer." />
      {drafts.length === 0 ? (
        <Empty>No drafts waiting. Clean drafts are sent automatically; flagged ones appear here.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav data-animate className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-24 lg:flex-col lg:self-start lg:overflow-visible">
            <div className="eyebrow hidden px-1 lg:block">{drafts.length} waiting</div>
            {drafts.map((d) => {
              const on = d.id === selected?.id;
              return (
                <Link key={d.id} href={`/drafts?id=${d.id}`} scroll={false}
                  className={cn("min-w-[200px] rounded-2xl border px-4 py-3 transition-all lg:min-w-0",
                    on ? "border-plum/40 bg-plum-soft shadow-sm" : "bg-card hover:border-foreground/20")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm font-semibold", on && "text-plum")}>{d.company}</span>
                    {d.is_mock && <FlaskConical className="size-3.5 text-warning" aria-label="mock contact" />}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{d.full_name} · {d.title}</div>
                </Link>
              );
            })}
          </nav>
          {selected && <DraftEditor key={selected.id} draft={selected} myEmail={myEmail} />}
        </div>
      )}

      <Panel title="Sent" description="Record what the prospect did. It is the strongest signal the loop gets." className="mt-10" flush>
        {sent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-y bg-muted/50 text-left">
                <tr className="eyebrow [&>th]:px-6 [&>th]:py-2.5 [&>th]:font-semibold">
                  <th>Company</th><th>Written for</th><th>Subject</th><th>Sent</th><th className="text-right">Edited</th><th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 [&>td]:px-6 [&>td]:py-3">
                    <td><CompanyLink id={s.company_id} name={s.company} /></td>
                    <td className="text-muted-foreground">{s.full_name}<div className="text-xs">{s.title}</div></td>
                    <td className="max-w-[300px] truncate" title={s.sent_subject}>{String(s.sent_subject ?? "").replace(/^\[DRAFT for [^\]]+\]\s*/, "")}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{fmtDate(s.sent_at, true)}</td>
                    <td className="tabular text-right">{pct(s.edit_rate, 1)}</td>
                    <td><OutcomeSelect emailId={s.id} value={s.outcome} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="px-6 pb-6"><Empty>Nothing sent yet.</Empty></div>}
      </Panel>
    </Reveal>
  );
}
