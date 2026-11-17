import Link from "next/link";
import { Play } from "lucide-react";
import { CommandMenu } from "@/components/shell/command-menu";
import { MobileNav, type NavCounts } from "@/components/shell/sidebar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { LogoMark } from "@/components/brand/logo";

export type LastRun = { id: number; status: string; stop_reason: string | null; started_at: string; notes: string | null } | null;

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function TopBar({ counts, lastRun }: { counts: NavCounts; lastRun: LastRun }) {
  const running = lastRun?.status === "running";
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-4 sm:px-8">
        <MobileNav counts={counts} />
        <Link href="/" className="lg:hidden" aria-label="Overview"><LogoMark /></Link>
        <div className="flex-1"><CommandMenu /></div>
        {lastRun && (
          <div className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs md:flex" title={lastRun.notes ?? undefined}>
            <span className={running ? "size-2 animate-pulse rounded-full bg-warning" : "size-2 rounded-full bg-success"} />
            <span className="font-medium">Run {lastRun.id}</span>
            <span className="text-muted-foreground">{running ? "running" : (lastRun.stop_reason ?? lastRun.status).replace(/_/g, " ")} · {ago(lastRun.started_at)}</span>
          </div>
        )}
        <Link href="/run"
          className="hidden h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-px sm:flex">
          <Play className="size-3.5 fill-current" /> Run pipeline
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
