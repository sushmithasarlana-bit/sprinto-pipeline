"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Play } from "lucide-react";
import { triggerRun } from "@/app/actions";
import { ShimmerButton } from "@/components/ui/shimmer-button";

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
        <textarea value={value} onChange={(e) => setValue(e.target.value)} disabled={!enabled || pending} rows={4}
          placeholder={"acme.io\nexample.com"}
          className="w-full resize-none rounded-xl border bg-background px-4 py-3 font-mono text-sm outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <ShimmerButton type="submit" disabled={!enabled || pending || count === 0 || count > maxDomains}
          background="#650A41" shimmerColor="#F2B8D3" borderRadius="999px"
          className="h-10 px-5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-3.5 fill-current" />}
          Run the pipeline
        </ShimmerButton>
        <span className={count > maxDomains ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {count}/{maxDomains} domains · one per line or comma-separated
        </span>
      </div>
    </form>
  );
}
