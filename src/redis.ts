import Redis from 'ioredis';
import { config } from './config';

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });

/**
 * Fixed-window rate limiter shared by every worker process.
 * Takes up to `want` tokens for this second and refunds whatever the window couldn't give.
 */
export async function acquire(queue: string, want: number, perSecond?: number): Promise<number> {
  if (!perSecond) return want;
  const key = `rl:${queue}:${Math.floor(Date.now() / 1000)}`;
  const used = await redis.incrby(key, want);
  if (used === want) await redis.expire(key, 3);
  const granted = Math.max(0, Math.min(want, perSecond - (used - want)));
  if (granted < want) await redis.decrby(key, want - granted);
  return granted;
}

export interface WorkerInfo {
  id: string;
  queues: string[];
  concurrency: number;
  inflight: number;
  processed: number;
  startedAt: number;
}

const HEARTBEAT_TTL_SEC = 10;

export const heartbeat = (w: WorkerInfo) =>
  redis.set(`worker:${w.id}`, JSON.stringify(w), 'EX', HEARTBEAT_TTL_SEC);

export const forgetWorker = (id: string) => redis.del(`worker:${id}`);

export async function listWorkers(): Promise<WorkerInfo[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', 'worker:*', 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  if (!keys.length) return [];
  const raw = await redis.mget(keys);
  return raw.filter((r): r is string => !!r).map((r) => JSON.parse(r) as WorkerInfo);
}
