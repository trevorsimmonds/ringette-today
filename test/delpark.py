# Generic multi-pad rule: "Delpark Homes Centre - Pad N" (Oshawa tournament,
# Oct 24 2026, real game times) groups into one building with swipeable pads.
import asyncio, json
from playwright.async_api import async_playwright
def G(gid,t,pad,rar,away,home,div,tid=None):
    return dict(GID=gid,sDate=f'2026-10-24T{t}:00',eDate=None,ArenaName=f'Delpark Homes Centre - Pad {pad}',RARID=rar,HomeTeamName=home,homeTID=tid or gid+1,homeScore=None,AwayTeamName=away,awayTID=gid+2,awayScore=None,HomeDivision=div,GameTypeName='Round Robin',notes='',completed=False,homeDID=1)
GAMES=[G(1,'08:00',2,13130,'Sault Ice Hawks - U12A','Oshawa Storm U12A','U12A'),
       G(2,'09:00',2,13130,'Burlington U14AA','Oshawa U14AA','U14AA'),
       G(3,'10:15',2,13130,'Gloucester Cumberland Devils U14AA - McDonald','Guelph U14AA','U14AA'),
       G(4,'08:45',1,13129,'Richmond Hill Lightning U12A','West Ottawa Wild U12A - Pattyson','U12A'),
       G(5,'11:00',1,13129,'West Ottawa Wild U14A - Randell','Ottawa Ice U14A - Reilly','U14A'),
       G(6,'09:15',3,13131,'Burlington Blast U12A','Arnprior Devils U12A - Schweertman','U12A'),
       G(7,'13:30',4,13132,'Burlington U14AA','Ottawa Ice U14AA - McWaters','U14AA',tid=401647)]
async def main():
    t=json.load(open('fixture-tournaments.json'))
    t['tournaments'].append({'aid':3043,'name':'Oshawa Ringette Tournament','short':'Oshawa','city':'Oshawa','start':'2026-10-23','end':'2026-10-25'})
    t['games']['3043']=GAMES
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='America/Toronto',has_touch=True,is_mobile=True)
        await ctx.route('**/fixture-tournaments.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(t)))
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-10-24T07:00:00-04:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=401647'); await pg.wait_for_timeout(1500)
        card=pg.locator('.card', has_text='McWaters').first
        print('CARD', (await card.inner_text()).replace('\n',' | ')[:260])
        await card.locator('.arena').click(); await pg.wait_for_timeout(400)
        st=lambda: pg.evaluate("""() => ({title: document.querySelector('#rinkTitle').textContent, sub: document.querySelector('#rinkSub').textContent,
            pads: [...document.querySelectorAll('#rinkPads button')].map(b => b.textContent + (b.getAttribute('aria-selected')==='true' ? '*' : ''))})""")
        print('OPEN', await st())
        await pg.locator('#rinkPads button', has_text='Pad 2').click(); await pg.wait_for_timeout(700)
        print('PAD2', await st(), (await pg.locator('.rink-pane').nth(1).inner_text()).replace('\n',' | ')[:200])
        await pg.screenshot(path='test/d1-delpark.png')
        print('errors', errs); await b.close()
asyncio.run(main())
