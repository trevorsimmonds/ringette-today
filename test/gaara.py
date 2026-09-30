import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, timezone_id='America/Toronto')
        page = await ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: m.type=='error' and errs.append(m.text))
        await page.goto('http://localhost:8765/?fixture=1&today=2026-09-08#teams=402575,398263')
        await page.wait_for_timeout(1000)
        print('STATUS', await page.locator('#status').inner_text())
        print('FIRST CARD', (await page.locator('.card').first.inner_text()).replace('\n',' | '))
        await page.click('[data-view=teams]'); await page.wait_for_timeout(300)
        heads=await page.locator('.division h3').all_inner_texts()
        print('DIVISIONS', heads)
        print('LEAGUE HEADINGS', await page.locator('.league-heading').all_inner_texts())
        await page.locator('.league-heading').scroll_into_view_if_needed()
        await page.screenshot(path='test/g1-teams.png')
        await page.fill('#teamSearch','gaara'); await page.wait_for_timeout(200)
        print('SEARCH gaara divisions', await page.locator('.division h3').all_inner_texts())
        print('SETTINGS', (await page.locator('.settings').inner_text()).split('\n')[3:6])
        print('errors', errs)
        await b.close()
asyncio.run(main())
