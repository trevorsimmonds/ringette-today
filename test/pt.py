# Quebec tournaments from planitournoi.json (fixture built from test/pt-*.html
# by scripts/fetch-planitournoi.mjs --from test), plus one made-up U14AA game
# to check matching against an NCRRL team.
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    pt=json.load(open('fixture-planitournoi.json'))
    pt['tournaments'][0]['games'].append(dict(num=1700,gameId=430000,division='Fém M14 AA',date='2026-10-17',time='12:00',arena='Centre Slush Puppie - Glace C',
        away=dict(name='West Ottawa U14AA',id=101300),home=dict(name='Gatineau U14AA',id=101301),score=None))
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='America/Toronto')
        await ctx.route('**/fixture-planitournoi.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(pt)))
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-10-16T12:00:00-04:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=lerq104:west-ottawa,401648&favs=lerq104:west-ottawa'); await pg.wait_for_timeout(1500)
        cards=pg.locator('.card.tourney')
        print('upcoming tournament cards:', await cards.count())
        for i in range(await cards.count()):
            print(' --', (await cards.nth(i).inner_text()).replace('\n',' | ')[:400])
        await cards.first.screenshot(path='test/pt1-card.png')
        await pg.click('[data-view=results]'); await pg.wait_for_timeout(300)
        r=pg.locator('.card.tourney').first
        print('RESULT:', (await r.inner_text()).replace('\n',' | ')[:300])
        print('box score:', await r.locator('.boxscore').get_attribute('href'))
        await r.screenshot(path='test/pt2-result.png')
        await pg.click('[data-view=teams]'); await pg.wait_for_timeout(300)
        print('SETTINGS:', (await pg.locator('.settings').inner_text()).split('Quebec tournaments')[1][:300].replace('\n',' | '))
        print('errors', errs); await b.close()
asyncio.run(main())
