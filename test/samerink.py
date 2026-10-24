# Same ice under two RAMP rink IDs: NCRRL "Nepean Sportsplex - Arena 2" (13020)
# and GAARA "Nepean Sportsplex - Pad 2 (MacDonald)" (13061). Real Oct 24 2026 games.
import asyncio, json
from playwright.async_api import async_playwright
def G(gid,t,arena,rar,away,home,div,hid=None):
    return dict(GID=gid,sDate=f'2026-10-24T{t}:00',eDate=f'2026-10-24T{int(t[:2])+1:02d}{t[2:]}:00',ArenaName=arena,RARID=rar,HomeTeamName=home,homeTID=hid or gid+1,homeScore=None,AwayTeamName=away,awayTID=gid+2,awayScore=None,HomeDivision=div,GameTypeName='Regular Season',notes='',completed=False,homeDID=1)
A2='Nepean Sportsplex - Arena 2'; P2='Nepean Sportsplex - Pad 2 (MacDonald)'
N=[G(9101,'15:15',A2,13020,'West Ottawa Wild U14B - Miller','Nepean Ravens U14B - Jensen','U14B'),
   G(9102,'17:15',A2,13020,'Metcalfe Hornets U16B - Leptick','Nepean Ravens U16B','U16B',hid=900001)]
GA=[G(9201,'21:15',P2,13061,'Dino-Mights','Ottawa Blast','Blue'),G(9202,'22:15',P2,13061,'Devils','Houlegans','Blue')]
async def main():
    n=json.load(open('fixture.json'))+N; ga=json.load(open('fixture-gaara.json'))+GA
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},timezone_id='America/Toronto')
        await ctx.route('**/fixture.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(n)))
        await ctx.route('**/fixture-gaara.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(ga)))
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-10-24T09:00:00-04:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=900001'); await pg.wait_for_timeout(1300)
        card=pg.locator('.card', has_text='Metcalfe').first
        print('CARD', (await card.locator('.ice').inner_text()).replace('\n',' | '))
        await card.locator('.arena').click(); await pg.wait_for_timeout(400)
        print('PADS', await pg.evaluate("[...document.querySelectorAll('#rinkPads button')].map(b=>b.textContent)"), '| hidden:', await pg.evaluate("document.querySelector('#rinkPads').hidden"))
        print('SUB ', await pg.locator('#rinkSub').inner_text())
        print('LIST', (await pg.locator('.rink-pane').first.inner_text()).replace('\n',' | '))
        print('errors', errs); await b.close()
asyncio.run(main())
