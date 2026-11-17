"use client";

import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Brain, FileSearch, Globe, Mail, ShieldCheck, Target, UserCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

export type TrackerCounts = {
  pool: number; scraped: number; qualified: number; contacts: number; drafted: number; sent: number; review: number;
};

/**
 * The case's 7-step pipeline as one horizontal tracker, with the two human gates drawn as checkpoints.
 * Counts are live from Neon.
 */
export function PipelineTracker({ c }: { c: TrackerCounts }) {
  const scope = useRef<HTMLDivElement>(null);
  const steps = [
    { n: 1, label: "Scrape", sub: "website signal", icon: Globe, value: c.scraped, href: "/companies" },
    { n: 2, label: "Extract", sub: "facts + quotes", icon: FileSearch, value: c.scraped, href: "/companies" },
    { n: 3, label: "Qualify", sub: "rules + agent loop", icon: Target, value: c.qualified, href: "/companies?status=qualified" },
    { n: 4, label: "Find PoC", sub: "Hunter + title rules", icon: UserRound, value: c.contacts, href: "/drafts" },
    { n: 5, label: "Pain points", sub: "2, evidence-linked", icon: Brain, value: c.drafted, href: "/drafts" },
    { n: 6, label: "Draft", sub: "validated email", icon: ShieldCheck, value: c.drafted, href: "/drafts" },
    { n: 7, label: "Send", sub: "auto, to your inbox", icon: Mail, value: c.sent, href: "/drafts" },
  ];

  useGSAP(() => {
    gsap.from("[data-step]", { autoAlpha: 0, y: 10, duration: 0.45, stagger: 0.06, ease: "power2.out" });
    gsap.from("[data-rail]", { scaleX: 0, transformOrigin: "left center", duration: 1.1, ease: "power3.inOut", delay: 0.1 });
  }, { scope });

  return (
    <section ref={scope} data-animate className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">The case pipeline</div>
          <h2 className="mt-1 text-[15px] font-semibold">Seven steps from a domain to an email in your inbox</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-plum" /> automatic</span>
          <span className="flex items-center gap-1.5"><UserCheck className="size-3.5 text-warning" /> human gate</span>
        </div>
      </div>
      <div className="relative overflow-x-auto overflow-y-hidden pt-1 pb-2 scrollbar-thin">
        <div className="relative grid min-w-[760px] grid-cols-7 gap-2">
          <div data-rail className="absolute top-[22px] right-[7%] left-[7%] h-px bg-gradient-to-r from-plum/50 via-plum/30 to-plum/50" aria-hidden />
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.n} href={s.href} data-step className="group relative flex flex-col items-center text-center">
                <span className="relative z-10 grid size-11 place-items-center rounded-full border-2 border-card bg-plum text-primary-foreground shadow-[0_0_0_1px_var(--border)] transition-transform group-hover:-translate-y-0.5">
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </span>
                <span className="mt-3 text-[11px] font-medium text-muted-foreground">Step {s.n}</span>
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-xs text-muted-foreground">{s.sub}</span>
                <span className="tabular mt-2 text-[22px] leading-none font-semibold text-plum">{s.value}</span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Gate href="/review" title="Gate 1 · Review queue" count={c.review}
          body="Companies the rules could not settle (unknown SaaS status or stage, no contact, unresolved domain) wait here. Nothing is guessed." />
        <Gate href="/drafts" title="Gate 2 · Drafts" count={Math.max(c.drafted - c.sent, 0)}
          body="Drafts that need a hook review, or that you want to edit, wait here. Clean, validated drafts send themselves to your inbox." />
      </div>
    </section>
  );
}

function Gate({ href, title, body, count }: { href: string; title: string; body: string; count: number }) {
  return (
    <Link href={href} className={cn("flex gap-3 rounded-xl border border-dashed border-warning/50 bg-warning/[0.06] p-4 transition-colors hover:bg-warning/10")}>
      <UserCheck className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold">{title}
          {count > 0 && <span className="tabular rounded-full bg-warning/20 px-2 py-0.5 text-[11px] text-warning">{count} waiting</span>}
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </Link>
  );
}
