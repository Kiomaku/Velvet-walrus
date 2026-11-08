# 🦭 Velvet Walrus

A small, honest distributed job queue. **Postgres is the source of truth, Redis does the fast, ephemeral parts.**

| Feature | How |
|---|---|
| Create & schedule jobs | `enqueue(name, payload, { delayMs })` → `run_at` column |
| Concurrent workers | `UPDATE … WHERE id IN (… FOR UPDATE SKIP LOCKED)`; N processes, zero double-claims |
| Retries + exponential backoff | `random(0, min(cap, base·2^(n-1)))` (full jitter) |
| Dead-letter queue | exhausted jobs land in `status='dead'`; one-click retry from the dashboard |
| Priorities | `ORDER BY priority DESC, run_at` over a partial index |
| Rate limiting | per-queue, cluster-wide fixed window in Redis (`queues` in `src/handlers.ts`) |
| Monitoring | live dashboard: counts, throughput sparkline, workers (Redis heartbeats), job table |
| Graceful shutdown | SIGTERM stops polling, drains in-flight jobs, then exits |
| Crash recovery | reaper requeues `active` jobs whose lock outlived the visibility timeout |

## Run it
```bash
docker compose up --build --scale worker=3
open http://localhost:3000
```
Local dev: `npm i && npm run dev:api` and `npm run dev:worker` (needs Postgres + Redis, see `src/config.ts`).

Fonts: copy `YekanBakh-Regular.woff2` and `YekanBakh-Bold.woff2` from your Khargoosh app into `public/fonts/`.
Language: the dashboard is Farsi (RTL) by default with an FA/EN switcher in the header; the choice is remembered in the browser. Strings live in the `I18N` object in `public/index.html`.
Branding: set `AUTHOR_NAME` / `AUTHOR_NAME_FA` / `AUTHOR_URL` env vars.

## Design notes
- **Delivery is at-least-once.** A crashed worker's job is re-run, so handlers should be idempotent.
- Why not RabbitMQ? Postgres already gives durability, priorities and transactional enqueue (enqueue inside your own DB transaction). A broker earns its place at much higher throughput, and the claim query is the single seam to swap.
- Next steps: LISTEN/NOTIFY to replace polling, per-job timeouts in the payload, integration tests with testcontainers.
