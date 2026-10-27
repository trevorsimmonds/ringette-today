# Out-of-province RAMP tournament set up as a league (Fredericton Ed Benoit Early Bird,
# AID 1941): games come from the league feed; teams have Ringette NB IDs, so
# "West Ottawa - U14AA" (411786) must match the followed NCRRL team
# West Ottawa Wild U14AA - Gorham (401648) by club, age and level.
# Game times modelled on the real 2025 U14 Tier 1 schedule, moved to 2026.
import asyncio, json
from playwright.async_api import async_playwright
def G(gid,t,arena,rar,away,aid,home,hid,score=None):
    return dict(GID=gid,sDate=t,eDate=None,ArenaName=arena,RARID=rar,HomeTeamName=home,homeTID=hid,homeScore=score and score[1],AwayTeamName=away,awayTID=aid,awayScore=score and score[0],HomeDivision='U14 Tier 1',homeDID=15534,GameTypeName='Round Robin',notes='',completed=bool(score))
WO=('West Ottawa - U14AA',411786)
GAMES=[G(1,'2026-11-27T10:15:00','Grant-Harvey Center/NHL Sheet',10607,*WO,'FYRA U14 Tier 1 Stars',411790,(4,3)),
       G(2,'2026-11-27T11:30:00','Grant-Harvey Center/NHL Sheet',10607,'Kent Sud - Team 1',411791,'NC U14AA - Halfyard',411792),
       G(3,'2026-11-27T10:00:00','Grant-Harvey Center/Olympic Sheet',10608,'U14 Moncton Storm',411793,'Fusion U14',411794),
       G(4,'2026-11-27T16:00:00','Willie ORee Place/Sheet 1',10605,'U14 - Tier 1',411795,*WO),
       G(5,'2026-11-27T15:00:00','Willie ORee Place/Sheet 2',10606,'WAVE - Bailey',411796,'WAVE - Fraser',411797)]
async def main():
    t=json.load(open('fixture-tournaments.json'))
    real=json.load(open('tournaments.json'))['tournaments'][0]
    t['tournaments'].append(real)
    t['games']['1941']=GAMES
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='America/Toronto')
        await ctx.route('**/fixture-tournaments.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(t)))
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-11-27T12:00:00-05:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=401648&favs=401648'); await pg.wait_for_timeout(1500)
        cards=pg.locator('.card.tourney', has_text='West Ottawa - U14AA')
        print('upcoming cards for West Ottawa:', await cards.count())
        if await cards.count():
            c=cards.first; print(' ', (await c.inner_text()).replace('\n',' | ')[:330]); await c.screenshot(path='test/f1-card.png')
            await c.locator('.arena').click(); await pg.wait_for_timeout(400)
            print('RINK', await pg.locator('#rinkTitle').inner_text(), '|', await pg.locator('#rinkSub').inner_text(), '|', await pg.evaluate("[...document.querySelectorAll('#rinkPads button')].map(b=>b.textContent)"))
            await pg.click('#rinkClose')
        await pg.click('[data-view=results]'); await pg.wait_for_timeout(300)
        r=pg.locator('.card.tourney', has_text='West Ottawa - U14AA').first
        print('RESULT', (await r.inner_text()).replace('\n',' | ')[:200], '| box:', await r.locator('.boxscore').get_attribute('href') if await r.locator('.boxscore').count() else None)
        await pg.click('[data-view=teams]'); await pg.wait_for_timeout(300)
        print('SETTINGS has Fredericton:', 'Fredericton' in await pg.locator('.settings').inner_text())
        print('errors', errs); await b.close()
asyncio.run(main())
