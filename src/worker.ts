import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { config } from './config';
import { migrate, pool } from './db';
import { redis, acquire, heartbeat, forgetWorker, type WorkerInfo } from './redis';
import { claim, complete, fail, reapStale, type Job } from './queue';
import { handlers, queues } from './handlers';

const id = `${os.hostname()}-${randomUUID().slice(0, 6)}`;
const { concurrency, pollMs, jobTimeoutMs, visibilityTimeoutSec, shutdownGraceMs } = config.worker;

let inflight = 0;
let processed = 0;
let stopping = false;
const startedAt = Date.now();
const log = (msg: string) => console.log(`[worker ${id}] ${msg}`);

const info = (): WorkerInfo => ({ id, queues: config.worker.queues, concurrency, inflight, processed, startedAt });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms)));
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

async function run(job: Job): Promise<void> {
  inflight++;
  try {
    const handler = handlers[job.name];
    if (!handler) throw new Error(`no handler registered for "${job.name}"`);
    await complete(job.id, await withTimeout(handler(job), jobTimeoutMs));
    processed++;
  } catch (err) {
    await fail(job, err instanceof Error ? err.message : String(err));
  } finally {
    inflight--;
  }
}

async function poll(): Promise<void> {
  while (!stopping) {
    let claimedAny = false;
    for (const queue of config.worker.queues) {
      const free = concurrency - inflight;
      if (free <= 0) break;
      const allowed = await acquire(queue, free, queues[queue]?.rateLimitPerSec);
      const jobs = await claim(queue, id, allowed);
      claimedAny ||= jobs.length > 0;
      // Intentionally not awaited: this is what gives us concurrency.
      for (const job of jobs) void run(job);
    }
    if (!claimedAny) await sleep(pollMs);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`${signal} received, draining ${inflight} in-flight job(s)`);
  const deadline = Date.now() + shutdownGraceMs;
  while (inflight > 0 && Date.now() < deadline) await sleep(100);
  if (inflight > 0) log(`grace period over, ${inflight} job(s) will be recovered by the reaper`);
  await forgetWorker(id).catch(() => undefined);
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}

async function main(): Promise<void> {
  await migrate();
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  setInterval(() => void heartbeat(info()).catch(() => undefined), 3000).unref();
  setInterval(async () => {
    const n = await reapStale(visibilityTimeoutSec).catch(() => 0);
    if (n) log(`recovered ${n} orphaned job(s)`);
  }, 15_000).unref();

  log(`up. queues=${config.worker.queues.join(',')} concurrency=${concurrency}`);
  await heartbeat(info());
  await poll();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
