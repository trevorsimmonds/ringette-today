# Playoff brackets: possible finals and Champions/Finalists banners, using the
# Run from the project folder with the app served on port 8765: python3 -m http.server 8765
# real Nepean U14A bracket (Nov 22, 2026). Serves the app with a ramp.json made
# from ramp.json next to the app plus the scenario's tournament games.
import asyncio, json, sys
from playwright.async_api import async_playwright
BASE = json.load(open('ramp.json'))
R, M, S, N = 398264, 500001, 500002, 500003
NAMES = {R: 'West Ottawa Wild U14A - Randell', M: 'Mitchell U14A', S: 'Greater Sudbury U14A', N: 'Nepean Ravens U14A - White'}
def g(gid, start, end, arena, home, away, hslot, aslot, score=None):
    hn = NAMES.get(home, home); an = NAMES.get(away, away)
    return {'GID': gid, 'sDate': f'2026-11-22T{start}:00', 'eDate': f'2026-11-22T{end}:00', 'ArenaName': f'Walter Baker Sports Centre - {arena}', 'RARID': None,
            'HomeTeamName': hn, 'homeTID': home if isinstance(home, int) else None, 'homeScore': score[0] if score else None,
            'AwayTeamName': an, 'awayTID': away if isinstance(away, int) else None, 'awayScore': score[1] if score else None,
            'HomeDivision': 'U14A', 'AwayDivision': None, 'homeDID': 20518, 'awayDID': 20518, 'GameTypeName': '', 'notes': '',
            'completed': bool(score), 'cancelledHome': False, 'homeSlot': hslot, 'awaySlot': aslot}
def data(semi1=None, semi2=None, final=None, final_teams=None):
    fh, fa = final_teams or ('Winner Semi 1 U14A', 'Winner Semi 2 U14A')
    games = [g(2120594, '08:00', '09:15', 'Pad A', M, R, '1st Place U14A', '4th Place U14A', semi1),
             g(2120606, '08:15', '09:30', 'Pad B', S, N, '2nd Place U14A', '3rd Place U14A', semi2),
             g(2120610, '12:15', '13:45', 'Pad B', fh, fa, 'Winner Semi 1 U14A', 'Winner Semi 2 U14A', final)]
    d = json.loads(json.dumps(BASE)); d['tournaments'] = {'3106': {'aid': 3106, 'sid': 14985, 'games': games}}
    return json.dumps(d)
CASES = [
  ('before semis, following Randell', [R], '07:30', data(), 'upcoming'),
  ('Randell won, RAMP not updated', [R], '10:00', data((4, 5), (5, 3)), 'upcoming'),
  ('Randell lost', [R], '10:00', data((6, 2), (5, 3)), 'upcoming'),
  ('following Randell + Nepean White', [R, N], '07:30', data(), 'upcoming'),
  ('following Randell + Mitchell', [R, M], '07:30', data(), 'upcoming'),
  ('following all 4', [R, M, S, N], '07:30', data(), 'upcoming'),
  ('one semi done (Randell won), other not', [R], '09:40', data((4, 5)), 'upcoming'),
  ('RAMP filled the final', [R], '11:00', data((4, 5), (5, 3), None, (S, R)), 'upcoming'),
  ('Randell won the final (Champions)', [R], '15:00', data((4, 5), (5, 3), (2, 4), (S, R)), 'results'),
  ('Sudbury followed, lost the final (Finalists)', [S], '15:00', data((4, 5), (5, 3), (2, 4), (S, R)), 'results'),
]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for title, teams, at, body, tab in CASES:
            ctx = await b.new_context(viewport={'width': 390, 'height': 900}, timezone_id='America/Toronto', color_scheme='dark' if 'Champions' in title else 'light')
            await ctx.route(lambda u: not u.startswith('http://localhost'), lambda r: r.abort())
            def serve(body):
                return lambda route: route.fulfill(status=200, content_type='application/json', body=body)
            await ctx.route('**/ramp.json*', serve(body))
            pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.clock.install(time=f'2026-11-22T{at}:00-05:00')
            await pg.goto('http://localhost:8765/#teams=' + ','.join(map(str, teams))); await pg.wait_for_timeout(1500)
            if tab == 'results': await pg.click('[data-view=results]'); await pg.wait_for_timeout(300)
            info = await pg.evaluate("""() => {
              const cards = [...document.querySelectorAll('main .card')].filter(c => /Nepean Ringette Tournament/i.test(c.innerText));
              const banners = [...document.querySelectorAll('.champ-banner')].map(b => b.innerText.replace(/\\s+/g,' '));
              return { banners, cards: cards.map(c => (c.classList.contains('possible') ? '[POSSIBLE] ' : '') + c.innerText.replace(/\\s+/g, ' ').replace(/ — (standings|tournament website)[^)]*\\)/g, '').slice(0, 330)) };
            }""")
            print(f'== {title} ({at})')
            for x in info['banners']: print('   BANNER:', x)
            for c in info['cards']: print('   ', c)
            if errs: print('   ERRORS', errs)
            if '--shots' in sys.argv:
                await pg.screenshot(path=f'shot-{CASES.index((title, teams, at, body, tab))}.png', full_page=True)
            await ctx.close()
        await b.close()
asyncio.run(main())
