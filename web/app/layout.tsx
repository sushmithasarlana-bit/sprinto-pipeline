import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar, type LastRun } from "@/components/shell/topbar";
import { sql } from "@/lib/db";
import "./globals.css";

const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Sprinto Outreach", template: "%s · Sprinto Outreach" },
  description: "From funding news to an approved cold email: research, qualify, contact, send and learn.",
};
export const dynamic = "force-dynamic";

async function shellData() {
  try {
    const [[counts], [lastRun]] = await Promise.all([
      sql`SELECT (SELECT count(*)::int FROM companies WHERE status = 'flagged'
                    OR (needs_review AND status IN ('qualified','drafted'))) review,
                 (SELECT count(*)::int FROM emails WHERE status IN ('drafted','flagged')) drafts,
                 (SELECT count(*)::int FROM feedback_events WHERE processed_at IS NULL) loop`,
      sql`SELECT id::int, status, stop_reason, started_at, notes FROM runs ORDER BY id DESC LIMIT 1`,
    ]);
    return { counts: counts as { review: number; drafts: number; loop: number }, lastRun: (lastRun ?? null) as LastRun };
  } catch {
    return { counts: { review: 0, drafts: 0, loop: 0 }, lastRun: null };
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { counts, lastRun } = await shellData();
  return (
    <html lang="en" suppressHydrationWarning className={`${instrument.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <div className="flex min-h-dvh">
            <Sidebar counts={counts} />
            <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
              <TopBar counts={counts} lastRun={lastRun} />
              <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pt-8 pb-16 sm:px-8 lg:pt-10">{children}</main>
            </div>
          </div>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
