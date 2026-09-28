import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':390,'height':700})
        await pg.goto('http://localhost:8765/#teams=398263'); await pg.wait_for_timeout(3000)
        print('no cache, live blocked ->', await pg.locator('#status').inner_text())
        await pg.goto('http://localhost:8765/?fixture=1'); await pg.wait_for_timeout(600)
        await pg.evaluate("(()=>{const c=JSON.parse(localStorage.getItem('rt.cache'));c.fetchedAt-=3600e3;localStorage.setItem('rt.cache',JSON.stringify(c))})()")
        await pg.route('**/fixture.json', lambda r: r.abort())
        await pg.reload(); await pg.wait_for_timeout(800)
        print('stale cache, offline ->', await pg.locator('#status').inner_text(), '| cards', await pg.locator('.card').count())
        await b.close()
asyncio.run(main())
