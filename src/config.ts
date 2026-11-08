const int = (key: string, fallback: number): number => {
  const v = process.env[key];
  return v ? Number.parseInt(v, 10) : fallback;
};

export const config = {
  port: int('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://walrus:walrus@localhost:5432/walrus',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  worker: {
    concurrency: int('WORKER_CONCURRENCY', 5),
    pollMs: int('WORKER_POLL_MS', 500),
    queues: (process.env.WORKER_QUEUES ?? 'default,emails,media').split(','),
    jobTimeoutMs: int('JOB_TIMEOUT_MS', 30_000),
    /** An active job whose lock is older than this is assumed orphaned by a crashed worker. */
    visibilityTimeoutSec: int('VISIBILITY_TIMEOUT_SEC', 60),
    shutdownGraceMs: int('SHUTDOWN_GRACE_MS', 30_000),
  },
  backoff: { baseSec: 2, capSec: 15 * 60 },
  author: {
    name: process.env.AUTHOR_NAME ?? 'Barsam Bahrami',
    nameFa: process.env.AUTHOR_NAME_FA ?? 'برسام بهرامی',
    url: process.env.AUTHOR_URL ?? 'https://barsambahrami.ir',
  },
} as const;
