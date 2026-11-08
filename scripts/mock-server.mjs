// Zero-dependency stand-in for the API, used only to capture screenshots and run UI checks
// without Postgres/Redis. It serves the real public/ folder and fakes /api/* with seeded data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT ?? 3100);
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

const catalog = [
  ['email.send', 'emails'], ['image.resize', 'media'], ['report.generate', 'default'],
];
const errors = ['SMTP 451: try again later', 'report upstream timeout', 'this job is a dedicated dead-letter tourist'];
let nextId = 1;
const jobs = [];
const add = (status, i, extra = {}) => {
  const [name, queue] = catalog[i % 3];
  jobs.push({
    id: nextId++, name, queue, priority: (i * 7) % 10, status, attempts: 1, max_attempts: 5,
    run_at: iso(1000), locked_by: null, last_error: null, created_at: iso(60000 - i * 900),
    finished_at: null, duration_ms: null, ...extra,
  });
};
for (let i = 0; i < 18; i++) add('completed', i, { duration_ms: 220 + ((i * 397) % 2600), attempts: 1 + (i % 3 === 0 ? 1 : 0), finished_at: iso(i * 40000) });
for (let i = 0; i < 5; i++) add('active', i, { locked_by: `walrus-${['a1f3c2', 'b92d10', 'c7e5aa'][i % 3]}`, attempts: 1 });
for (let i = 0; i < 9; i++) add('pending', i, { attempts: i % 4 === 0 ? 2 : 0, last_error: i % 4 === 0 ? errors[0] : null });
add('dead', 0, { name: 'always.fails', queue: 'default', attempts: 3, max_attempts: 3, last_error: errors[2], finished_at: iso(90000) });
add('dead', 2, { attempts: 5, last_error: errors[1], finished_at: iso(150000) });
add('dead', 1, { attempts: 5, last_error: errors[0], finished_at: iso(210000) });

const throughput = [2, 3, 1, 4, 6, 5, 7, 4, 3, 8, 9, 7, 6, 10, 12, 9, 8, 11, 13, 10, 7, 9, 12, 14, 11, 8, 10, 13, 9, 6];
const startedAt = now - 3_600_000;
const workers = [['a1f3c2', 5, 5, 412], ['b92d10', 4, 5, 388], ['c7e5aa', 2, 5, 301]].map(([s, inflight, concurrency, processed]) => ({
  id: `walrus-${s}`, queues: ['default', 'emails', 'media'], concurrency, inflight, processed, startedAt,
}));

const meta = {
  author: { name: 'Barsam Bahrami', nameFa: 'برسام بهرامی', url: 'https://barsambahrami.ir' },
  handlers: ['email.send', 'image.resize', 'report.generate', 'always.fails'], queues: ['default', 'emails', 'media'],
};

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const count = (s) => jobs.filter((j) => j.status === s).length;
  if (url.pathname === '/api/meta') return json(res, 200, meta);
  if (url.pathname === '/api/stats') return json(res, 200, { pending: count('pending'), active: count('active'), completed: count('completed'), dead: count('dead'), throughput, workers });
  if (url.pathname === '/api/jobs' && req.method === 'GET') {
    const s = url.searchParams.get('status');
    return json(res, 200, [...jobs].reverse().filter((j) => !s || j.status === s).slice(0, 50));
  }
  if (url.pathname === '/api/jobs' && req.method === 'POST') {
    let raw = ''; req.on('data', (c) => (raw += c));
    return req.on('end', () => {
      const b = JSON.parse(raw || '{}');
      add('pending', nextId, { name: b.name ?? 'email.send', queue: b.queue ?? 'default', priority: b.priority ?? 0, max_attempts: b.maxAttempts ?? 5, created_at: iso(0) });
      json(res, 201, jobs[jobs.length - 1]);
    });
  }
  const retry = url.pathname.match(/^\/api\/jobs\/(\d+)\/retry$/);
  if (retry && req.method === 'POST') {
    const j = jobs.find((x) => x.id === Number(retry[1]) && x.status === 'dead');
    if (j) Object.assign(j, { status: 'pending', attempts: 0 });
    return json(res, j ? 200 : 404, { requeued: !!j });
  }
  const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`mock dashboard on :${PORT}`));
