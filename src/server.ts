import express from 'express';
import path from 'node:path';
import { config } from './config';
import { migrate, pool } from './db';
import { enqueue, retryDead } from './queue';
import { listWorkers } from './redis';
import { handlers, queues } from './handlers';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const wrap =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/meta', (_req, res) => {
  res.json({ author: config.author, handlers: Object.keys(handlers), queues: Object.keys(queues) });
});

app.post('/api/jobs', wrap(async (req, res) => {
  const { name, payload, queue, priority, maxAttempts, delayMs } = req.body ?? {};
  if (typeof name !== 'string' || !handlers[name]) {
    res.status(400).json({ error: `unknown job name; expected one of: ${Object.keys(handlers).join(', ')}` });
    return;
  }
  const job = await enqueue(name, payload ?? {}, { queue, priority, maxAttempts, delayMs });
  res.status(201).json(job);
}));

app.get('/api/jobs', wrap(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { rows } = await pool.query(
    `SELECT id, queue, name, priority, status, attempts, max_attempts, run_at, locked_by,
            last_error, created_at, finished_at,
            EXTRACT(EPOCH FROM (finished_at - locked_at)) * 1000 AS duration_ms
     FROM jobs WHERE ($1::text IS NULL OR status = $1) ORDER BY id DESC LIMIT $2`,
    [status, limit],
  );
  res.json(rows);
}));

app.post('/api/jobs/:id/retry', wrap(async (req, res) => {
  const { rowCount } = await retryDead(Number(req.params.id));
  res.status(rowCount ? 200 : 404).json({ requeued: !!rowCount });
}));

app.get('/api/stats', wrap(async (_req, res) => {
  const [counts, throughput, workers] = await Promise.all([
    pool.query(`SELECT status, count(*) AS n FROM jobs GROUP BY status`),
    pool.query(
      `SELECT count(j.id) AS n
       FROM generate_series(date_trunc('minute', now()) - interval '29 minutes',
                            date_trunc('minute', now()), interval '1 minute') g(m)
       LEFT JOIN jobs j ON j.status = 'completed' AND date_trunc('minute', j.finished_at) = g.m
       GROUP BY g.m ORDER BY g.m`,
    ),
    listWorkers(),
  ]);
  const byStatus = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]));
  res.json({
    pending: byStatus.pending ?? 0,
    active: byStatus.active ?? 0,
    completed: byStatus.completed ?? 0,
    dead: byStatus.dead ?? 0,
    throughput: throughput.rows.map((r) => r.n),
    workers,
  });
}));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

migrate()
  .then(() => app.listen(config.port, () => console.log(`velvet-walrus dashboard on :${config.port}`)))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
