# "Also here": games on other pads of the same building at the same time.
# Real games: Oct 4 2026 Slush Puppie pads D (1:15) and C (1:30), both FUN3;
# Sep 26 2026 Walter Baker Pad B NCRRL U16C 8:15 PM vs GAARA on Pad A at 9:00 PM.
import asyncio, json
from playwright.async_api import async_playwright
def G(gid,s,e,arena,rar,h,hid,a,aid,div,typ='Regular Season - 1st Half'):
    return dict(GID=gid,sDate=s,eDate=e,ArenaName=arena,RARID=rar,HomeTeamName=h,homeTID=hid,homeScore=None,AwayTeamName=a,awayTID=aid,awayScore=None,HomeDivision=div,GameTypeName=typ,notes='',completed=False,trash=False,deletedDate=None)
EXTRA_N=[G(2040642,'2026-10-04T13:15:00','2026-10-04T14:05:00','Slush Puppie Complex - D - Dilawri Ice',13152,'Gatineau FUN3 - Villeneuve',409113,'Ottawa Ice FUN3 - Lemire',409122,'FUN3 Stage 2'),
         G(2040641,'2026-10-04T13:30:00','2026-10-04T14:20:00','Slush Puppie Complex - C - Gerik Ice',13153,'Gatineau FUN3 - Laurier',409112,'Ottawa Ice FUN3 - Grimwood',409121,'FUN3 Stage 2'),
         G(2040524,'2026-09-26T20:15:00','2026-09-26T21:15:00','Walter Baker Sports Centre - Pad B',13528,'Nepean Ravens U16C',409195,'Gloucester Cumberland Devils U16C - Ruelland',409194,'U16C')]
EXTRA_G=[G(9001,'2026-09-26T21:00:00','2026-09-26T22:00:00','Walter Baker Sports Centre - Pad A',1909,'Nepean Ravens BB',402480,'Vortex BB2',402481,'Blue','Regular Season')]
async def main():
    base=json.load(open('fixture.json')); gaara=json.load(open('fixture-gaara.json'))
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='America/Toronto')
        await ctx.route('**/fixture.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(base+EXTRA_N)))
        await ctx.route('**/fixture-gaara.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(gaara+EXTRA_G)))
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-09-26T12:00:00-04:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=409122,409195&favs=409121'); await pg.wait_for_timeout(1000)
        for name in ['Nepean Ravens U16C','Ottawa Ice FUN3 - Lemire']:
            card=pg.locator('.card', has_text=name).first
            print('==', name, '\n ', (await card.locator('.ice').inner_text()).replace('\n',' | '))
        await pg.locator('.card', has_text='Ottawa Ice FUN3 - Lemire').first.screenshot(path='test/b1-also.png')
        # a single-pad rink shows no "Also here" row
        print('cards with Also here:', await pg.locator('.also-row').count(), 'of', await pg.locator('.card').count())
        print('errors', errs); await b.close()
asyncio.run(main())
