# Planitournoi team names written "Club-Coach" ("Ottawa-Lachapelle") match the
# league team with that coach (West Ottawa Wild U19B - Lachapelle, 409206).
# Run with the app served on port 8796 (or give the port); needs ramp.json and planitournoi.json.
import asyncio, json, sys
PORT = sys.argv[1] if len(sys.argv) > 1 else '8796'
bad = 0
from playwright.async_api import async_playwright
base = json.load(open('planitournoi.json'))
EXPECT = {'WORA-Lachapelle': True, 'WORA': True, 'Ottawa-Lachapelle': True, 'West Ottawa-Lachapelle': True, 'Ottawa - Lachapelle': True, 'OTTAWA-LACHAPELLE': True, 'Ottawa-Lachapelle (ON)': True, 'West Ottawa Wild U19B - Lachapelle': True, 'Lachapelle': False, 'Ottawa': False, 'Ottawa U19B': False}
names = list(EXPECT) or ['Ottawa-Lachapelle','West Ottawa-Lachapelle','West Ottawa Wild-Lachapelle','Ottawa Lachapelle','Lachapelle','Ottawa','West Ottawa','Ottawa U19B','West Ottawa Wild U19B - Lachapelle','OTTAWA-LACHAPELLE','Ottawa - Lachapelle','Ottawa-Lachapelle (ON)']
async def run(b, name, div='Fém Cadette U19 B'):
    d = json.loads(json.dumps(base))
    t = [t for t in d['tournaments'] if t['id']==23669][0]
    t['games'].append({'num': 9999, 'gameId': 1, 'division': div, 'date': '2026-11-28', 'time': '10:00', 'arena': 'Aréna Bob-Birnie', 'away': {'name': name, 'id': 555555}, 'home': {'name': 'Pointe-Claire', 'id': 555556}, 'score': None})
    ctx = await b.new_context(timezone_id='America/Toronto')
    async def route(r):
        u = r.request.url
        if 'planitournoi.json' in u: return await r.fulfill(status=200, content_type='application/json', body=json.dumps(d))
        if u.startswith('http://localhost'): return await r.continue_()
        return await r.abort()
    await ctx.route('**/*', route)
    pg = await ctx.new_page(); await pg.clock.install(time='2026-11-26T13:00:00-05:00')
    await pg.goto(f'http://localhost:{PORT}/#teams=409206'); await pg.wait_for_timeout(2000)
    txt = await pg.evaluate("() => [...document.querySelectorAll('main .card')].map(c=>c.innerText).join(' || ')")
    global bad
    shown = 'Bob-Birnie' in txt
    want = EXPECT.get(name, True) and 'U19 A' not in div
    print(f"{'ok  ' if shown == want else 'FAIL'} {div} | {name}: {'shown' if shown else 'not shown'}")
    bad += shown != want
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for n in names: await run(b, n)
        for dv in ['Fém Cadette U19 A', 'Fém Cadette B', 'Fém U19 B']: await run(b, 'Ottawa-Lachapelle', dv)
        await b.close()
    print('All checks passed' if not bad else f'{bad} check(s) failed'); sys.exit(1 if bad else 0)
asyncio.run(main())
