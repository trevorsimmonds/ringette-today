# Planitournoi names without " - " before the coach, and Quebec age names:
# West Ottawa Wild U16B - Irvine (409191) and Ottawa Ice U19B - Gordon (409212)
# pick up their Sainte-Julie games ("West Ottawa U16B Irvine", "CORA City of
# Ottawa Gordon" in "Fém Cadette B"). Needs the real planitournoi.json from
# 2026-10-29 or later next to the app.
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for teams in ['409191', '409212', '409206', '411786,lerq105:eastern-rush']:
            ctx = await b.new_context(viewport={'width':390,'height':844}, timezone_id='America/Toronto')
            await ctx.route(lambda u: not u.startswith('http://localhost'), lambda r: r.abort())
            pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.clock.install(time='2026-11-10T08:00:00-05:00')
            await pg.goto(f'http://localhost:8765/#teams={teams}'); await pg.wait_for_timeout(2000)
            c = pg.locator('.card'); n = await c.count()
            tour = [ (await c.nth(i).inner_text()).replace('\n',' | ')[:150] for i in range(n) ]
            tour = [t for t in tour if 'JULIE' in t.upper() or 'MUSTANG' in t.upper()]
            print('== team', teams, 'cards', n, 'Ste-Julie/Mustangs cards', len(tour))
            for t in tour[:4]: print('  ', t)
            print('  errors', errs); await ctx.close()
        await b.close()
asyncio.run(main())
