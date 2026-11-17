import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NumberTicker } from "@/components/ui/number-ticker";

export function PageHeader({ title, description, actions, eyebrow }: {
  title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode;
}) {
  return (
    <header data-animate className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="text-[28px] leading-tight font-semibold sm:text-[34px]">{title}</h1>
        {description && <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const STATUS: Record<string, string> = {
  pooled: "bg-muted text-muted-foreground",
  researching: "bg-info/12 text-info",
  qualified: "bg-success/12 text-success",
  drafted: "bg-plum-soft text-plum",
  sent: "bg-plum text-primary-foreground",
  flagged: "bg-warning/15 text-warning",
  dropped: "bg-destructive/10 text-destructive",
  pass: "bg-success/12 text-success",
  fail: "bg-destructive/10 text-destructive",
  unknown: "bg-warning/15 text-warning",
  override: "bg-plum-soft text-plum",
  info: "bg-muted text-muted-foreground",
  active: "bg-success/12 text-success",
  retired: "bg-muted text-muted-foreground",
  discarded: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const s = status ?? "unknown";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium capitalize", STATUS[s] ?? STATUS.info, className)}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

/** One horizontal strip of headline numbers, divided by hairlines (instead of a grid of identical boxes). */
export function StatStrip({ stats }: {
  stats: { label: string; value: number; suffix?: ReactNode; hint?: ReactNode; decimals?: number; tone?: "plum" | "default" }[];
}) {
  return (
    <section data-animate className="grid grid-cols-2 overflow-hidden rounded-2xl border bg-card sm:grid-cols-3 xl:grid-cols-6">
      {stats.map((s, i) => (
        <div key={s.label} className={cn("space-y-1.5 border-border p-5", i > 0 && "border-l", i >= 2 && "max-sm:border-t", i >= 3 && "sm:max-xl:border-t", i === 3 && "sm:max-xl:border-l-0", i === 2 && "max-sm:border-l-0", i === 4 && "max-sm:border-l-0")}>
          <div className="eyebrow">{s.label}</div>
          <div className="flex items-baseline gap-1">
            <NumberTicker value={s.value} decimalPlaces={s.decimals ?? 0} delay={0.05 * i}
              className={cn("tabular text-[30px] leading-none font-semibold tracking-tight", s.tone === "plum" ? "text-plum" : "text-foreground")} />
            {s.suffix && <span className="text-sm text-muted-foreground">{s.suffix}</span>}
          </div>
          {s.hint && <div className="text-xs text-muted-foreground">{s.hint}</div>}
        </div>
      ))}
    </section>
  );
}

export function StatText({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="eyebrow">{label}</div>
      <div className="text-[22px] leading-none font-semibold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Panel({ title, description, children, className, action, flush }: {
  title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string; action?: ReactNode; flush?: boolean;
}) {
  return (
    <section data-animate className={cn("rounded-2xl border bg-card", flush ? "" : "p-5 sm:p-6", className)}>
      {(title || action) && (
        <div className={cn("mb-4 flex items-start justify-between gap-4", flush && "px-5 pt-5 sm:px-6 sm:pt-6")}>
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

export function SourceLink({ href, children = "source" }: { href?: string | null; children?: ReactNode }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-plum underline-offset-2 hover:underline">
      {children}
      <ArrowUpRight className="size-3" />
    </a>
  );
}

export function CompanyLink({ id, name }: { id: number; name: string }) {
  return <Link href={`/companies/${id}`} className="font-medium hover:text-plum hover:underline underline-offset-2">{name}</Link>;
}

export function PillLink({ href, children, variant = "outline" }: { href: string; children: ReactNode; variant?: "solid" | "outline" }) {
  return (
    <Link href={href} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
      variant === "solid" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-card hover:bg-muted")}>
      {children}
    </Link>
  );
}

export const pct = (x: number | null | undefined, digits = 0) =>
  x == null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(digits)}%`;

export function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-GB", withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
}
