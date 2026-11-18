"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Play, Sparkles } from "lucide-react";
import { triggerDiscovery, triggerRun } from "@/app/actions";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { cn } from "@/lib/utils";

/** Main mode: no input. The pipeline finds funded companies in the news and takes them end to end. */
export function DiscoverForm({ enabled, targets }: { enabled: boolean; targets: readonly number[] }) {
  const [target, setTarget] = useState(targets[targets.length - 1]);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await triggerDiscovery(target);
          (r.ok ? toast.success : toast.error)(r.message);
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <span className="eyebrow">Stop after this many qualify</span>
        <div role="radiogroup" className="flex gap-2">
          {targets.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={t === target} disabled={!enabled || pending}
              onClick={() => setTarget(t)}
              className={cn("h-9 min-w-12 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-60",
                t === target ? "border-plum bg-plum text-white" : "bg-background text-muted-foreground hover:border-foreground/30")}>
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Each qualified company uses one Hunter search. Dropped companies cost nothing in Hunter.</p>
      </div>
      <ShimmerButton type="submit" disabled={!enabled || pending}
        background="#650A41" shimmerColor="#F2B8D3" borderRadius="999px"
        className="h-10 px-5 text-sm font-medium text-white disabled:opacity-50">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-3.5" />}
        Find companies for me
      </ShimmerButton>
    </form>
  );
}

/** Secondary mode: the same pipeline on domains you already have. */
export function RunForm({ enabled, maxDomains }: { enabled: boolean; maxDomains: number }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const count = value.split(/[\s,;]+/).filter(Boolean).length;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await triggerRun(value);
          (r.ok ? toast.success : toast.error)(r.message);
          if (r.ok) setValue("");
        });
      }}
      className="space-y-3"
    >
      <label className="block space-y-2">
        <span className="eyebrow">Domains</span>
        <textarea value={value} onChange={(e) => setValue(e.target.value)} disabled={!enabled || pending} rows={3}
          placeholder={"acme.io\nexample.com"}
          className="w-full resize-none rounded-xl border bg-background px-4 py-3 font-mono text-sm outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!enabled || pending || count === 0 || count > maxDomains}
          className="inline-flex h-9 items-center rounded-full border border-plum/40 px-4 text-sm font-medium text-plum transition-colors hover:bg-plum-soft disabled:opacity-50">
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-3.5 fill-current" />}
          Run on these domains
        </button>
        <span className={count > maxDomains ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {count}/{maxDomains} domains · one per line or comma-separated
        </span>
      </div>
    </form>
  );
}
