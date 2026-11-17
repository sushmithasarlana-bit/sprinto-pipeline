-- 006: runs started from the web dashboard (GitHub Actions dispatch), for history and the daily cap.
CREATE TABLE pipeline_triggers (
    id              bigserial PRIMARY KEY,
    created_at      timestamptz NOT NULL DEFAULT now(),
    domains         text[] NOT NULL,
    hunter_mode     text NOT NULL CHECK (hunter_mode IN ('live', 'mock')),
    github_run_id   bigint,
    github_run_url  text,
    status          text NOT NULL DEFAULT 'dispatched',
    error           text
);
