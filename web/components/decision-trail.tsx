import { Globe, Mail, Newspaper, ShieldCheck, UserCheck, UserRound } from "lucide-react";
import { SourceLink, StatusBadge, fmtDate } from "@/components/common";
import { cn } from "@/lib/utils";

type Decision = {
  id: number; stage: string; gate: string; result: string; evidence_quote: string | null; source_url: string | null;
  evidence_date: string | null; reason: string | null; decided_by: string; created_at: string;
};

const STAGES: { key: string; label: string; icon: typeof Globe }[] = [
  { key: "stage1", label: "Shortlist · funding news", icon: Newspaper },
  { key: "resolve", label: "Domain", icon: Globe },
  { key: "qualify", label: "Qualify · gates", icon: ShieldCheck },
  { key: "poc", label: "Point of contact", icon: UserRound },
  { key: "write", label: "Email", icon: Mail },
  { key: "human", label: "Human decisions", icon: UserCheck },
];

/** Every decision about one company as a timeline: what was decided, on which quote, from where, by whom. */
export function DecisionTrail({ decisions }: { decisions: Decision[] }) {
  const groups = STAGES.map((s) => ({ ...s, items: decisions.filter((d) => d.stage === s.key) })).filter((g) => g.items.length);
  return (
    <ol className="relative space-y-8">
      <span className="absolute top-2 bottom-2 left-[17px] w-px bg-border" aria-hidden />
      {groups.map((g) => {
        const Icon = g.icon;
        const failed = g.items.some((d) => d.result === "fail");
        return (
          <li key={g.key} className="relative pl-12">
            <span className={cn("absolute top-0 left-0 grid size-9 place-items-center rounded-full border-4 border-background",
              failed ? "bg-destructive text-white" : g.key === "human" ? "bg-warning text-white" : "bg-plum text-primary-foreground")}>
              <Icon className="size-4" strokeWidth={1.8} />
            </span>
            <h3 className="pt-1.5 text-sm font-semibold">{g.label}</h3>
            <ul className="mt-3 space-y-2.5">
              {g.items.map((d) => (
                <li key={d.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={d.result} />
                    <span className="text-sm font-medium first-letter:uppercase">{d.gate.replace(/_/g, " ")}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {d.decided_by === "human" ? "decided by a human" : "rule"}{d.evidence_date ? ` · ${d.evidence_date}` : ""}
                    </span>
                  </div>
                  {d.evidence_quote && (
                    <blockquote className="mt-3 border-l-2 border-plum/40 pl-3 text-[13.5px] leading-relaxed">
                      “{d.evidence_quote.slice(0, 320)}{d.evidence_quote.length > 320 ? "…" : ""}”
                    </blockquote>
                  )}
                  {(d.reason || d.source_url) && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {d.reason && <span>{d.reason}</span>}
                      {d.source_url && <SourceLink href={d.source_url} />}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
      {!groups.length && <li className="text-sm text-muted-foreground">No decisions recorded yet.</li>}
    </ol>
  );
}

export const trailDate = fmtDate;
