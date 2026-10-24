# Rink card with one card per pad, flick sideways between them.
# Oct 16-17 2026 Coupe Extrême at Slush Puppie (Glace C + D) from the
# Planitournoi fixture, plus Oct 10 CARDELREC (pad A + pad not listed) from LERQ.
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='America/Toronto',has_touch=True,is_mobile=True)
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.clock.install(time='2026-10-15T09:00:00-04:00')
        await pg.goto('http://localhost:8765/?fixture=1#teams=lerq104:west-ottawa,lerq105:eastern-surge'); await pg.wait_for_timeout(1300)
        card=pg.locator('.card', has=pg.locator('.matchup', has_text='GCRA U16AA')).first
        await card.locator('.arena').click(); await pg.wait_for_timeout(400)
        st=lambda: pg.evaluate("""() => ({title: document.querySelector('#rinkTitle').textContent, sub: document.querySelector('#rinkSub').textContent,
            pads: [...document.querySelectorAll('#rinkPads button')].map(b => b.textContent + (b.getAttribute('aria-selected')==='true' ? '*' : '')),
            panes: document.querySelectorAll('.rink-pane').length, left: document.querySelector('#rinkPanes').scrollLeft})""")
        print('OPEN ', await st())
        await pg.screenshot(path='test/s1-pad-c.png')
        # flick left (to the next pad) with a touch-like scroll
        await pg.evaluate("document.querySelector('#rinkPanes').scrollBy({left: 400, behavior: 'instant'})"); await pg.wait_for_timeout(300)
        print('FLICK', await st())
        await pg.screenshot(path='test/s2-pad-d.png')
        # tap the first pad name
        await pg.locator('#rinkPads button').first.click(); await pg.wait_for_timeout(700)
        print('TAP  ', await st())
        await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(700)
        print('KEY  ', await st())
        await pg.click('#rinkClose')
        # single-pad rink: no pad names
        await pg.goto('http://localhost:8765/?fixture=1&today=2026-10-10#teams=lerq104:west-ottawa,lerq105:eastern-surge'); await pg.wait_for_timeout(1300)
        c2=pg.locator('.card', has=pg.locator('.matchup', has_text='BLL')).first
        await c2.locator('.arena').click(); await pg.wait_for_timeout(400)
        print('CARDELREC', await st())
        await pg.screenshot(path='test/s3-cardelrec.png')
        print('errors', errs); await b.close()
asyncio.run(main())
