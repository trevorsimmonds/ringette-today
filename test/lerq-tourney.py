# A team followed through LERQ (Eastern Rush, U19 AA) picks up its games at a
# RAMP tournament where it's listed under its Ringette Ontario team ID (London).
# Needs the real ramp.json/quebec.json next to the app.
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':390,'height':844}, timezone_id='America/Toronto')
        await ctx.route(lambda u: not u.startswith('http://localhost'), lambda r: r.abort())
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.clock.install(time='2026-11-06T08:05:00-05:00')
        await pg.goto('http://localhost:8765/#teams=lerq105:eastern-rush'); await pg.wait_for_timeout(2000)
        cards = pg.locator('.card')
        n = await cards.count(); print('UPCOMING', n)
        for i in range(min(n, 8)):
            print('  ', (await cards.nth(i).inner_text()).replace('\n', ' | ')[:170])
        print('errors', errs); await b.close()
asyncio.run(main())
