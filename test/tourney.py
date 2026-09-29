import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, timezone_id='America/Toronto')
        page = await ctx.new_page()
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: m.type=='error' and errs.append(m.text))
        await page.goto('http://localhost:8765/?fixture=1&today=2026-09-10#teams=398266,398263')
        await page.wait_for_timeout(1000)
        print('STATUS', await page.locator('#status').inner_text())
        print('cards', await page.locator('.card').count(), 'tourney cards', await page.locator('.card.tourney').count())
        print(await page.locator('.card.tourney').first.inner_text())
        await page.screenshot(path='test/t1-upcoming.png', full_page=True)
        await page.click('.card.tourney .arena >> nth=1'); await page.wait_for_timeout(300)
        print('RINK', await page.locator('#rinkSub').inner_text(), '|', await page.locator('#rinkList').inner_text())
        await page.click('#rinkClose')
        await page.click('[data-view=teams]'); await page.wait_for_timeout(300)
        await page.locator('.settings').screenshot(path='test/t2-settings.png')
        print('SETTINGS', await page.locator('.settings').inner_text())
        # estimated end times (AA provincials, feed end == start or missing)
        p2 = await ctx.new_page(); p2.on('pageerror', lambda e: errs.append(str(e)))
        await p2.evaluate("localStorage.clear()") if False else None
        await p2.goto('http://localhost:8765/?fixture=1&today=2026-03-04#teams=326429')
        await p2.wait_for_timeout(1000)
        print('AA', await p2.locator('.card').first.inner_text())
        print('errors', errs)
        await b.close()
asyncio.run(main())
