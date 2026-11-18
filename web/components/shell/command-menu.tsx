"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ArrowRight, Building2, CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { kind: "page" | "company"; label: string; hint?: string; href: string };

const PAGES: Item[] = [
  { kind: "page", label: "Overview", href: "/" },
  { kind: "page", label: "Run pipeline", href: "/run" },
  { kind: "page", label: "Review queue", href: "/review" },
  { kind: "page", label: "Drafts & sends", href: "/drafts" },
  { kind: "page", label: "Companies", href: "/companies" },
  { kind: "page", label: "Feedback loop", href: "/loop" },
];

/** ⌘K / Ctrl+K: jump to any page or company. */
export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [companies, setCompanies] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const { results } = (await r.json()) as { results: { id: number; name: string; domain: string | null; status: string }[] };
        setCompanies(results.map((c) => ({ kind: "company", label: c.name, hint: `${c.domain ?? "no domain"} · ${c.status}`, href: `/companies/${c.id}` })));
      } catch {
        setCompanies([]);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [q, open]);

  useLayoutEffect(() => {
    if (open && box.current) gsap.fromTo(box.current, { y: -8, scale: 0.98, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.22, ease: "power2.out" });
  }, [open]);

  const items = useMemo(() => {
    const pages = PAGES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()));
    return [...pages, ...companies];
  }, [q, companies]);

  const go = useCallback((it: Item | undefined) => {
    if (!it) return;
    setOpen(false);
    setQ("");
    router.push(it.href);
  }, [router]);

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-[320px] items-center gap-2 rounded-full border bg-card px-3.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20">
        <Search className="size-4" />
        <span className="flex-1 truncate text-left"><span className="sm:hidden">Search…</span><span className="hidden sm:inline">Search companies, pages…</span></span>
        <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] sm:block">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
          <div ref={box} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search"
            className="w-full max-w-lg overflow-hidden rounded-2xl border bg-popover shadow-2xl">
            <div className="flex items-center gap-2 border-b px-4">
              <Search className="size-4 text-muted-foreground" />
              <input autoFocus value={q} placeholder="Type a company, domain or page"
                onChange={(e) => { setQ(e.target.value); setIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
                  if (e.key === "Enter") go(items[idx]);
                }}
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2 scrollbar-thin">
              {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>}
              {items.map((it, i) => (
                <li key={`${it.kind}-${it.href}`}>
                  <button onMouseEnter={() => setIdx(i)} onClick={() => go(it)}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm",
                      i === idx ? "bg-accent text-accent-foreground" : "text-foreground")}>
                    {it.kind === "company" ? <Building2 className="size-4 opacity-70" /> : <ArrowRight className="size-4 opacity-70" />}
                    <span className="flex-1 truncate font-medium">{it.label}</span>
                    {it.hint && <span className="truncate text-xs text-muted-foreground">{it.hint}</span>}
                    {i === idx && <CornerDownLeft className="size-3.5 opacity-60" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
