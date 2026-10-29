# Fredericton is on Atlantic time (1 h ahead of Ottawa). A 10:15 game there is
# 10:15 AST = 9:15 Ottawa time: show "10:15 AM … AST", and move it to Results
# at 11:45 AST (10:45 Ottawa), whether the phone is on Ottawa or Atlantic time.
import asyncio, json
from playwright.async_api import async_playwright
G=dict(GID=1,sDate='2026-11-27T10:15:00',eDate='2026-11-27T11:15:00',ArenaName='Willie ORee Place/Sheet 1',RARID=10605,HomeTeamName='West Ottawa - U14AA',homeTID=411786,homeScore=None,AwayTeamName='U14 - Tier 1',awayTID=411795,awayScore=None,HomeDivision='U14 Tier 1',homeDID=15534,awayDID=15534,GameTypeName='Round Robin',notes='',completed=False)
async def main():
    t=json.load(open('fixture-tournaments.json'))
    t['tournaments'].append(json.load(open('tournaments.json'))['tournaments'][0]); t['games']['1941']=[G]
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for phone_tz in ['America/Toronto','America/Moncton']:
            for clock, expect in [('2026-11-27T10:40:00-05:00','upcoming'), ('2026-11-27T10:50:00-05:00','results')]:
                ctx=await b.new_context(viewport={'width':390,'height':844},timezone_id=phone_tz)
                await ctx.route('**/fixture-tournaments.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(t)))
                pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
                await pg.clock.install(time=clock)
                await pg.goto('http://localhost:8765/?fixture=1#teams=401648'); await pg.wait_for_timeout(1200)
                up=pg.locator('.card', has_text='West Ottawa - U14AA')
                where='upcoming' if await up.count() else None
                time_txt=(await up.first.locator('.time').inner_text()) if where else ''
                if not where:
                    await pg.click('[data-view=results]'); await pg.wait_for_timeout(300)
                    rc=pg.locator('.card', has_text='West Ottawa - U14AA')
                    if await rc.count(): where='results'; time_txt=await rc.first.locator('.time').inner_text()
                ok = 'OK ' if where==expect and '10:15' in time_txt and 'AST' in time_txt else 'BAD'
                print(f'{ok} phone {phone_tz:16} Ottawa clock {clock[11:16]}: in {where} (expected {expected if False else expect}) | shows "{time_txt}"', errs or '')
                await ctx.close()
        await b.close()
asyncio.run(main())
