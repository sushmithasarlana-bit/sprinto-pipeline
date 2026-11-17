"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Building2, Inbox, LayoutDashboard, MailCheck, Menu, Play, RefreshCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

export type NavCounts = { review: number; drafts: number; loop: number };

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; key: keyof NavCounts | null };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Pipeline",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, key: null },
      { href: "/run", label: "Run on domains", icon: Play, key: null },
      { href: "/companies", label: "Companies", icon: Building2, key: null },
    ],
  },
  {
    label: "Human gates",
    items: [
      { href: "/review", label: "Review queue", icon: Inbox, key: "review" },
      { href: "/drafts", label: "Drafts & sends", icon: MailCheck, key: "drafts" },
    ],
  },
  {
    label: "Learning",
    items: [{ href: "/loop", label: "Feedback loop", icon: RefreshCcw, key: "loop" }],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);
const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function NavList({ counts, onNavigate }: { counts: NavCounts; onNavigate?: () => void }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const active = ALL.findIndex((n) => isActive(pathname, n.href));

  // The active highlight glides between items instead of jumping.
  useLayoutEffect(() => {
    const el = navRef.current?.querySelectorAll<HTMLElement>("[data-nav]")[active];
    if (!el || !pill.current) {
      if (pill.current) gsap.to(pill.current, { opacity: 0, duration: 0.2 });
      return;
    }
    gsap.to(pill.current, { y: el.offsetTop, height: el.offsetHeight, opacity: 1, duration: 0.45, ease: "power3.out" });
  }, [active]);

  return (
    <nav ref={navRef} className="relative flex flex-col">
      <div ref={pill} className="absolute inset-x-0 top-0 rounded-full bg-sidebar-accent opacity-0" aria-hidden />
      {GROUPS.map((g) => (
        <div key={g.label} className="mb-4">
          <div className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.12em] text-sidebar-foreground/55 uppercase">
            {g.label}
          </div>
          {g.items.map((n) => {
            const i = ALL.findIndex((x) => x.href === n.href);
            const Icon = n.icon;
            const count = n.key ? counts[n.key] : 0;
            const on = i === active;
            return (
              <Link key={n.href} href={n.href} data-nav onClick={onNavigate}
                className={cn(
                  "relative z-10 flex items-center gap-3 rounded-full px-3 py-2 text-[13.5px] transition-colors",
                  on ? "font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:text-sidebar-accent-foreground",
                )}>
                <Icon className="size-4 opacity-90" strokeWidth={1.8} />
                <span className="flex-1">{n.label}</span>
                {count > 0 && (
                  <span className="tabular min-w-5 rounded-full bg-white/15 px-1.5 py-0.5 text-center text-[11px] font-medium text-white">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ counts }: { counts: NavCounts }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col bg-sidebar px-3 py-5 text-sidebar-foreground lg:flex">
      <Link href="/" className="mb-8 px-3 text-white">
        <Logo tone="light" />
      </Link>
      <NavList counts={counts} />
      <div className="mt-auto space-y-3 px-3 text-[11.5px] leading-relaxed text-sidebar-foreground/60">
        <p>
          Gemini extracts and writes. Python rules decide. Clean drafts send themselves to your inbox; anything
          flagged waits for you.
        </p>
        <p className="text-sidebar-foreground/45">Case-study build · not affiliated with Sprinto</p>
      </div>
    </aside>
  );
}

export function MobileNav({ counts }: { counts: NavCounts }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (open && panel.current) gsap.fromTo(panel.current, { x: -24, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.3, ease: "power3.out" });
  }, [open]);
  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(true)} aria-label="Open menu"
        className="grid size-9 place-items-center rounded-full border bg-card text-foreground">
        <Menu className="size-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div ref={panel} className="flex h-full w-[280px] flex-col bg-sidebar px-3 py-5 text-sidebar-foreground shadow-2xl">
            <div className="mb-8 flex items-center justify-between px-3 text-white">
              <Logo tone="light" />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid size-8 place-items-center rounded-full bg-white/10">
                <X className="size-4" />
              </button>
            </div>
            <NavList counts={counts} onNavigate={() => setOpen(false)} />
          </div>
          <button className="flex-1 bg-black/40 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
