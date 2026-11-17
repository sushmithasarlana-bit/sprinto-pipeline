import { sql } from "@/lib/db";

/** Company search for the ⌘K palette. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const like = `%${q}%`;
  const rows = await sql`
    SELECT id::int, name, domain, status, funding_stage FROM companies
    WHERE (last_run_id IS NOT NULL OR source = 'manual')
      AND (${q} = '' OR name ILIKE ${like} OR domain ILIKE ${like})
    ORDER BY (status IN ('drafted','sent','qualified')) DESC, updated_at DESC
    LIMIT 8`;
  return Response.json({ results: rows });
}
