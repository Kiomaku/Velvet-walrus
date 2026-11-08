import { Pool, types } from 'pg';
import { config } from './config';

// BIGINT / COUNT come back as strings by default; ids and counts here are safely < 2^53.
types.setTypeParser(20, Number);

export const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id           BIGSERIAL PRIMARY KEY,
  queue        TEXT        NOT NULL DEFAULT 'default',
  name         TEXT        NOT NULL,
  payload      JSONB       NOT NULL DEFAULT '{}',
  priority     INT         NOT NULL DEFAULT 0,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','active','completed','dead')),
  attempts     INT         NOT NULL DEFAULT 0,
  max_attempts INT         NOT NULL DEFAULT 5,
  run_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by    TEXT,
  locked_at    TIMESTAMPTZ,
  last_error   TEXT,
  result       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
-- Partial index: only runnable rows pay for index maintenance.
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (queue, priority DESC, run_at, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status, created_at DESC);
`;

/** Advisory lock so api + N workers booting together don't race on DDL. */
export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(SCHEMA);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
  }
}
