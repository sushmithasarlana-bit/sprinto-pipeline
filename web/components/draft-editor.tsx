"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { distance } from "fastest-levenshtein";
import { BrainCircuit, FlaskConical, Loader2, Quote, RefreshCw, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { rateDraft, sendDraft, switchHook, type ActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { SourceLink, StatusBadge } from "@/components/common";
import { ungrounded } from "@/lib/grounding";
import { cn } from "@/lib/utils";

type Item = { id: string; field: string; fact: string; quote: string | null; url: string | null; date: string | null };
export type Draft = {
  id: number; company_id: number; status: string; subject: string | null; original_body: string | null;
  hook: { evidence_id?: string; date?: string; quote?: string; url?: string } | null;
  pain_points: { text: string; evidence_id: string }[] | null; claims: { text: string; evidence_id: string }[] | null;
  evidence_catalog: Item[] | null; hook_candidates: Item[] | null; validator_log: { attempt: number; errors: string[] }[] | null;
  rating: number | null; company: string; domain: string | null; funding_stage: string | null; needs_review: boolean;
  queued_action: string | null; full_name: string | null; first_name: string | null; title: string | null; poc_email: string | null;
  is_mock: boolean | null; confidence: number | null; verification_status: string | null; pick_reason: string | null;
  lessons: { id: number; scope: string; lesson: string }[];
};

const TAGS = ["great hook", "too generic", "too long", "wrong tone", "wrong person", "weak hook", "factual issue"];

function Evidence({ item, label }: { item?: Item; label: string }) {
  if (!item) return <span className="text-muted-foreground">{label}</span>;
  return (
    <span className="group relative inline-flex">
      <span className="cursor-help rounded-md bg-plum-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-plum">{label}</span>
      <span className="pointer-events-none absolute right-0 bottom-full z-20 mb-2 hidden w-72 rounded-xl border bg-popover p-3 text-xs leading-relaxed shadow-xl group-hover:block">
        <span className="mb-1 block font-medium text-foreground">{item.fact}</span>
        {item.quote && <span className="block text-muted-foreground">“{item.quote.slice(0, 220)}”</span>}
        <span className="mt-1 block text-muted-foreground">{item.field}{item.date ? ` · ${item.date}` : ""}</span>
      </span>
    </span>
  );
}

export function DraftEditor({ draft, myEmail }: { draft: Draft; myEmail: string }) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.original_body ?? "");
  const [hook, setHook] = useState(draft.hook?.evidence_id ?? "");
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const catalog = draft.evidence_catalog ?? [];
  const byId = Object.fromEntries(catalog.map((i) => [i.id, i]));
  const original = draft.original_body ?? "";

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const editRate = distance(original, body) / Math.max(original.length, body.length, 1);
  const warnings = useMemo(
    () => ungrounded(body, [draft.company, draft.domain, draft.full_name, draft.title, ...catalog.flatMap((i) => [i.fact, i.quote, i.date])]),
    [body], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) after?.();
    });

  const lastErrors = draft.validator_log?.at(-1)?.errors ?? [];
  return (
    <div data-animate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* the email, as it will arrive */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-18px_rgba(101,10,65,0.25)]">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-5 py-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#E5E0D9]" /><span className="size-2.5 rounded-full bg-[#E5E0D9]" /><span className="size-2.5 rounded-full bg-[#E5E0D9]" />
          </span>
          <span className="ml-2 text-sm font-semibold">{draft.company}</span>
          <StatusBadge status={draft.status === "flagged" ? "flagged" : "drafted"} />
          {draft.needs_review && <span className="rounded-full bg-info/12 px-2.5 py-0.5 text-[11.5px] font-medium text-info">hook review</span>}
          {draft.queued_action && <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11.5px]">queued: {draft.queued_action}</span>}
          {draft.is_mock && <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-[11.5px] font-medium text-warning"><FlaskConical className="size-3" /> mock contact</span>}
        </div>
        <div className="divide-y text-sm">
          <div className="flex gap-3 px-5 py-2.5"><span className="w-16 text-muted-foreground">From</span><span>Sprinto Outreach</span></div>
          <div className="flex gap-3 px-5 py-2.5"><span className="w-16 text-muted-foreground">To</span>
            <span className="min-w-0"><span className="font-medium">{myEmail}</span> <span className="text-muted-foreground">· written for {draft.full_name}, {draft.title}</span></span></div>
          <label className="flex items-center gap-3 px-5 py-1.5"><span className="w-16 text-muted-foreground">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 flex-1 bg-transparent font-medium outline-none" /></label>
        </div>
        <div className="border-t px-5 py-5 sm:px-8 sm:py-7">
          <textarea value={body} onChange={(e) => { setBody(e.target.value); setConfirm(false); }}
            className="min-h-[420px] w-full resize-y bg-transparent text-[15px] leading-[1.75] outline-none" aria-label="Email body" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-muted/30 px-5 py-3 text-xs">
          <span className={cn("tabular", words >= 120 ? "font-medium text-destructive" : "text-muted-foreground")}>{words} / 120 words</span>
          <span className="tabular text-muted-foreground">edited {(editRate * 100).toFixed(1)}%</span>
          {warnings.length ? <span className="text-warning">Not in evidence: {warnings.join(", ")}</span> : <span className="text-success">Every name and number is grounded</span>}
          <span className="flex-1" />
          <ShimmerButton disabled={pending || !body.trim()} background="#650A41" shimmerColor="#F2B8D3" borderRadius="999px"
            className="h-10 px-5 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => (confirm ? run(() => sendDraft(draft.id, subject, body)) : setConfirm(true))}>
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
            {confirm ? "Confirm send" : "Approve & send"}
          </ShimmerButton>
        </div>
        {draft.status === "flagged" && lastErrors.length > 0 && (
          <div className="border-t bg-destructive/5 px-5 py-3 text-xs text-destructive">Validator: {lastErrors.join("; ")}</div>
        )}
      </section>

      {/* why this email */}
      <aside className="space-y-4">
        <div className="rounded-2xl border bg-card p-5">
          <div className="eyebrow mb-3">Why this person</div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-plum text-sm font-semibold text-primary-foreground">
              {(draft.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{draft.full_name}</div>
              <div className="truncate text-xs text-muted-foreground">{draft.title} · {draft.verification_status}, {draft.confidence}%</div>
            </div>
          </div>
          {draft.pick_reason && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{draft.pick_reason}</p>}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="eyebrow mb-3">Hook · {draft.hook?.date}</div>
          <p className="text-sm leading-relaxed"><Quote className="mr-1 inline size-3.5 -translate-y-0.5 text-plum" />{draft.hook?.quote} <SourceLink href={draft.hook?.url} /></p>
          {(draft.hook_candidates?.length ?? 0) > 1 && (
            <div className="mt-3 flex gap-2">
              <select value={hook} onChange={(e) => setHook(e.target.value)}
                className="h-8 min-w-0 flex-1 rounded-full border bg-background px-3 text-xs outline-none">
                {draft.hook_candidates!.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.date} · {c.fact.slice(0, 48)}</option>)}
              </select>
              <Button size="sm" variant="outline" className="rounded-full" disabled={pending || hook === draft.hook?.evidence_id}
                onClick={() => run(() => switchHook(draft.id, hook))}><RefreshCw /> Redraft</Button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="eyebrow mb-3">Pain points</div>
          <ul className="space-y-3">
            {(draft.pain_points ?? []).map((p, i) => (
              <li key={i} className="text-sm leading-relaxed">{p.text} <Evidence item={byId[p.evidence_id]} label={p.evidence_id} /></li>
            ))}
          </ul>
          {(draft.claims?.length ?? 0) > 0 && (
            <>
              <div className="eyebrow mt-5 mb-2">Claims in the email</div>
              <ul className="space-y-2">
                {draft.claims!.map((c, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
                    <span className="line-clamp-2">{c.text}</span><Evidence item={byId[c.evidence_id]} label={c.evidence_id} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {draft.lessons.length > 0 && (
          <div className="rounded-2xl border border-plum/20 bg-plum-soft p-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-plum uppercase"><BrainCircuit className="size-3.5" /> Learnings applied</div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-foreground/80">{draft.lessons.map((l) => <li key={l.id}>{l.lesson}</li>)}</ul>
          </div>
        )}

        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">Rate the draft</span>
            {draft.rating != null && <span className="text-xs text-muted-foreground">rated {draft.rating > 0 ? "👍" : "👎"}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => (
              <button key={t} type="button" onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
                className={cn("rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                  tags.includes(t) ? "border-plum bg-plum-soft text-plum" : "text-muted-foreground hover:border-foreground/30")}>{t}</button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input placeholder="What should change?" value={note} onChange={(e) => setNote(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-full border bg-background px-3 text-xs outline-none" />
            <Button size="icon-sm" variant="outline" className="rounded-full" aria-label="Good draft" disabled={pending}
              onClick={() => run(() => rateDraft(draft.id, 1, tags, note), () => { setTags([]); setNote(""); })}><ThumbsUp /></Button>
            <Button size="icon-sm" variant="outline" className="rounded-full" aria-label="Bad draft" disabled={pending}
              onClick={() => run(() => rateDraft(draft.id, -1, tags, note), () => { setTags([]); setNote(""); })}><ThumbsDown /></Button>
          </div>
        </div>

        <details className="rounded-2xl border bg-card p-5 text-sm">
          <summary className="cursor-pointer eyebrow">Evidence catalog ({catalog.length})</summary>
          <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-xs scrollbar-thin">
            {catalog.map((i) => <li key={i.id}><span className="font-mono font-medium text-plum">{i.id}</span> {i.fact}{i.date && <span className="text-muted-foreground"> · {i.date}</span>} <SourceLink href={i.url} /></li>)}
          </ul>
        </details>
      </aside>
    </div>
  );
}
