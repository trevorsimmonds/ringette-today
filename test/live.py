# Live scores from the Cloudflare helper, layered over ramp.json: the real
# Nepean U19AA semi and final (Nov 22, 2026), with the helper's answers faked.
# Run from the project folder with the app served on port 8765
# (python3 -m http.server 8765); needs ramp.json and quebec.json next to the app.
import asyncio, json, sys
from playwright.async_api import async_playwright
PORT = sys.argv[1] if len(sys.argv) > 1 else '8765'
BASE = json.load(open('ramp.json'))
RUSH, SURGE, CYC = 398283, 398284, 420174
def game(gid, start, end, arena, home, hn, away, an, hslot, aslot, score=None, completed=False):
    return {'GID': gid, 'sDate': f'2026-11-22T{start}:00', 'eDate': f'2026-11-22T{end}:00', 'ArenaName': arena, 'RARID': None,
            'HomeTeamName': hn, 'homeTID': home, 'homeScore': score[0] if score else None,
            'AwayTeamName': an, 'awayTID': away, 'awayScore': score[1] if score else None,
            'HomeDivision': 'U19AA', 'AwayDivision': None, 'homeDID': 20520, 'awayDID': 20520, 'GameTypeName': '', 'notes': '',
            'completed': completed, 'cancelledHome': False, 'homeSlot': hslot, 'awaySlot': aslot}
def data(final_teams=True, final_score=(2, 1)):
    semi = game(2120590, '11:15', '12:45', 'Nepean Sportsplex - Arena 2', SURGE, 'Eastern Ontario U19AA Surge', RUSH, 'Eastern Ontario U19AA Rush', '2nd Place U19AA', '3rd Place U19AA', (6, 7), True)
    fin = game(2120614, '16:45', '18:15', 'Walter Baker Sports Centre - Pad B', CYC, 'Cyclones de Quebec U19AA', RUSH if final_teams else None,
               'Eastern Ontario U19AA Rush' if final_teams else 'Winner Semi U19AA', '1st Place U19AA', 'Winner Semi U19AA', final_score)
    d = json.loads(json.dumps(BASE)); d['updatedAt'] = '2026-11-22T22:39:22Z'
    d['tournaments'] = {'3106': {'aid': 3106, 'sid': 14985, 'games': [semi, fin]}}
    return json.dumps(d)
HELPER_FINAL = {'site': 'ontario', 'game': 2120614, 'asOf': '2026-11-22T23:39:09Z', 'teams': {'home': 'Cyclones de Quebec U19AA', 'away': 'Eastern Ontario U19AA Rush'}, 'score': {'home': 4, 'away': 3}}
async def run(b, title, at, body, teams='lerq105:eastern-rush', helper='ok', tab='results', advance=0):
    ctx = await b.new_context(viewport={'width': 390, 'height': 900}, timezone_id='America/Toronto')
    asked = []
    async def route(r):
        u = r.request.url
        if u.startswith('http://localhost'):
            if 'ramp.json' in u: return await r.fulfill(status=200, content_type='application/json', body=body)
            return await r.continue_()
        if u.startswith('https://ringette-live.ringettetoday.workers.dev/'):
            asked.append(u.split('?g=')[-1])
            if helper == 'down': return await r.fulfill(status=500, body='{}', headers={'Access-Control-Allow-Origin': '*'})
            games = {k: (HELPER_FINAL if k == 'ontario:2120614' else {'error': 'not in this test'}) for k in u.split('?g=')[-1].split(',')}
            return await r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps({'asOf': HELPER_FINAL['asOf'], 'games': games}))
        return await r.abort()
    await ctx.route('**/*', route)
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.clock.install(time=f'2026-11-22T{at}:00-05:00')
    await pg.goto(f'http://localhost:{PORT}/#teams={teams}'); await pg.wait_for_timeout(2500)
    if advance:
        await pg.clock.run_for(advance); await pg.wait_for_timeout(800)
    if tab == 'results': await pg.click('[data-view=results]'); await pg.wait_for_timeout(300)
    cards = await pg.evaluate("""() => [...document.querySelectorAll('main .card')].filter(c => /U19AA/.test(c.innerText) && /Walter Baker|Nepean Sportsplex/.test(c.innerText)).map(c => c.innerText.replace(/\\s+/g, ' ').replace(/ — (standings|tournament website)[^)]*\\)/g, '').slice(0, 260))""")
    print(f'== {title} ({at}) helper asked: {asked or "never"}')
    for c in cards: print('   ', c)
    if errs: print('   ERRORS', errs)
    await ctx.close()
    return asked, cards
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); bad = 0
        def check(ok, what):
            nonlocal bad
            print(('ok   ' if ok else 'FAIL ') + what); bad += 0 if ok else 1
        a, c = await run(b, 'final over, GitHub data still mid-game 2-1, helper has 4-3', '18:39', data())
        check(a == ['ontario:2120614'], 'only the unfinished final is asked about (the semi is final already)')
        check(any('Cyclones de Quebec U19AA 4' in x and 'Rush 3' in x and 'Not final yet · score as of 6:39 PM' in x for x in c), 'final shows the helper score 4-3, marked not final')
        a, c = await run(b, 'helper down', '18:39', data(), helper='down', advance=60000)
        check(len(a) == 1, 'helper down: not asked again a minute later')
        check(any('Rush 1' in x and 'Not final yet · score as of 5:39 PM' in x for x in c), 'helper down: GitHub data 2-1 shown, marked not final, as of the job run')
        a, c = await run(b, 'during the final', '17:20', data(), tab='upcoming', advance=60000)
        check(len(a) >= 2, 'asked again a minute later')
        check(any('LIVE · AS OF 6:39 PM' in x.upper() and 'Rush 3' in x for x in c), 'upcoming: live score with LIVE tag')
        a, c = await run(b, 'final still Winner Semi in GitHub data, helper has the teams', '16:30', data(final_teams=False, final_score=None), tab='upcoming')
        check('ontario:2120614' in (a[0] if a else ''), 'final asked about before it starts, to pick up its teams')
        check(any('Eastern Ontario U19AA Rush' in x and 'Cyclones' in x and 'Winner Semi' not in x for x in c), 'teams from the helper filled into the final')
        a, c = await run(b, 'not following Rush', '18:39', data(), teams='409191')
        check(a == [], 'no helper requests when no followed game is on')
        a, c = await run(b, 'next morning', '2026-11-23T09:00'.split('T')[1] if False else '23:59', data())
        print('ERRORS' if bad else 'All checks passed', bad)
        await b.close()
        sys.exit(1 if bad else 0)
asyncio.run(main())
