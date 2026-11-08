<div align="center">

# 🦭 Velvet Walrus

**یک صف کار توزیع‌شده و سبک برای Node.js. حقیقت در Postgres می‌ماند، سرعت از Redis می‌آید.**

[English](README.md) · [فارسی](README.fa.md)

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-dc382d?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

<img src="screenshots/dashboard-fa.png" alt="داشبورد Velvet Walrus" width="900">

</div>

<div dir="rtl">

## این پروژه چیست؟

Velvet Walrus جایگزینی سبک برای BullMQ و Celery است که کارهای پس‌زمینه را انجام می‌دهد: ارسال ایمیل، تغییر اندازه تصویر، ساخت گزارش و هر کاری که نباید در چرخهٔ درخواست کاربر اجرا شود. کارها به‌صورت پایدار در PostgreSQL ذخیره می‌شوند، هر تعداد worker می‌تواند با خیال راحت آن‌ها را بردارد، در صورت شکست با تأخیر نمایی دوباره تلاش می‌شوند و اگر باز هم شکست بخورند به صف مرده (Dead-letter) می‌روند. داشبورد زنده (پیش‌فرض فارسی، با یک کلیک انگلیسی) نشان می‌دهد سیستم در حال چه کاری است.

## قابلیت‌ها

| قابلیت | روش کار |
|---|---|
| ساخت و زمان‌بندی کار | `enqueue(name, payload, { delayMs })` ستون `run_at` را تنظیم می‌کند |
| workerهای هم‌زمان | `FOR UPDATE SKIP LOCKED`؛ چند پردازش، بدون برداشت تکراری |
| تلاش مجدد با تأخیر نمایی | `random(0, min(cap, base·2^(n-1)))` ثانیه (jitter کامل) |
| صف مرده (Dead-letter) | کارهایی که تلاش‌هایشان تمام شده `dead` می‌شوند؛ با یک کلیک یا یک فراخوانی API دوباره صف می‌شوند |
| اولویت‌بندی | `ORDER BY priority DESC, run_at` روی یک ایندکس جزئی |
| محدودسازی نرخ | پنجرهٔ ثابت برای هر صف در Redis، مشترک بین همهٔ workerها |
| داشبورد | شمارنده‌ها، نمودار توان عملیاتی، workerهای زنده، جدول فیلترپذیر، فارسی/انگلیسی، تیره/روشن |
| خاموشی ایمن | با SIGTERM، worker دیگر کار جدید برنمی‌دارد و کارهای در حال اجرا را تمام می‌کند |
| بازیابی از خرابی | یک reaper کارهای `active` را که worker‌شان ناپدید شده دوباره صف می‌کند |

## تصاویر

| فارسی (راست‌به‌چپ) | انگلیسی (چپ‌به‌راست) |
|---|---|
| <img src="screenshots/dashboard-fa.png" width="440"> | <img src="screenshots/dashboard-en.png" width="440"> |
| **صف مرده (فارسی)** | **صف مرده (انگلیسی)** |
| <img src="screenshots/dead-letter-fa.png" width="440"> | <img src="screenshots/dead-letter-en.png" width="440"> |
| **تم روشن** | **موبایل** |
| <img src="screenshots/dashboard-light-en.png" width="440"> | <img src="screenshots/mobile-fa.png" width="200"> |

> این تصاویر از رابط کاربری واقعی داشبورد گرفته شده‌اند که روی یک API آزمایشی با داده‌های نمونه (`scripts/mock-server.mjs`) اجرا شده است؛ پس بدون Postgres و Redis هم می‌توانید آن‌ها را دوباره بسازید. برای گرفتن تصویر از یک سیستم زنده: `BASE_URL=http://localhost:3000 python3 scripts/capture.py` (بررسی‌های رابط کاربری برای داده‌های نمونه نوشته شده‌اند و ممکن است نیاز به تنظیم داشته باشند).

### تست‌ها

<img src="screenshots/tests.png" alt="نتیجهٔ تست‌های واحد و بررسی‌های رابط کاربری" width="760">

## شروع سریع

</div>

```bash
git clone https://github.com/Kiomaku/Velvet-walrus.git
cd Velvet-walrus
docker compose up --build --scale worker=3
```

<div dir="rtl">

