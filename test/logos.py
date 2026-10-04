# Logos: check which teams get which club logo (logo images are swapped for a
# placeholder because the test browser can't reach the clubs' sites).
import asyncio, base64, json
from playwright.async_api import async_playwright
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='America/Toronto')
        await ctx.route(lambda u: 'localhost' not in u, lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-09-10T12:00:00-04:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=398266,398263,lerq104:ottawa,lerq105:eastern-rush,402575'); await pg.wait_for_timeout(1200)
        rows = await pg.evaluate("""[...document.querySelectorAll('.team .name')].map(n=>{const i=n.querySelector('.logo img'); return n.textContent.replace(/^(AWAY|HOME)/,'').trim()+' => '+(i? decodeURIComponent(i.src.split('/').pop()) : '(no logo)')})""")
        for r in sorted(set(rows)): print(' ', r)
        await pg.locator('.card').nth(2).screenshot(path='test/l1-card.png')
        await pg.click('[data-view=teams]'); await pg.wait_for_timeout(400)
        n_logo = await pg.locator('.team-row .logo').count(); n_rows = await pg.locator('.team-row').count()
        print('teams tab: rows with logo', n_logo, 'of', n_rows)
        print('rows without logo:', await pg.evaluate("[...document.querySelectorAll('.team-row')].filter(r=>!r.querySelector('.logo')).map(r=>r.innerText.replace(/[☆★]/g,'').trim())"))
        print('errors', errs); await b.close()
asyncio.run(main())
