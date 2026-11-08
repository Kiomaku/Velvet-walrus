"""Runs UI checks against the dashboard and writes screenshots to ./screenshots.

Uses scripts/mock-server.mjs (no Postgres/Redis needed). Point BASE_URL at a real
stack (docker compose up) to capture the same shots from live data instead.
"""
import html, os, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"
OUT.mkdir(exist_ok=True)
BASE = os.environ.get("BASE_URL")
server = None
if not BASE:
    BASE = "http://localhost:3100"
    server = subprocess.Popen(["node", str(ROOT / "scripts" / "mock-server.mjs")], stdout=subprocess.DEVNULL)
    time.sleep(1)

results = []
def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)

def settle(page):
    page.wait_for_function("document.querySelectorAll('#jobs tr').length > 0")
    page.wait_for_timeout(300)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, color_scheme="dark", device_scale_factor=2)
        page = ctx.new_page()
        page.goto(BASE); settle(page)

        check("defaults to Farsi", page.evaluate("document.documentElement.lang") == "fa")
        check("layout is right-to-left", page.evaluate("document.documentElement.dir") == "rtl")
        check("header is translated", "صف کار" in page.inner_text("h1"))
        check("Farsi numerals are used", any(c in page.inner_text("#stats") for c in "۰۱۲۳۴۵۶۷۸۹"))
        check("4 status cards render", page.locator("#stats .card").count() == 4)
        check("30 throughput bars render", page.locator("#spark rect").count() == 30)
        check("3 workers listed", page.locator("#workers tr").count() == 3)
        page.screenshot(path=str(OUT / "dashboard-fa.png"), full_page=True)

        page.click("[data-lang=en]"); page.wait_for_timeout(300)
        check("switch to English sets ltr", page.evaluate("document.documentElement.dir") == "ltr")
        check("English subtitle shown", "distributed job queue" in page.inner_text("h1"))
        check("footer credits the author", "Barsam Bahrami" in page.inner_text("#sig"))
        page.screenshot(path=str(OUT / "dashboard-en.png"), full_page=True)

        before = int(page.inner_text("#stats .card:nth-child(1) b"))
        page.click("#burst"); page.wait_for_timeout(800)
        after = int(page.inner_text("#stats .card:nth-child(1) b"))
        check("'Fire 20 jobs' enqueues 20 pending jobs", after - before == 20)

        page.click("#tabs [data-s=dead]"); page.wait_for_timeout(600)
        rows = page.locator("#jobs tr")
        check("dead-letter tab only shows dead jobs", rows.count() > 0 and all("dead" in rows.nth(i).inner_text() for i in range(rows.count())))
        page.screenshot(path=str(OUT / "dead-letter-en.png"), full_page=True)
        dead_before = rows.count()
        page.locator("#jobs button").first.click(); page.wait_for_timeout(800)
        check("retry takes a job out of the dead-letter queue", page.locator("#jobs tr").count() == dead_before - 1)

        page.click("[data-lang=fa]"); page.wait_for_timeout(300)
        page.click("#tabs [data-s=dead]"); page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "dead-letter-fa.png"), full_page=True)
        check("language choice persists across reloads", (page.reload(), page.wait_for_timeout(500), page.evaluate("document.documentElement.lang"))[2] == "fa")

        mob = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme="dark", device_scale_factor=2, is_mobile=True).new_page()
        mob.goto(BASE); settle(mob)
        check("mobile: no sideways page scroll", mob.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
        mob.screenshot(path=str(OUT / "mobile-fa.png"), full_page=True)

        light = browser.new_context(viewport={"width": 1280, "height": 900}, color_scheme="light", device_scale_factor=2).new_page()
        light.goto(BASE); settle(light); light.click("[data-lang=en]"); light.wait_for_timeout(300)
        light.screenshot(path=str(OUT / "dashboard-light-en.png"), full_page=True)

        unit = subprocess.run(["node", "--test", "--test-reporter=spec", "tests/**/*.test.ts"], cwd=ROOT, capture_output=True, text=True)
        unit_out = (unit.stdout + unit.stderr).strip()
        e2e_out = "\n".join(("✔ " if ok else "✖ ") + n for n, ok in results)
        page_html = f"""<body style="margin:0;background:#0e0c14;color:#eeeaf7;font:14px/1.55 'DejaVu Sans Mono',monospace;padding:28px;width:860px">
        <div style="color:#b69cff;font-weight:bold">$ npm test</div><pre style="margin:6px 0 22px">{html.escape(unit_out)}</pre>
        <div style="color:#b69cff;font-weight:bold">$ npm run screenshots  <span style="color:#8c85a3">(UI checks)</span></div><pre style="margin:6px 0">{html.escape(e2e_out)}</pre></body>"""
        t = ctx.new_page(); t.set_viewport_size({"width": 916, "height": 600}); t.set_content(page_html)
        t.screenshot(path=str(OUT / "tests.png"), full_page=True)
        browser.close()
finally:
    if server: server.terminate()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} UI checks passed")
sys.exit(1 if failed else 0)
