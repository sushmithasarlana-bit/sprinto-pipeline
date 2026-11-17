import "server-only";

/**
 * The Python pipeline runs on GitHub Actions (Vercel can't crawl for minutes). The dashboard starts
 * the "Run on domains" workflow with a fine-grained token that only has Actions read/write on this repo.
 */
const REPO = process.env.GITHUB_REPO || "varunagarwal-hub/sprinto-pipeline";
const WORKFLOW = "run-domains.yml";
const API = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`;

export const hasDispatchToken = () => Boolean(process.env.GITHUB_DISPATCH_TOKEN);
export const repoActionsUrl = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;

const headers = () => ({
  Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

export async function dispatchRun(domains: string[], hunterMode: "live" | "mock", triggerId: number) {
  const res = await fetch(`${API}/dispatches`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      ref: "main",
      inputs: { domains: domains.join(","), hunter_mode: hunterMode, trigger_id: String(triggerId) },
      return_run_details: true,
    }),
    cache: "no-store",
  });
  if (!res.ok && res.status !== 204) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (res.status === 204) return { runId: null as number | null, url: repoActionsUrl };
  const body = (await res.json().catch(() => ({}))) as { workflow_run_id?: number; html_url?: string };
  return { runId: body.workflow_run_id ?? null, url: body.html_url ?? repoActionsUrl };
}

export type WorkflowRun = { id: number; status: string; conclusion: string | null; created_at: string; html_url: string };

export async function recentRuns(): Promise<WorkflowRun[]> {
  if (!hasDispatchToken()) return [];
  try {
    const res = await fetch(`${API}/runs?per_page=6`, { headers: headers(), cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { workflow_runs: WorkflowRun[] };
    return body.workflow_runs.map(({ id, status, conclusion, created_at, html_url }) => ({ id, status, conclusion, created_at, html_url }));
  } catch {
    return [];
  }
}
