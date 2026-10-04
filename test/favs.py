# Favourites: star in Teams tab, remembered Upcoming filter, unfollow removes star, share link.
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='America/Toronto')
        await ctx.clock if False else None
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
        await pg.clock.install(time='2026-09-26T08:00:00-04:00')
        # follow Nepean U14AA (398266), Ottawa Ice U14A (398263), West Ottawa U14AA Gorham (401648)
        await pg.goto('http://localhost:8765/?fixture=1#teams=398266,398263,401648'); await pg.wait_for_timeout(900)
        print('upcoming cards (All, no favs):', await pg.locator('.card').count(), '| toggle:', await pg.locator('#favToggle').inner_text(), await pg.locator('#favToggle').is_visible())
        await pg.screenshot(path='test/f3-all.png')
        # star West Ottawa Wild U14AA in Teams tab
        await pg.click('[data-view=teams]'); await pg.wait_for_timeout(300)
        await pg.click('.team-row:has-text("West Ottawa Wild U14AA - Gorham") .star')
        await pg.wait_for_timeout(200)
        print('badge:', await pg.locator('#teamCount').inner_text(), '| fav section:', await pg.locator('.fav-section').inner_text())
        await pg.locator('.fav-section').screenshot(path='test/f1-teams.png')
        # Upcoming: stars on names; switch to favourites
        await pg.click('[data-view=upcoming]'); await pg.wait_for_timeout(300)
        print('stars on cards:', await pg.locator('.card .fav-star').count(), '| fav chip in ice rows:', await pg.locator('.chip.fav').count())
        await pg.click('#favToggle'); await pg.wait_for_timeout(300)
        n_fav = await pg.locator('.card').count()
        print('Favourites view cards:', n_fav)
        await pg.screenshot(path='test/f2-favs.png')
        await pg.emulate_media(color_scheme='dark'); await pg.screenshot(path='test/f4-favs-dark.png'); await pg.emulate_media(color_scheme='light')
        # restart: filter remembered
        await pg.reload(); await pg.wait_for_timeout(900)
        print('after restart, fav pressed:', await pg.locator('#favToggle').get_attribute('aria-pressed'), '| cards:', await pg.locator('.card').count())
        print('share url:', await pg.evaluate("location.origin") , '...', 'favs=' in (await pg.evaluate("localStorage.getItem('rt.favs')")) or await pg.evaluate("localStorage.getItem('rt.favs')"))
        # unfollow the favourite -> star removed
        await pg.click('[data-view=teams]'); await pg.wait_for_timeout(300)
        print('toggle hidden on Teams tab:', not await pg.locator('#favToggle').is_visible())
        await pg.locator('.division:not(.fav-section) .team-row:has-text("West Ottawa Wild U14AA - Gorham") input').uncheck()
        await pg.wait_for_timeout(200)
        print('after unfollow favs:', await pg.evaluate("localStorage.getItem('rt.favs')"), '| badge:', await pg.locator('#teamCount').inner_text(), '| fav section count:', await pg.locator('.fav-section').count())
        await pg.click('[data-view=upcoming]'); await pg.wait_for_timeout(300)
        print('fav view with no favs:', (await pg.locator('.empty h2').inner_text()))
        # share link import into fresh browser
        p2=await (await b.new_context()).new_page()
        await p2.goto('http://localhost:8765/?fixture=1#teams=398266,401648&favs=401648'); await p2.wait_for_timeout(800)
        print('imported tracked/favs:', await p2.evaluate("localStorage.getItem('rt.tracked')"), await p2.evaluate("localStorage.getItem('rt.favs')"))
        print('errors', errs); await b.close()
asyncio.run(main())
