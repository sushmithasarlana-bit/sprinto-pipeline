"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

const ORDER = ["light", "dark", "system"] as const;
const ICON = { light: Sun, dark: Moon, system: Monitor };

/** One round button that cycles light → dark → system. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // true only on the client, so the active theme is never guessed during server render
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const current = (mounted ? theme : "system") as (typeof ORDER)[number];
  const Icon = ICON[current] ?? Monitor;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  return (
    <button onClick={() => setTheme(next)} aria-label={`Theme: ${current}. Switch to ${next}`} title={`Theme: ${current}`}
      className="grid size-9 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground">
      <Icon className="size-4" />
    </button>
  );
}
