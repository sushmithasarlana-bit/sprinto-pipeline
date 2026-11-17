# Demo script (about 8 minutes)

Live dashboard: https://sprinto-outreach-delta.vercel.app · Slides: the "Sprinto Outreach Pipeline" deck (13 slides, speaker notes on each).

Open the dashboard in one tab before you start. Have a terminal in the repo ready for the optional live command at the end.

## 0. Frame it (slides 1–3, 1 min)
- The problem: a Growth Lead spends 15–20 minutes per prospect researching, finding the person and writing.
- The design: cheap rules for the whole pool, expensive research for 20 at a time, a human approves every send.
- The principle to repeat: **Gemini extracts and writes; Python decides; a human approves.**

## 1. Overview page (1 min)
- Point at the run KPIs: pool 313 at the start of run 2, 14 researched, 5 of 5 qualified, stop reason `target_reached` inside the first batch.
- Funnel: pool → researched → qualified → drafted → sent.
- Measurement panel (spec §9): batch-1 hit rate 5/20, flag rate, fetches per company (cap 6), average edit rate.
- Drop reasons: "competitor trust vendor" (Vanta) and "certifications" (already holds all three).

## 2. Defend one decision end to end (2 min)
Companies → **Pearler** (or **Namespace** for a drop).
- **Gates & evidence tab:** every gate with its verbatim quote, source URL and date. For Pearler: "Pearler is ISO 27001 certified." from `/legal/security`, which makes it an upsell, not a drop.
- **Research tab:** the agent loop (which unknown it chased, which page it fetched) and the pages fetched.
- **Contact tab:** the person Hunter returned and the rule that picked them, with the full Hunter response stored.
- **Emails tab:** the generated email and the sent email side by side, with the edit rate.
- For Namespace: the trust page loads `vanta.com` in its HTML, so it is dropped as a competitor's customer.

## 3. Review queue (1 min), human gate 1
- Flagged companies with the reason (no suitable contact in Hunter, site blocks crawlers, domain not confirmed).
- Show the buttons: Qualify, Drop with a reason, Provide domain. Explain that research-heavy actions are **queued** and run on the next `python main.py sync` or weekly run, because Vercel cannot crawl.

## 4. Drafts & sends (2 min), human gate 2
- Open a draft (for example **Adfin** or **CARPL.ai**). Show the PoC and why they were picked, the hook with its source and date, and the pain points linked to evidence.
- Edit a sentence and point at the live checks: word count, edit rate, and "All terms grounded" changing to a warning if you type a fact that is not in the evidence (try adding "Goldman Sachs").
- Show the rating chips (great hook / too generic …).
- **Approve & send** only if you want a live email: it goes to your own inbox, never to the prospect.
- Sent table: the outcome selector is where prospect replies are recorded.

## 5. Feedback loop page (1.5 min), the slide's "four of six were empty"
- All six stages now hold data: Act 10 · Signal 33 · Capture 33 · Store 9 · Retrieve 12 · Apply 2.
- Learnings table: "Do not use 'audit fire drills'" (enforced by the validator after 3 sends cut it), "Open with 'Congrats on…'", "For executives, frame around buyer questionnaires".
- Then open **Niural** in Drafts: the rewritten draft follows those learnings ("Congrats on…", no "fire drills", one short ask). Slide 11 shows before and after.
- Be upfront: the first review session (4 edited sends, 4 ratings) was run by Claude on your instruction and is labelled that way in the data; learnings can be retired from this page.

## 6. Operations (30 s)
- Pushes to `main` redeploy on Vercel; a GitHub Action runs Stage 1 and a batch every Monday (Actions → Weekly pipeline run → Run workflow to trigger it by hand).
- Resend delivery and bounce events arrive through a signed webhook and are captured as signals.

## Optional live command
```bash
.venv/Scripts/python main.py sync
```
Runs queued web actions, captures and distils new signals. Show the Feedback loop page update afterwards.

## Likely questions
- **Why not let the LLM qualify?** Rules are explainable and testable (111 unit tests); the LLM only produces evidence with quotes that code verifies.
- **What stops invented facts?** Quote verification on extraction, and the email validator: every number and proper noun must appear in the evidence or Sprinto's value props.
- **Why are so many companies flagged?** Unresolved domains and missing contacts. The pipeline never guesses; a human fills the gap.
- **What would you do next?** Real prospect sends so outcomes (replies, meetings) drive hook and rank learning.
