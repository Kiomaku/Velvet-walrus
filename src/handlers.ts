import type { Job } from './queue';

export type Handler = (job: Job) => Promise<unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Per-queue settings. `rateLimitPerSec` is enforced cluster-wide through Redis. */
export const queues: Record<string, { rateLimitPerSec?: number }> = {
  default: {},
  emails: { rateLimitPerSec: 5 },
  media: { rateLimitPerSec: 2 },
};

/** Demo handlers: swap these for your real work. Throwing = failure = retry/backoff. */
export const handlers: Record<string, Handler> = {
  'email.send': async (job) => {
    await sleep(200 + Math.random() * 400);
    if (Math.random() < 0.3) throw new Error('SMTP 451: try again later');
    return { delivered: true, to: job.payload.to ?? 'someone@example.com' };
  },
  'image.resize': async () => {
    await sleep(1500 + Math.random() * 1500);
    return { variants: ['256', '512', '1024'] };
  },
  'report.generate': async () => {
    await sleep(600 + Math.random() * 800);
    if (Math.random() < 0.15) throw new Error('report upstream timeout');
    return { rows: Math.floor(Math.random() * 10_000) };
  },
  'always.fails': async () => {
    throw new Error('this job is a dedicated dead-letter tourist');
  },
};
