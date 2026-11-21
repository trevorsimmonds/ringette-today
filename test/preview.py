# Upcoming RAMP games get a "Game preview" link to RAMP's game page; Quebec
# league/tournament games and results don't. Club logos load (needs network).
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':390,'height':844}, timezone_id='America/Toronto')
        pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.clock.install(time='2026-11-20T22:00:00-05:00')
        await pg.goto('http://localhost:8795/#teams=411786,lerq105:eastern-rush'); await pg.wait_for_timeout(3000)
        cards = pg.locator('.card'); n = await cards.count()
        for i in range(min(n, 6)):
            c = cards.nth(i); head = (await c.inner_text()).split('\n')[:4]
            link = c.locator('a.boxscore'); href = await link.first.get_attribute('href') if await link.count() else None
            print(' | '.join(head)[:90], '->', href)
        logos = pg.locator('.logo img'); k = await logos.count()
        ok = await pg.evaluate("[...document.querySelectorAll('.logo img')].filter(i=>i.complete && i.naturalWidth>0).length")
        print('logos on page', k, 'loaded', ok)
        await pg.screenshot(path='shot.png', full_page=False)
        print('errors', errs); await b.close()
asyncio.run(main())
