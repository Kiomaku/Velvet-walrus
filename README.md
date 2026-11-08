<div align="center">

# 🦭 Velvet Walrus

**A lightweight distributed job queue for Node.js. Postgres keeps the truth, Redis keeps the pace.**

[English](README.md) · [فارسی](README.fa.md)

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-dc382d?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

<img src="screenshots/dashboard-fa.png" alt="Velvet Walrus dashboard (Farsi, RTL)" width="900">

</div>

## What is it?

Velvet Walrus is a small alternative to BullMQ or Celery for background work: send emails, resize images, build reports, all outside the request cycle. Jobs are stored durably in PostgreSQL, claimed safely by any number of worker processes, retried with backoff when they fail, and parked in a dead-letter queue when they keep failing. A live dashboard (Farsi by default, English one click away) shows what the system is doing.

## Features

| Feature | How it works |
|---|---|
| Create and schedule jobs | `enqueue(name, payload, { delayMs })` sets the `run_at` column |
| Concurrent workers | `UPDATE … WHERE id IN (… FOR UPDATE SKIP LOCKED)`: many processes, no double claims |
| Retries with exponential backoff | `random(0, min(cap, base·2^(n-1)))` seconds (full jitter) |
| Dead-letter queue | Jobs out of attempts end up as `dead`; retry them with one click or one API call |
| Priorities | `ORDER BY priority DESC, run_at` over a partial index |
| Rate limiting | Per-queue fixed window in Redis, shared by every worker |
| Dashboard | Counts, throughput chart, live workers, filterable job table, FA/EN, dark/light |
| Graceful shutdown | SIGTERM stops polling and drains in-flight jobs before exit |
| Crash recovery | A reaper re-queues `active` jobs whose worker disappeared |

## Screenshots

| Farsi (RTL) | English (LTR) |
|---|---|
| <img src="screenshots/dashboard-fa.png" width="440"> | <img src="screenshots/dashboard-en.png" width="440"> |
| **Dead-letter queue (Farsi)** | **Dead-letter queue (English)** |
| <img src="screenshots/dead-letter-fa.png" width="440"> | <img src="screenshots/dead-letter-en.png" width="440"> |
| **Light theme** | **Mobile** |
| <img src="screenshots/dashboard-light-en.png" width="440"> | <img src="screenshots/mobile-fa.png" width="200"> |

> The screenshots show the real dashboard front end rendered against a seeded mock API (`scripts/mock-server.mjs`), so anyone can regenerate them without Postgres or Redis. To capture shots from a live stack instead, run `BASE_URL=http://localhost:3000 python3 scripts/capture.py` (the UI checks assume the seeded data, so some may need adjusting).

### Tests

<img src="screenshots/tests.png" alt="Unit tests and UI checks passing" width="760">

## Quick start

```bash
git clone https://github.com/Kiomaku/Velvet-walrus.git
cd Velvet-walrus
docker compose up --build --scale worker=3
```

Open <http://localhost:3000>, then press **Fire 20 jobs** and watch the workers drain the queue. **Send poison job** enqueues a job that always fails, so you can see retries and the dead-letter queue in action.

