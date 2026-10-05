# Box score links on finished games in Results.
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    base=json.load(open('fixture.json')); tour=json.load(open('fixture-tournaments.json'))
    for g in base: g['homeDID']=20295
    for g in tour['games']['3033']: g['homeDID']=29703
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='America/Toronto')
        await ctx.route('**/fixture.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(base)))
        await ctx.route('**/fixture-tournaments.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(tour)))
        await ctx.route(lambda u: 'localhost' not in u, lambda r: r.abort())
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-10-03T15:00:00-04:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=398266,lerq104:nepean'); await pg.wait_for_timeout(1200)
        await pg.click('[data-view=results]'); await pg.wait_for_timeout(300)
        for i in range(await pg.locator('.card').count()):
            c=pg.locator('.card').nth(i)
            head=(await c.inner_text()).split('\n')
            link=c.locator('a.boxscore')
            href=await link.get_attribute('href') if await link.count() else '(no link)'
            print('-', head[0], '|', ' '.join(x for x in head if x.startswith(('AWAY','HOME')) or x.isdigit())[:60], '=>', href)
        await pg.locator('.card').nth(1).screenshot(path='test/x1-boxscore.png')
        print('errors', errs); await b.close()
asyncio.run(main())
