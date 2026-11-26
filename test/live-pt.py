# Quebec tournament results and playoff teams from the Cloudflare helper
# (Planitournoi), layered over planitournoi.json. Helper answers are faked.
# Run from the project folder with the app served on port 8765; needs
# ramp.json and quebec.json next to the app (for the league teams).
import asyncio, json, sys
from playwright.async_api import async_playwright
PORT = sys.argv[1] if len(sys.argv) > 1 else '8765'
IRVINE = {'name': 'West Ottawa U16B Irvine', 'id': 101900}
LEVIS = {'name': 'Lévis 2', 'id': 101908}
def pt(score10=None):
    return json.dumps({'source': 'test', 'updatedAt': '2026-11-22T14:00:00Z', 'today': '2026-11-22', 'tournaments': [{
        'id': 23700, 'name': 'Tournoi Test de Lévis', 'slug': 'tournoi-test', 'city': 'Lévis', 'province': 'quebec',
        'start': '2026-11-21', 'end': '2026-11-22', 'url': 'https://www.planitournoi.com/tournament_public.php?tournament_id=23700', 'standings': {},
        'games': [
            {'num': 10, 'gameId': 900010, 'division': 'Fém Junior B', 'date': '2026-11-22', 'time': '09:00', 'arena': 'Aréna de Lévis - Glace 1', 'away': IRVINE, 'home': LEVIS, 'score': score10},
            {'num': 11, 'gameId': 900011, 'division': 'Fém Junior B', 'date': '2026-11-22', 'time': '09:15', 'arena': 'Aréna de Lévis - Glace 2', 'away': {'name': 'Bellechasse', 'id': 101886}, 'home': {'name': 'Sept-Îles', 'id': 101870}, 'score': None},
            {'num': 20, 'gameId': 900020, 'division': 'Fém Junior B', 'date': '2026-11-22', 'time': '15:15', 'arena': 'Aréna de Lévis - Glace 1', 'away': {'name': 'Finale Gagnant match 0010', 'id': None}, 'home': {'name': 'Finale Gagnant match 0011', 'id': None}, 'score': None},
            {'num': 30, 'gameId': 900030, 'division': 'Fém Cadette B', 'date': '2026-11-22', 'time': '15:30', 'arena': 'Aréna de Lévis - Glace 2', 'away': {'name': 'Finale Gagnant match 0040', 'id': None}, 'home': {'name': 'Finale Gagnant match 0041', 'id': None}, 'score': None},
        ]}]})
HELPER = {'10': {'num': 10, 'away': IRVINE, 'home': LEVIS, 'score': {'away': 5, 'home': 3}},
          '11': {'num': 11, 'away': {'name': 'Bellechasse', 'id': 101886}, 'home': {'name': 'Sept-Îles', 'id': 101870}, 'score': None},
          '20': {'num': 20, 'away': IRVINE, 'home': {'name': 'Sept-Îles', 'id': 101870}, 'score': None}}
async def run(b, title, at, body, teams='409191', helper='ok', tab='upcoming'):
    ctx = await b.new_context(viewport={'width': 390, 'height': 900}, timezone_id='America/Toronto')
    asked = []
    async def route(r):
        u = r.request.url
        if u.startswith('http://localhost'):
            if 'planitournoi.json' in u: return await r.fulfill(status=200, content_type='application/json', body=body)
            return await r.continue_()
        if u.startswith('https://ringette-live.ringettetoday.workers.dev/'):
            asked.append(u.split('workers.dev')[-1])
            if helper == 'down': return await r.fulfill(status=502, body='{}', headers={'Access-Control-Allow-Origin': '*'})
            nums = u.split('?g=')[-1].split(',')
            games = {n: HELPER.get(n, {'error': 'not on the tournament page'}) for n in nums}
            return await r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                                   body=json.dumps({'tournament': 23700, 'asOf': '2026-11-22T17:00:00Z', 'cached': False, 'games': games}))
        return await r.abort()
    await ctx.route('**/*', route)
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.clock.install(time=f'2026-11-22T{at}:00-05:00')
    await pg.goto(f'http://localhost:{PORT}/#teams={teams}'); await pg.wait_for_timeout(2500)
    if tab == 'results': await pg.click('[data-view=results]'); await pg.wait_for_timeout(300)
    cards = await pg.evaluate("""() => [...document.querySelectorAll('main .card')].filter(c => /Lévis/i.test(c.innerText)).map(c => c.innerText.replace(/\\s+/g, ' ').replace(/ — (standings|tournament website)[^)]*\\)/g, '').slice(0, 240))""")
    print(f'== {title} ({at}, {tab}) helper asked: {asked or "never"}')
    for c in cards: print('   ', c)
    if errs: print('   ERRORS', errs)
    await ctx.close()
    return asked, cards, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); bad = 0
        def check(ok, what):
            nonlocal bad
            print(('ok   ' if ok else 'FAIL ') + what); bad += 0 if ok else 1
        a, c, e = await run(b, 'result posted on Planitournoi, not yet in planitournoi.json', '12:00', pt(), tab='results')
        check(a == ['/pt/23700?g=10,20'], "asks about the followed game and its division's undecided final (not other divisions)")
        check(any('Irvine 5' in x and 'Lévis 2 3' in x and 'Not final' not in x and 'Score not posted' not in x for x in c), 'result shown as final (Planitournoi only posts finals)')
        check(not e, 'no page errors')
        a, c, e = await run(b, 'final gets its teams', '12:00', pt(), tab='upcoming')
        check(any('3:15 PM' in x and 'Irvine' in x and 'Sept-Îles' in x and 'Gagnant' not in x for x in c), "final shows Irvine vs Sept-Îles, on the followed team's list")
        a, c, e = await run(b, 'helper down', '12:00', pt(), helper='down', tab='results')
        check(any('Irvine' in x and 'Score not posted yet' in x for x in c), 'helper down: planitournoi.json shown as before')
        a, c, e = await run(b, 'result already in planitournoi.json', '12:00', pt(score10={'away': 5, 'home': 3}), tab='results')
        check(a == ['/pt/23700?g=20'], 'finished game no longer asked about, the final still is')
        a, c, e = await run(b, 'not following anyone there', '12:00', pt(), teams='398264')
        check(a == [], 'no requests when no followed team plays there')
        print('All checks passed' if not bad else f'{bad} check(s) failed')
        await b.close(); sys.exit(1 if bad else 0)
asyncio.run(main())
