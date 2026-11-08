import { pool } from './db';
import { config } from './config';

export type JobStatus = 'pending' | 'active' | 'completed' | 'dead';

export interface Job {
  id: number;
  queue: string;
  name: string;
  payload: Record<string, unknown>;
  priority: number;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: Date;
  locked_by: string | null;
  last_error: string | null;
  result: unknown;
  created_at: Date;
  finished_at: Date | null;
}

export interface EnqueueOptions {
  queue?: string;
  priority?: number;
  maxAttempts?: number;
  /** Run no earlier than now + delayMs (scheduled jobs). */
  delayMs?: number;
}

export async function enqueue(name: string, payload: object = {}, opts: EnqueueOptions = {}): Promise<Job> {
  const { rows } = await pool.query<Job>(
    `INSERT INTO jobs (queue, name, payload, priority, max_attempts, run_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))
     RETURNING *`,
    [opts.queue ?? 'default', name, payload, opts.priority ?? 0, opts.maxAttempts ?? 5, (opts.delayMs ?? 0) / 1000],
  );
  return rows[0];
}

/** SKIP LOCKED lets many workers claim disjoint rows without blocking each other. */
export async function claim(queue: string, workerId: string, limit: number): Promise<Job[]> {
  if (limit <= 0) return [];
  const { rows } = await pool.query<Job>(
    `UPDATE jobs SET status = 'active', locked_by = $2, locked_at = now(), attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM jobs
       WHERE queue = $1 AND status = 'pending' AND run_at <= now()
       ORDER BY priority DESC, run_at, id
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [queue, workerId, limit],
  );
  return rows;
}

export const complete = (id: number, result: unknown) =>
  pool.query(
    `UPDATE jobs SET status = 'completed', result = $2, finished_at = now(), last_error = NULL WHERE id = $1`,
    [id, JSON.stringify(result ?? null)],
  );

/** Exponential backoff with full jitter: random(0, min(cap, base * 2^(attempt-1))). */
export function backoffSeconds(attempt: number): number {
  const ceiling = Math.min(config.backoff.capSec, config.backoff.baseSec * 2 ** (attempt - 1));
  return Math.random() * ceiling;
}

/** Retry with backoff, or move to the dead-letter state once attempts are exhausted. */
export const fail = (job: Pick<Job, 'id' | 'attempts'>, error: string) =>
  pool.query(
    `UPDATE jobs SET
       status      = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END,
       run_at      = now() + make_interval(secs => $3),
       last_error  = $2,
       locked_by   = NULL,
       locked_at   = NULL,
       finished_at = CASE WHEN attempts >= max_attempts THEN now() END
     WHERE id = $1`,
    [job.id, error.slice(0, 2000), backoffSeconds(job.attempts)],
  );

/** Crash recovery: re-queue (or bury) jobs whose worker vanished mid-flight. */
export async function reapStale(visibilityTimeoutSec: number): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE jobs SET
       status      = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END,
       last_error  = 'worker lost (visibility timeout)',
       locked_by   = NULL,
       locked_at   = NULL,
       finished_at = CASE WHEN attempts >= max_attempts THEN now() END
     WHERE status = 'active' AND locked_at < now() - make_interval(secs => $1)`,
    [visibilityTimeoutSec],
  );
  return rowCount ?? 0;
}

export const retryDead = (id: number) =>
  pool.query(
    `UPDATE jobs SET status = 'pending', attempts = 0, run_at = now(), finished_at = NULL
     WHERE id = $1 AND status = 'dead'`,
    [id],
  );
