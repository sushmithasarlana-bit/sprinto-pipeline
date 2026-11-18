-- 007: web runs can be a discovery run (news -> shortlist -> research) or a run on given domains.
ALTER TABLE pipeline_triggers ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'domains'
    CHECK (mode IN ('discover', 'domains'));
ALTER TABLE pipeline_triggers ADD COLUMN IF NOT EXISTS target int;
