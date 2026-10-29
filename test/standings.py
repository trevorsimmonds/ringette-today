# Team names link to the official standings for their division.
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    t=json.load(open('fixture-tournaments.json'))
    t['tournaments'].append(json.load(open('tournaments.json'))['tournaments'][0])  # Fredericton (real entry)
    t['games']['1941']=[dict(GID=1,sDate='2026-11-27T16:00:00',eDate=None,ArenaName='Willie ORee Place/Sheet 1',RARID=10605,HomeTeamName='West Ottawa - U14AA',homeTID=411786,homeScore=None,AwayTeamName='U14 - Tier 1',awayTID=411795,awayScore=None,HomeDivision='U14 Tier 1',homeDID=15534,awayDID=15534,GameTypeName='Round Robin',notes='',completed=False)]
    # The older sample games predate division IDs; real feeds always have them.
    def withDID(games, base):
        divs = {}
        for g in games:
            d = g.get('HomeDivision') or 'x'; divs.setdefault(d, base + len(divs))
            g.setdefault('homeDID', divs[d]); g.setdefault('awayDID', divs[d])
        return games
    n = withDID(json.load(open('fixture.json')), 20000); ga = withDID(json.load(open('fixture-gaara.json')), 39000)
    for k, v in t['games'].items(): withDID(v, 18000 + int(k) % 100 * 10)
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},timezone_id='America/Toronto')
        await ctx.route('**/fixture.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(n)))
        await ctx.route('**/fixture-gaara.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(ga)))
        await ctx.route('**/fixture-tournaments.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(t)))
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        async def links(when, teams):
            await pg.clock.install(time=when) if False else None
        for when, teams, label in [('2026-09-20T08:00:00-04:00','398263,398262','NCRRL'), ('2026-09-12T07:00:00-04:00','398266','Ontario tournament'),
                                   ('2026-09-11T08:00:00-04:00','402463','GAARA'), ('2026-10-16T06:00:00-04:00','lerq104:west-ottawa','LERQ + Planitournoi'), ('2026-11-27T09:00:00-05:00','401648','Fredericton')]:
            pg2=await ctx.new_page(); pg2.on('pageerror',lambda e:errs.append(str(e)))
            await pg2.clock.install(time=when)
            await pg2.goto(f'http://localhost:8765/?fixture=1#teams={teams}'); await pg2.wait_for_timeout(1300)
            rows=await pg2.evaluate("""() => [...document.querySelectorAll('.card')].slice(0, 12).flatMap(c => [...c.querySelectorAll('.team')].map(t => {
                const a = t.querySelector('.team-link'); const tag = c.querySelector('.tourney-tag');
                return `${(tag ? tag.textContent.split('·')[1] : 'league').trim().slice(0,28)} | ${t.querySelector('.name').innerText.replace(/^(AWAY|HOME)/,'').trim().slice(0,32)} -> ${a ? a.getAttribute('href') : 'no link'}`; }))""")
            print('==', label); seen=set()
            for r in rows:
                k=r.split(' -> ')[1][:60]
                if k in seen: continue
                seen.add(k); print('  ', r)
            await pg2.close()
        print('errors', errs); await b.close()
asyncio.run(main())