Local development (needs Postgres and Redis running, see [Configuration](#configuration)):

```bash
npm install
npm run dev:api      # dashboard + HTTP API
npm run dev:worker   # run several of these to scale out
```

**Fonts:** the UI uses Yekan Bakh. Put `YekanBakh-Regular.woff2` and `YekanBakh-Bold.woff2` in `public/fonts/`; without them it falls back to the system font.

## Architecture

```mermaid
flowchart LR
  C[Your app / dashboard] -->|POST /api/jobs| API[API server]
  API -->|INSERT| PG[(PostgreSQL<br/>jobs table)]
  W1[Worker 1] & W2[Worker 2] & W3[Worker N] -->|claim: SKIP LOCKED| PG
  W1 & W2 & W3 -->|rate-limit tokens, heartbeats| R[(Redis)]
  API -->|read workers| R
```

### Job lifecycle

```mermaid
stateDiagram-v2
  [*] --> pending: enqueue
  pending --> active: claimed by a worker
  active --> completed: handler succeeded
  active --> pending: failed, attempts left (backoff)
  active --> pending: worker lost (reaper)
  active --> dead: attempts exhausted
  dead --> pending: manual retry
  completed --> [*]
```

Delivery is **at-least-once**: if a worker dies mid-job, the job runs again, so handlers should be idempotent.

## HTTP API

Base URL: `http://localhost:3000`. All bodies are JSON.

### `POST /api/jobs` Enqueue a job

| Field | Type | Default | Notes |
|---|---|---|---|
| `name` | string | required | Must match a handler in `src/handlers.ts` |
| `payload` | object | `{}` | Passed to the handler |
| `queue` | string | `default` | `default`, `emails`, `media` in the demo |
| `priority` | integer | `0` | Higher runs first |
| `maxAttempts` | integer | `5` | Total tries before the job goes dead |
| `delayMs` | integer | `0` | Run no earlier than now + delay |

```bash
curl -X POST localhost:3000/api/jobs -H 'Content-Type: application/json' \
  -d '{"name":"email.send","queue":"emails","priority":8,"payload":{"to":"a@b.com"},"delayMs":5000}'
```

`201 Created` returns the job row. `400` is returned for an unknown `name`:

```json
{ "error": "unknown job name; expected one of: email.send, image.resize, report.generate, always.fails" }
```

### `GET /api/jobs` List jobs

Query: `status` (`pending` | `active` | `completed` | `dead`, optional), `limit` (default 50, max 200). Newest first.

```bash
curl 'localhost:3000/api/jobs?status=dead&limit=10'
```

```json
[{
  "id": 33, "queue": "default", "name": "always.fails", "priority": 0,
  "status": "dead", "attempts": 3, "max_attempts": 3,
  "run_at": "2026-11-08T18:10:00.000Z", "locked_by": null,
  "last_error": "this job is a dedicated dead-letter tourist",
  "created_at": "2026-11-08T18:09:00.000Z", "finished_at": "2026-11-08T18:09:41.000Z",
  "duration_ms": null
}]
```

### `POST /api/jobs/:id/retry` Re-queue a dead job

Resets attempts and schedules it immediately.

```bash
curl -X POST localhost:3000/api/jobs/33/retry   # → { "requeued": true }
```

`404` with `{ "requeued": false }` if the job doesn't exist or isn't dead.

### `GET /api/stats` Dashboard data

```json
{
  "pending": 9, "active": 5, "completed": 18, "dead": 3,
  "throughput": [2, 3, 1, 4, "… 30 values, one per minute, oldest first"],
  "workers": [{ "id": "walrus-a1f3c2", "queues": ["default"], "concurrency": 5, "inflight": 5, "processed": 412, "startedAt": 1762625400000 }]
}
```

Workers appear while their Redis heartbeat is fresh (10 s TTL).

### `GET /api/meta`

Returns registered job names, queues, and the author block used in the dashboard footer.

> ⚠️ The API has no authentication. Put it behind a reverse proxy or add auth before exposing it publicly.

## Writing your own jobs

Register a handler in `src/handlers.ts`. Throwing means failure, which triggers retry and backoff.

```ts
export const handlers: Record<string, Handler> = {
  'invoice.pdf': async (job) => {
    const url = await renderInvoice(job.payload.invoiceId as string);
    return { url }; // stored in jobs.result
  },
};

export const queues = {
  default: {},
  emails: { rateLimitPerSec: 5 }, // cluster-wide limit, enforced via Redis
};
```

Enqueue from your own Node code:

```ts
import { enqueue } from './queue';
await enqueue('invoice.pdf', { invoiceId: 'inv_42' }, { priority: 5, delayMs: 60_000 });
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Dashboard / API port |
| `DATABASE_URL` | `postgres://walrus:walrus@localhost:5432/walrus` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel per worker |
| `WORKER_POLL_MS` | `500` | Idle poll interval |
| `WORKER_QUEUES` | `default,emails,media` | Queues a worker consumes |
| `JOB_TIMEOUT_MS` | `30000` | Per-job timeout (counts as a failure) |
| `VISIBILITY_TIMEOUT_SEC` | `60` | Lock age after which a job is considered orphaned |
| `SHUTDOWN_GRACE_MS` | `30000` | Max time to drain on SIGTERM |
| `AUTHOR_NAME` / `AUTHOR_NAME_FA` / `AUTHOR_URL` | Barsam Bahrami / برسام بهرامی / barsambahrami.ir | Dashboard footer credit |

## Project structure

```
src/
  config.ts     environment config
  db.ts         pool + schema migration (advisory-locked)
  queue.ts      enqueue, claim, complete, fail, reaper, retry
  policy.ts     pure backoff + rate-limit math (unit tested)
  redis.ts      rate limiter + worker heartbeats
  handlers.ts   job handlers and per-queue settings
  worker.ts     polling loop, concurrency, graceful shutdown
  server.ts     Express API + static dashboard
public/         bilingual dashboard (no build step)
tests/          unit tests (node:test)
scripts/        mock API + screenshot/UI-check runner
```

## Testing

```bash
npm test                 # unit tests for backoff and rate-limit rules (Node 22+)
npm run screenshots      # UI checks + regenerates ./screenshots (needs Python + Playwright)
```

Current coverage: the scheduling policy (backoff bounds, cap, jitter, rate-limit grants) and 15 dashboard UI checks (RTL/LTR switching, Farsi numerals, enqueue, dead-letter retry, mobile layout). Integration tests against live Postgres and Redis are on the roadmap.

## Why Postgres instead of RabbitMQ?

Postgres already gives durability, priorities and transactional enqueue (enqueue inside your own DB transaction). The `claim()` query is a single seam, so a broker can replace it when throughput demands it.

## Roadmap

- [ ] `LISTEN/NOTIFY` instead of polling
- [ ] Integration tests with Testcontainers
- [ ] API authentication
- [ ] Per-job timeouts and cron-style recurring jobs
- [ ] Optional RabbitMQ transport

## Author

Built by **[Barsam Bahrami](https://barsambahrami.ir)** · GitHub [@Kiomaku](https://github.com/Kiomaku)

Licensed under the [MIT License](LICENSE).
