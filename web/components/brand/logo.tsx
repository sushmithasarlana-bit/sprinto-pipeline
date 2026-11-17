import { cn } from "@/lib/utils";

/**
 * Original mark for this case-study build, in Sprinto's visual language (plum tile, slanted bars)
 * without reproducing Sprinto's trademark: two forward-leaning bars for speed, and a dot for the
 * outbound signal the pipeline sends.
 */
export function LogoMark({ className, tone = "plum" }: { className?: string; tone?: "plum" | "light" }) {
  const tile = tone === "plum" ? "#650A41" : "#FFFFFF";
  const ink = tone === "plum" ? "#FFFFFF" : "#650A41";
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill={tile} />
      <path d="M10.2 11.5h11.2l-1.6 3.2H8.6z" fill={ink} />
      <path d="M12.2 17.3h11.2l-1.6 3.2H10.6z" fill={ink} opacity="0.82" />
      <circle cx="24.2" cy="9.2" r="1.9" fill={tone === "plum" ? "#F2B8D3" : "#C25A8C"} />
    </svg>
  );
}

export function Logo({ className, tone = "light", sub = "Outreach" }: { className?: string; tone?: "plum" | "light"; sub?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark tone={tone} />
      <span className="leading-none">
        <span className="block text-[13px] font-semibold tracking-[0.22em] uppercase">Sprinto</span>
        <span className="mt-1 block text-[11px] font-medium tracking-[0.08em] uppercase opacity-70">{sub}</span>
      </span>
    </span>
  );
}
