# Same building, pad not listed: Oct 10 2026 LERQ games at CARDELREC.
# 10:00 U19 AA at "Cardelrec A - West Ottawa" (pad A) and 11:30 U16 AA at
# "Cardelrec - West Ottawa" (no pad) should show each other as before/after,
# flagged "Same building · pad not listed".
import asyncio, json
from playwright.async_api import async_playwright
EXTRA=[dict(num=9101,league=105,date='2026-10-10',time='10:00',arena='Cardelrec A - West Ottawa',home='Eastern surge',away='Lac St-Louis',detailId=None),
       dict(num=9102,league=104,date='2026-10-10',time='11:30',arena='Cardelrec - West Ottawa',home='West Ottawa',away='BLL',detailId=None)]
async def main():
    q=json.load(open('fixture-quebec.json')); pass
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='America/Toronto')
        await ctx.route('**/fixture-quebec.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(q)))
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-10-07T19:00:00-04:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=lerq105:eastern-surge,lerq104:west-ottawa'); await pg.wait_for_timeout(1200)
        for name in ['Lac St-Louis','BLL']:
            card=pg.locator('.card', has=pg.locator('.matchup', has_text=name)).first
            print('==', name, '\n ', (await card.locator('.ice').inner_text()).replace('\n',' | '))
        await pg.locator('.card', has=pg.locator('.matchup', has_text='BLL')).first.screenshot(path='test/p1-padunknown.png')
        await pg.locator('.card', has=pg.locator('.matchup', has_text='BLL')).first.locator('.arena').click(); await pg.wait_for_timeout(300)
        print('dialog:', (await pg.locator('#rinkDialog').inner_text()).replace('\n',' | '))
        print('errors', errs); await b.close()
asyncio.run(main())
