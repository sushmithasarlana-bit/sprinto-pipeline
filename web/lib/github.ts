import "server-only";

/**
 * The Python pipeline runs on GitHub Actions (Vercel can't crawl for minutes). The dashboard starts
 * one of two workflows with a fine-grained token that only has Actions read/write on this repo:
 *   - discover: weekly-run.yml, the main mode (funding news -> shortlist -> research -> contact -> email)
 *   - domains:  run-domains.yml, the same pipeline on a list of domains you give it
 */
const REPO = process.env.GITHUB_REPO || "sushmithasarlana-bit/sprinto-pipeline";
export const WORKFLOWS = { discover: "weekly-run.yml", domains: "run-domains.yml" } as const;
export type RunMode = keyof typeof WORKFLOWS;

const api = (path: string) => `https://api.github.com/repos/${REPO}/actions${path}`;

export const hasDispatchToken = () => Boolean(process.env.GITHUB_DISPATCH_TOKEN);
export const repoActionsUrl = `https://github.com/${REPO}/actions`;

const headers = () => ({
  Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

export async function dispatchWorkflow(mode: RunMode, inputs: Record<string, string>) {
  const workflow = WORKFLOWS[mode];
  const res = await fetch(api(`/workflows/${workflow}/dispatches`), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ref: "main", inputs, return_run_details: true }),
    cache: "no-store",
  });
  if (!res.ok && res.status !== 204) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const fallback = `https://github.com/${REPO}/actions/workflows/${workflow}`;
  if (res.status === 204) return { runId: null as number | null, url: fallback };
  const body = (await res.json().catch(() => ({}))) as { workflow_run_id?: number; html_url?: string };
  return { runId: body.workflow_run_id ?? null, url: body.html_url ?? fallback };
}

export type WorkflowRun = { id: number; status: string; conclusion: string | null; created_at: string; html_url: string };

/** Recent manually started runs of either workflow, to show live status next to each web trigger. */
export async function recentRuns(): Promise<WorkflowRun[]> {
  if (!hasDispatchToken()) return [];
  try {
    const res = await fetch(api(`/runs?event=workflow_dispatch&per_page=12`), { headers: headers(), cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { workflow_runs: WorkflowRun[] };
    return body.workflow_runs.map(({ id, status, conclusion, created_at, html_url }) => ({ id, status, conclusion, created_at, html_url }));
  } catch {
    return [];
  }
}
