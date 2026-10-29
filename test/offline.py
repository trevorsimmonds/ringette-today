# Offline behaviour with ramp.json: no saved copy → error message; saved copy
# and no connection → "Offline — showing schedule from …" with the saved games.
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':390,'height':700}, timezone_id='America/Toronto')
        await ctx.route(lambda u: not u.startswith('http://localhost'), lambda r: r.abort())
        pg = await ctx.new_page()
        await pg.clock.install(time='2026-09-26T08:00:00-04:00')
        await pg.route('**/ramp.json', lambda r: r.abort())
        await pg.goto('http://localhost:8765/#teams=398263'); await pg.wait_for_timeout(1500)
        print('no saved copy, offline ->', await pg.locator('#status').inner_text())
        await pg.unroute('**/ramp.json')
        await pg.goto('http://localhost:8765/?fixture=1#teams=398263'); await pg.wait_for_timeout(1200)
        await pg.evaluate("(()=>{const c=JSON.parse(localStorage.getItem('rt.ramp'));c.fetchedAt-=3600e3;localStorage.setItem('rt.ramp',JSON.stringify(c))})()")
        await pg.route('**/fixture*.json', lambda r: r.abort())
        await pg.reload(); await pg.wait_for_timeout(1200)
        print('saved copy, offline ->', await pg.locator('#status').inner_text(), '| cards', await pg.locator('.card').count())
        await b.close()
asyncio.run(main())
