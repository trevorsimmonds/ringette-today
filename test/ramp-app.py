# The app reading ramp.json as written by scripts/fetch-ramp.mjs from the
# real-format samples in test/ramp/ (not ?fixture mode).
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    t = json.load(open('test/ramp/tournaments.json'))
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':390,'height':844}, timezone_id='America/Toronto')
        await ctx.route('**/tournaments.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(t)))
        await ctx.route(lambda u: not u.startswith('http://localhost'), lambda r: r.abort())
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.clock.install(time='2026-10-28T18:00:00-04:00')
        await pg.goto('http://localhost:8765/#teams=398267,401648&favs=401648'); await pg.wait_for_timeout(1800)
        print('STATUS', await pg.locator('#status').inner_text())
        up = pg.locator('.card')
        print('UPCOMING', await up.count(), '|', (await up.first.inner_text()).replace('\n', ' | ')[:200] if await up.count() else '')
        await pg.click('[data-view=results]'); await pg.wait_for_timeout(300)
        cards = pg.locator('.card')
        print('RESULTS', await cards.count())
        for i in range(await cards.count()):
            c = cards.nth(i); txt = (await c.inner_text()).replace('\n', ' | ')
            box = await c.locator('.boxscore').get_attribute('href') if await c.locator('.boxscore').count() else None
            print('  ', txt[:120], '| box:', box)
        await pg.click('[data-view=teams]'); await pg.wait_for_timeout(300)
        print('SETTINGS', (await pg.locator('.settings').inner_text()).split('\n')[3][:200] if True else '')
        print('errors', errs); await b.close()
asyncio.run(main())
