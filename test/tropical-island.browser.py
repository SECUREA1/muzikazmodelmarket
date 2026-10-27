"""Exercise unlimited island exploration and independent two-minute beer buzzes.

Run from the repository with: python3 test/tropical-island.browser.py
Screenshots are written to /tmp/tropical-island-previews.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PREVIEWS = Path('/tmp/tropical-island-previews')
PREVIEWS.mkdir(exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f'http://127.0.0.1:{server.server_port}'


def state(page):
    return page.evaluate('window.islandAdventure.getState()')


def reachable(locator):
    """The visible control can receive a real click at its center."""
    assert locator.is_visible(), f'Control is hidden: {locator}'
    assert locator.evaluate('''element=>{
      const r=element.getBoundingClientRect();
      return r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&
        r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&
        element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    }'''), f'Control is outside the viewport or covered: {locator}'


def new_page(browser, *, mobile=False):
    context = browser.new_context(
        viewport={'width': 390 if mobile else 1440, 'height': 844 if mobile else 960},
        is_mobile=mobile, has_touch=mobile, service_workers='block',
        reduced_motion='no-preference',
    )
    errors, failures, external = [], [], []
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.on('response', lambda response: failures.append(f'{response.status}: {response.url}') if response.status >= 400 else None)

    def local_only(route):
        if urlparse(route.request.url).netloc == urlparse(base).netloc:
            route.continue_()
        else:
            external.append(route.request.url)
            route.abort()

    page.route('**/*', local_only)
    page.goto(base + '/tropical-island.html?environment=tropical-island&mode=solo', wait_until='networkidle')
    page.wait_for_function('window.islandAdventure?.ready===true', timeout=30000)
    assert state(page)['status'] == 'ready'
    assert page.locator('#world canvas').is_visible()
    assert page.locator('#start-button').is_enabled()
    assert page.locator('#load-error').is_hidden()
    assert page.locator('.destination').count() == 8
    assert not external, f'The island should use bundled assets: {external}'
    return context, page, errors, failures


def hold_until(page, key, predicate, *, timeout=15000):
    page.keyboard.down(key)
    try:
        page.wait_for_function(predicate, timeout=timeout)
    except Exception:
        print('Movement diagnostic:', key, state(page), flush=True)
        page.screenshot(path=str(PREVIEWS / 'movement-failure.png'))
        raise
    finally:
        page.keyboard.up(key)


try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--enable-unsafe-swiftshader'],
        )
        try:
            context, page, errors, failures = new_page(browser)
            page.clock.install()
            reachable(page.locator('#start-button'))
            page.screenshot(path=str(PREVIEWS / 'desktop-welcome.png'))
            page.locator('#start-button').click()
            assert state(page)['status'] == 'running'
            assert state(page)['remaining'] is None, 'Island exploration has no countdown.'
            assert page.locator('#welcome').is_hidden()
            assert page.locator('#round-hud').is_visible()
            assert page.locator('#results').is_hidden()

            initial_view = state(page)['view']
            page.keyboard.press('v')
            assert state(page)['view'] != initial_view
            page.keyboard.press('v')
            assert state(page)['view'] == initial_view
            if initial_view != 'top-down':
                page.keyboard.press('v')
            page.keyboard.press('m')
            assert state(page)['overview'] is True
            assert state(page)['view'] == 'top-down'
            page.screenshot(path=str(PREVIEWS / 'desktop-island-map.png'))
            page.keyboard.press('m')
            assert state(page)['overview'] is False

            # Follow an actual passport waypoint and walk to the bar with keys.
            page.locator('[data-destination="tiki-bar"]').click()
            assert page.locator('[data-destination="tiki-bar"]').evaluate('e=>e.classList.contains("target")')
            assert 'Tiki Tide Bar' in page.locator('#waypoint-label').inner_text()
            before = state(page)['player']
            hold_until(page, 'w', 'window.islandAdventure.getState().player.z<=11')
            assert state(page)['player']['z'] < before['z'] - 10
            hold_until(page, 'a', 'window.islandAdventure.getState().player.x<=-14')
            page.wait_for_function('document.querySelector("#interaction-label").textContent==="Tiki Tide Bar"')
            reachable(page.locator('#interact-button'))
            page.keyboard.press('e')
            assert page.locator('#bar-dialog').is_visible()
            assert 'tiki-bar' in state(page)['visits']
            assert state(page)['score'] == 100
            assert state(page)['intoxication'] == 0, 'The bar stamp must not require a drink.'

            page.locator('[data-drink="beer"]').click()
            first_drink = state(page)['activeDrinks'][0]
            assert state(page)['stomach'] > 0 or state(page)['intoxication'] > 0
            assert 'own two-minute buzz' in page.locator('#bar-status').inner_text()
            assert state(page)['score'] == 100, 'Drinks must not award passport points.'
            page.wait_for_function('window.islandAdventure.getState().elapsed>6&&window.islandAdventure.getState().intoxication>.08')
            first_buzz = state(page)['intoxication']
            # Separate intake times enough to observe the earlier drink expire
            # while the newer beer still contributes its own buzz.
            page.clock.fast_forward(30000)
            page.locator('[data-drink="beer"]').click()
            active_drinks = state(page)['activeDrinks']
            assert len(active_drinks) == 2
            assert active_drinks[0]['id'] == first_drink['id']
            assert active_drinks[0]['consumedAt'] == first_drink['consumedAt']
            last_drink = active_drinks[-1]
            assert last_drink['consumedAt'] - first_drink['consumedAt'] >= 30
            page.clock.fast_forward(10000)
            page.wait_for_function('(before)=>window.islandAdventure.getState().intoxication>Math.max(.36,before+.12)', arg=first_buzz, timeout=15000)
            assert state(page)['effects']['doubleVision'] > 0
            assert float(page.locator('#goggle-tint').evaluate('e=>e.style.opacity')) > 0
            page.screenshot(path=str(PREVIEWS / 'desktop-beach-bar.png'))
            page.get_by_role('button', name='Close beach bar', exact=True).click()
            assert page.locator('#bar-dialog').is_hidden()
            page.screenshot(path=str(PREVIEWS / 'desktop-playing.png'))

            # Walk along the public path to both marina piers; board and return
            # using E, with no state mutation or teleport test shortcut.
            hold_until(page, 'd', 'window.islandAdventure.getState().player.x>=41')
            page.wait_for_function('document.querySelector("#interaction-label").textContent==="Paddle Pier"')
            page.keyboard.press('e')
            assert state(page)['boat'] == 'paddle-boat'
            before = state(page)['player']
            hold_until(page, 'd', '(function(){const p=window.islandAdventure.getState().player;return p.x>=51;})()')
            assert state(page)['player']['x'] > before['x'] + 2
            page.keyboard.press('e')
            assert state(page)['boat'] is None
            assert abs(state(page)['player']['x'] - 43) < .5
            # The two piers have water between them, so return through shore.
            hold_until(page, 'a', 'window.islandAdventure.getState().player.x<=34')
            hold_until(page, 's', 'window.islandAdventure.getState().player.z>=19')
            hold_until(page, 'd', 'window.islandAdventure.getState().player.x>=41')
            page.wait_for_function('document.querySelector("#interaction-label").textContent==="Pontoon Club"')
            page.keyboard.press('e')
            assert state(page)['boat'] == 'pontoon'
            before = state(page)['player']
            page.wait_for_function('(before)=>{const p=window.islandAdventure.getState().player;return Math.hypot(p.x-before.x,p.z-before.z)>.7}', arg=before, timeout=10000)
            page.screenshot(path=str(PREVIEWS / 'desktop-pontoon.png'))
            page.keyboard.press('e')
            assert state(page)['boat'] is None
            assert {'tiki-bar', 'paddle-boat', 'pontoon'} <= set(state(page)['visits'])

            # Each intake expires on its own clock, even with a menu open. The
            # island must remain playable after both 120-second buzzes expire.
            page.locator('#settings-button').click()
            assert page.locator('#settings-dialog').is_visible()
            until_first_expiry = first_drink['consumedAt'] + 121 - state(page)['elapsed']
            assert until_first_expiry > 0, 'Complete the route before the first beer expires.'
            page.clock.fast_forward(int(until_first_expiry * 1000) + 1)
            page.wait_for_function('(id)=>!window.islandAdventure.getState().activeDrinks.some(d=>d.id===id)', arg=first_drink['id'])
            assert state(page)['status'] == 'running'
            assert state(page)['elapsed'] > 120
            assert state(page)['remaining'] is None
            assert [drink['id'] for drink in state(page)['activeDrinks']] == [last_drink['id']]
            assert state(page)['intoxication'] > 0
            assert page.locator('#settings-dialog').is_visible()
            assert page.locator('#results').is_hidden()

            until_last_expiry = last_drink['consumedAt'] + 121 - state(page)['elapsed']
            assert until_last_expiry > 0
            page.clock.fast_forward(int(until_last_expiry * 1000) + 1)
            page.wait_for_function('window.islandAdventure.getState().activeDrinks.length===0')
            assert state(page)['intoxication'] == 0
            assert state(page)['stomach'] == 0
            assert state(page)['buzzRemaining'] == 0
            assert state(page)['status'] == 'running'
            assert page.locator('#results').is_hidden()
            # Ending a visit is a deliberate action; it presents the summary.
            reachable(page.locator('#end-visit-button'))
            page.locator('#end-visit-button').click()
            assert state(page)['status'] == 'finished'
            assert page.locator('#settings-dialog').is_hidden()
            assert page.locator('#results').is_visible()
            page.screenshot(path=str(PREVIEWS / 'desktop-results.png'))
            page.locator('#replay-button').click()
            assert state(page)['status'] == 'running'
            assert state(page)['visits'] == []
            assert state(page)['stomach'] == 0
            assert state(page)['remaining'] is None
            assert state(page)['activeDrinks'] == []
            assert not errors, errors
            assert not failures, failures
            context.close()
            print('Desktop: unlimited exploration, independent 120-second beer buzzes, natural sobriety, explicit visit summary/replay, keyboard/camera/waypoint, both boats and offline assets pass.', flush=True)

            context, page, errors, failures = new_page(browser, mobile=True)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            reachable(page.locator('#start-button'))
            page.screenshot(path=str(PREVIEWS / 'mobile-welcome.png'))
            page.locator('#start-button').tap()
            assert state(page)['status'] == 'running'
            assert page.locator('.muzikaz-controller').is_visible()
            for selector in ['#view-button', '#settings-button', '#passport-toggle']:
                reachable(page.locator(selector))
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            page.locator('#passport-toggle').tap()
            stop = page.locator('[data-destination="beach-ball"]')
            stop.scroll_into_view_if_needed()
            reachable(stop)
            stop.tap()
            assert 'Beach Ball Rally' in page.locator('#waypoint-label').inner_text()
            page.locator('#passport-toggle').tap()

            # Move with the shared touch stick via actual pointer events.
            stick = page.locator('[data-thumbstick="left"] .thumbstick-base')
            reachable(stick)
            box = stick.bounding_box()
            before = state(page)['player']
            page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
            page.mouse.down()
            page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']*.15, steps=4)
            try:
                page.wait_for_function('(before)=>{const p=window.islandAdventure.getState().player;return Math.hypot(p.x-before.x,p.z-before.z)>.4}', arg=before, timeout=10000)
            finally:
                page.mouse.up()

            page.locator('#settings-button').tap()
            assert page.locator('#settings-dialog').is_visible()
            page.locator('#reduce-effects').check()
            page.get_by_role('button', name='Close settings', exact=True).tap()
            assert page.locator('#settings-dialog').is_hidden()
            page.screenshot(path=str(PREVIEWS / 'mobile-playing.png'))
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            assert not errors, errors
            assert not failures, failures
            context.close()
            print('Mobile: portrait layout, reachable controls, passport waypoint, touch stick and settings pass.', flush=True)
            print(f'Screenshots: {PREVIEWS}', flush=True)
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
