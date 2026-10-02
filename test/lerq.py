import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, timezone_id='America/Toronto')
        page = await ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: m.type=='error' and errs.append(m.text))
        # follow LERQ U16 AA Ottawa + LERQ U19 AA Eastern rush + NCRRL Ottawa Ice U14A (old numeric id)
        await page.goto('http://localhost:8765/?fixture=1&today=2026-09-18#teams=lerq104:ottawa,lerq105:eastern-rush,398263')
        await page.wait_for_timeout(1200)
        print('STATUS', await page.locator('#status').inner_text())
        cards=page.locator('.card')
        print('cards', await cards.count())
        for i in range(min(4, await cards.count())):
            print('---', (await cards.nth(i).inner_text()).replace('\n',' | '))
        await page.screenshot(path='test/q1-upcoming.png', full_page=True)
        await page.click('[data-view=teams]'); await page.wait_for_timeout(300)
        print('HEADINGS', await page.locator('.league-heading').all_inner_texts())
        print('DIVS', await page.locator('.division h3').all_inner_texts())
        print('LERQ teams', await page.locator('.division:has(h3:text-is("LERQ U16 AA")) .team-row').all_inner_texts())
        print('checked', await page.locator('.team-row.on').all_inner_texts())
        print('SETTINGS', [l for l in (await page.locator('.settings').inner_text()).split('\n') if 'LERQ' in l or 'season' in l])
        await page.locator('.league-heading').first.scroll_into_view_if_needed()
        await page.screenshot(path='test/q2-teams.png')
        print('stored', await page.evaluate("localStorage.getItem('rt.tracked')"))
        print('errors', errs)
        # no quebec.json at all (before the GitHub job has run): no error shown
        p2=await (await b.new_context()).new_page(); e2=[]
        p2.on('pageerror', lambda e: e2.append(str(e)))
        await p2.route('**/fixture-quebec.json', lambda r: r.fulfill(status=404, body='nope'))
        await p2.goto('http://localhost:8765/?fixture=1&today=2026-09-18#teams=398263'); await p2.wait_for_timeout(1000)
        print('NO QUEBEC status', await p2.locator('#status').inner_text(), '| cards', await p2.locator('.card').count(), '| errors', e2)
        await b.close()
asyncio.run(main())
