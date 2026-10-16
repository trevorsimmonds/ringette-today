import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},timezone_id='America/Toronto')
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-10-17T20:00:00-04:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=lerq104:west-ottawa'); await pg.wait_for_timeout(1200)
        # open the rink list for Sunday games via a card on Slush Puppie
        await pg.click('[data-view=results]'); await pg.wait_for_timeout(300)
        print('results', await pg.locator('.card.tourney').count())
        await pg.locator('.card.tourney .arena').first.click(); await pg.wait_for_timeout(300)
        print((await pg.locator('#rinkDialog').inner_text()).replace('\n',' | ')[:600])
        names = await pg.evaluate("""() => { const out=[]; for (const [k,v] of Object.entries(localStorage)) {} return JSON.parse(localStorage.getItem('rt.pt')).data.tournaments[0].games.map(g=>g.away.name).slice(-4) }""")
        print('raw', names); print('errors', errs); await b.close()
asyncio.run(main())