آدرس <http://localhost:3000> را باز کنید و دکمهٔ **ارسال ۲۰ کار** را بزنید تا ببینید workerها صف را خالی می‌کنند. دکمهٔ **ارسال کار سمی** کاری می‌سازد که همیشه شکست می‌خورد تا تلاش مجدد و صف مرده را ببینید.

اجرا برای توسعه (به Postgres و Redis روشن نیاز دارد؛ بخش [پیکربندی](#پیکربندی) را ببینید):

</div>

```bash
npm install
npm run dev:api      # داشبورد + API
npm run dev:worker   # برای مقیاس‌دهی چند نمونه اجرا کنید
```

<div dir="rtl">

**فونت:** رابط کاربری از فونت یکان بخ استفاده می‌کند. فایل‌های `YekanBakh-Regular.woff2` و `YekanBakh-Bold.woff2` را در `public/fonts/` بگذارید؛ در غیر این صورت فونت سیستم نمایش داده می‌شود.

## معماری

</div>

```mermaid
flowchart LR
  C[Your app / dashboard] -->|POST /api/jobs| API[API server]
  API -->|INSERT| PG[(PostgreSQL<br/>jobs table)]
  W1[Worker 1] & W2[Worker 2] & W3[Worker N] -->|claim: SKIP LOCKED| PG
  W1 & W2 & W3 -->|rate-limit tokens, heartbeats| R[(Redis)]
  API -->|read workers| R
```

<div dir="rtl">

### چرخهٔ عمر یک کار

</div>

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

<div dir="rtl">

تحویل کارها **حداقل یک‌بار** (at-least-once) است: اگر worker وسط کار از بین برود، کار دوباره اجرا می‌شود؛ پس handlerها باید idempotent باشند.

## مستندات API

آدرس پایه: `http://localhost:3000`. همهٔ بدنه‌ها JSON هستند.

### `POST /api/jobs` ساخت کار

| فیلد | نوع | پیش‌فرض | توضیح |
|---|---|---|---|
| `name` | رشته | الزامی | باید با یکی از handlerهای `src/handlers.ts` برابر باشد |
| `payload` | شیء | `{}` | به handler داده می‌شود |
| `queue` | رشته | `default` | در نمونه: `default`، `emails`، `media` |
| `priority` | عدد صحیح | `0` | عدد بزرگ‌تر زودتر اجرا می‌شود |
| `maxAttempts` | عدد صحیح | `5` | تعداد کل تلاش‌ها پیش از «مرده» شدن |
| `delayMs` | عدد صحیح | `0` | اجرا نه زودتر از «اکنون + تأخیر» |

</div>

```bash
curl -X POST localhost:3000/api/jobs -H 'Content-Type: application/json' \
  -d '{"name":"email.send","queue":"emails","priority":8,"payload":{"to":"a@b.com"},"delayMs":5000}'
```

<div dir="rtl">

پاسخ موفق `201 Created` و ردیف کار است. برای `name` ناشناخته `400` برمی‌گردد:

</div>

```json
{ "error": "unknown job name; expected one of: email.send, image.resize, report.generate, always.fails" }
```

<div dir="rtl">

### `GET /api/jobs` فهرست کارها

پارامترها: `status` (یکی از `pending`، `active`، `completed`، `dead`؛ اختیاری) و `limit` (پیش‌فرض ۵۰، حداکثر ۲۰۰). جدیدترین‌ها اول می‌آیند.

</div>

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

<div dir="rtl">

### `POST /api/jobs/:id/retry` صف کردن دوبارهٔ کار مرده

تعداد تلاش‌ها را صفر می‌کند و کار را فوراً زمان‌بندی می‌کند.

</div>

```bash
curl -X POST localhost:3000/api/jobs/33/retry   # → { "requeued": true }
```

<div dir="rtl">

اگر کار وجود نداشته باشد یا «مرده» نباشد، `404` با `{ "requeued": false }` برمی‌گردد.

### `GET /api/stats` داده‌های داشبورد

</div>

```json
{
  "pending": 9, "active": 5, "completed": 18, "dead": 3,
  "throughput": [2, 3, 1, 4, "… 30 values, one per minute, oldest first"],
  "workers": [{ "id": "walrus-a1f3c2", "queues": ["default"], "concurrency": 5, "inflight": 5, "processed": 412, "startedAt": 1762625400000 }]
}
```

<div dir="rtl">

تا زمانی که ضربان قلب (heartbeat) یک worker در Redis تازه باشد (TTL برابر ۱۰ ثانیه) در فهرست دیده می‌شود.

### `GET /api/meta`

نام کارهای ثبت‌شده، صف‌ها و اطلاعات سازنده برای پاورقی داشبورد را برمی‌گرداند.

> ⚠️ این API احراز هویت ندارد. پیش از انتشار عمومی، آن را پشت یک reverse proxy بگذارید یا احراز هویت اضافه کنید.

## نوشتن کار دلخواه

یک handler در `src/handlers.ts` ثبت کنید. پرتاب خطا یعنی شکست و باعث تلاش مجدد با backoff می‌شود.

</div>

```ts
export const handlers: Record<string, Handler> = {
  'invoice.pdf': async (job) => {
    const url = await renderInvoice(job.payload.invoiceId as string);
    return { url }; // stored in jobs.result
  },
};

export const queues = {
  default: {},
  emails: { rateLimitPerSec: 5 }, // cluster-wide limit via Redis
};
```

```ts
import { enqueue } from './queue';
await enqueue('invoice.pdf', { invoiceId: 'inv_42' }, { priority: 5, delayMs: 60_000 });
```

<div dir="rtl">

## پیکربندی

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `PORT` | `3000` | پورت داشبورد و API |
| `DATABASE_URL` | `postgres://walrus:walrus@localhost:5432/walrus` | اتصال PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | اتصال Redis |
| `WORKER_CONCURRENCY` | `5` | تعداد کار هم‌زمان در هر worker |
| `WORKER_POLL_MS` | `500` | فاصلهٔ بررسی صف در حالت بیکاری |
| `WORKER_QUEUES` | `default,emails,media` | صف‌هایی که worker مصرف می‌کند |
| `JOB_TIMEOUT_MS` | `30000` | مهلت هر کار (تمام‌شدن مهلت = شکست) |
| `VISIBILITY_TIMEOUT_SEC` | `60` | سنِ قفل که بعد از آن کار یتیم فرض می‌شود |
| `SHUTDOWN_GRACE_MS` | `30000` | بیشینهٔ زمان تخلیه هنگام SIGTERM |
| `AUTHOR_NAME` / `AUTHOR_NAME_FA` / `AUTHOR_URL` | Barsam Bahrami / برسام بهرامی / barsambahrami.ir | نام سازنده در پاورقی داشبورد |

## ساختار پروژه

</div>

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

<div dir="rtl">

## تست

</div>

```bash
npm test                 # unit tests (Node 22+)
npm run screenshots      # UI checks + regenerate ./screenshots (Python + Playwright)
```

<div dir="rtl">

پوشش فعلی: قوانین زمان‌بندی (کران‌های backoff، سقف، jitter و سهمیهٔ محدودسازی نرخ) و ۱۵ بررسی رابط کاربری (تغییر RTL/LTR، ارقام فارسی، ساخت کار، تلاش مجدد صف مرده، چیدمان موبایل). تست‌های یکپارچه‌سازی با Postgres و Redis واقعی در نقشهٔ راه هستند.

## چرا Postgres و نه RabbitMQ؟

Postgres خودش پایداری، اولویت‌بندی و ثبت کار داخل تراکنش (enqueue در همان تراکنش دیتابیس شما) را می‌دهد. کوئری `claim()` تنها نقطهٔ اتصال است و هر وقت حجم کار بالا رفت می‌توان یک بروکر را جایگزین کرد.

## نقشهٔ راه

- [ ] استفاده از `LISTEN/NOTIFY` به‌جای polling
- [ ] تست یکپارچه‌سازی با Testcontainers
- [ ] احراز هویت API
- [ ] مهلت اختصاصی هر کار و کارهای تکرارشونده (cron)
- [ ] انتقال‌دهندهٔ اختیاری RabbitMQ

## سازنده

ساخته‌شده توسط **[برسام بهرامی](https://barsambahrami.ir)** · گیت‌هاب [@Kiomaku](https://github.com/Kiomaku)

تحت مجوز [MIT](LICENSE).

</div>
