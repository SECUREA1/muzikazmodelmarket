"""Live mobile construction HUD: usable scene, compact controls and safe hiding.

Uses a temporary real server and native construction site. The separate
game-viewport browser test exercises native and iOS-style fullscreen fallback.
"""

import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ROOM = 'skyscraper-construction'
VIEWPORTS = [(390, 844), (320, 568), (844, 390)]


def hit_test(locator):
    return locator.evaluate("""element => {
        const r = element.getBoundingClientRect();
        const v = visualViewport || {width: innerWidth, height: innerHeight};
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1 &&
          r.right <= v.width + 1 && r.bottom <= v.height + 1 &&
          !!top && (top === element || element.contains(top));
    }""")


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'

with tempfile.TemporaryDirectory(prefix='mobile-construction-view-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(
            ['node', 'server.mjs'], stdout=log, stderr=log,
            env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory},
        )
        try:
            with sync_playwright() as playwright:
                api = playwright.request.new_context(base_url=base)
                for _ in range(100):
                    try:
                        if api.get('/api/health', timeout=1000).ok:
                            break
                    except Exception:
                        time.sleep(.1)
                else:
                    raise AssertionError('Temporary server did not start')
                browser = playwright.chromium.launch(
                    executable_path='/usr/bin/chromium', headless=True,
                    args=['--no-sandbox', '--enable-unsafe-swiftshader'],
                )
                for touch in [True, False]:
                    sizes = VIEWPORTS if touch else [(1280, 800)]
                    context = browser.new_context(
                        viewport={'width': sizes[0][0], 'height': sizes[0][1]},
                        has_touch=touch, is_mobile=touch, device_scale_factor=1,
                        service_workers='block', reduced_motion='reduce',
                    )
                    # Match the actual four-core budget rather than host cores.
                    context.add_init_script("Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4})")
                    if touch:
                        # Exercise the supported page fallback used when iOS
                        # Safari has no element fullscreen API.
                        context.add_init_script("Object.defineProperty(Element.prototype,'requestFullscreen',{value:undefined,configurable:true});Object.defineProperty(Element.prototype,'webkitRequestFullscreen',{value:undefined,configurable:true})")
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    page = context.new_page()
                    errors, requests, replies = [], [], []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())

                    def record(request):
                        if request.method == 'POST' and '/gameplay' in request.url:
                            requests.append(request.post_data_json)

                    def reply(response):
                        if response.request.method == 'POST' and '/gameplay' in response.url:
                            replies.append({'action': response.request.post_data_json.get('action'), 'status': response.status})

                    page.on('request', record)
                    page.on('response', reply)

                    def state():
                        response = context.request.get(base + '/api/rooms/' + ROOM + '/gameplay')
                        assert response.ok, response.text()
                        return response.json()['data']

                    def wait_request(predicate, after=0):
                        for _ in range(100):
                            if any(predicate(item) for item in requests[after:]):
                                return
                            page.wait_for_timeout(50)
                        raise AssertionError('Expected live command missing: ' + json.dumps(requests[-12:]))

                    try:
                        page.goto(base + '/model-explorer.html?environment=' + ROOM + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded')
                        page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && MuzikazHouseExplorer.snapshot().serverReady', timeout=120000)
                        snapshot = state()
                        machine_id = next(actor['id'] for actor in snapshot['actors'].values() if actor['modelId'] == 'site-excavator')
                        page.locator('.district-map-toggle').click()
                        page.get_by_role('button', name='Vehicles', exact=True).click()
                        page.locator('[data-craft-id="' + machine_id + '"]').click()
                        panel = page.locator('.construction-controls')
                        panel.wait_for(state='visible')
                        assert panel.bounding_box()['height'] <= 252
                        viewport_toggle = page.locator('.game-viewport-toggle')
                        viewport_toggle.scroll_into_view_if_needed()
                        assert hit_test(viewport_toggle), 'Normal-page fullscreen control is unreachable'
                        viewport_toggle.click()
                        page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded==="true"')
                        expected_mode = 'page' if touch else 'native'
                        assert page.locator('.game-viewport-expanded').get_attribute('data-viewport-mode') == expected_mode

                        for width, height in sizes:
                            page.set_viewport_size({'width': width, 'height': height})
                            page.wait_for_timeout(150)
                            page.locator('[data-construction-mode=work]').click()
                            geometry = page.evaluate("""() => {
                                const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
                                return {stage:rect(document.querySelector('.house-stage')), panel:rect(document.querySelector('.construction-controls')), viewport:{width:innerWidth,height:innerHeight}};
                            }""")
                            maximum = 150 if height <= 430 else 250
                            assert geometry['panel']['height'] <= maximum + 2, (width, height, 'compact panel exceeds budget', geometry)
                            if touch:
                                assert geometry['stage']['height'] >= height * .7, ('default scene too short', geometry)
                            pads = panel.locator('.construction-work-sticks .construction-stick:visible')
                            assert pads.count() == 2
                            assert all(hit_test(pads.nth(index)) for index in range(2)), ('work pads clipped or covered', geometry)
                            assert panel.locator('[data-operation=exit]:visible').count() == 1
                            assert not page.locator('.nearby-gameplay-actions').is_visible(), 'Duplicate nearby Exit action'
                            assert not page.locator('.rad-tox-fire-trigger').is_visible(), 'Duplicate fire/reticle action'
                            assert panel.locator('.sports-primary-trigger:visible').count() == 1

                            # Real dialogs must stay usable in both native
                            # fullscreen and the mobile page fallback.
                            panel.locator('[data-construction-view=instruments]').click()
                            instruments = page.locator('.construction-instruments-dialog')
                            assert instruments.is_visible()
                            assert instruments.locator('meter:visible').count() >= 6
                            close_instruments = instruments.get_by_role('button', name='Close instruments', exact=True)
                            assert hit_test(close_instruments)
                            close_instruments.click()
                            panel.locator('[data-construction-more]').click()
                            functions = page.locator('.construction-functions-dialog')
                            assert functions.is_visible()
                            precision_before = state()['actors'][machine_id]['construction']['precision']
                            functions.locator('[data-operation=precision]').click()
                            for _ in range(60):
                                if state()['actors'][machine_id]['construction']['precision'] != precision_before:
                                    break
                                page.wait_for_timeout(50)
                            else:
                                raise AssertionError('Fullscreen function dialog did not reach server precision control')
                            close_functions = functions.get_by_role('button', name='Close functions', exact=True)
                            assert hit_test(close_functions)
                            close_functions.click()

                            # A real lever command must move the authoritative joint.
                            before = state()['actors'][machine_id]['construction']['boom']
                            key = 'ArrowUp' if before > 1.2 else 'ArrowDown'
                            direction = -1 if key == 'ArrowUp' else 1
                            start = len(requests)
                            pads.nth(1).focus()
                            page.keyboard.down(key)
                            wait_request(lambda item: item.get('operation') == 'control' and item.get('axes', {}).get('boom', 0) * direction > .5, start)
                            for _ in range(60):
                                if (state()['actors'][machine_id]['construction']['boom'] - before) * direction > .005:
                                    break
                                page.wait_for_timeout(50)
                            else:
                                raise AssertionError('Work lever did not move the server joint')

                            # Global hide must release held controls and retain a usable restore affordance.
                            start = len(requests)
                            page.locator('.game-hud-toggle').click()
                            page.keyboard.up(key)
                            wait_request(lambda item: item.get('operation') == 'control' and not any(item.get('axes', {}).values()), start)
                            assert page.locator('.house-stage').get_attribute('data-hud-hidden') == 'true'
                            assert not panel.is_visible()
                            assert not page.locator('.house-control-dock').is_visible()
                            hidden_canvas = page.locator('#house-explorer-canvas').bounding_box()
                            assert hidden_canvas['height'] >= geometry['stage']['height'] - 1, 'Hide shrank the game canvas'
                            assert hit_test(viewport_toggle), 'Global hide also hid fullscreen control'
                            restore = page.get_by_role('button', name='Show game controls', exact=True)
                            assert hit_test(restore)
                            bounds = restore.bounding_box()
                            assert bounds['height'] >= 44 and bounds['width'] >= 44
                            # A new incoming vehicle panel cannot escape the global hidden state.
                            page.evaluate("""() => {const incoming=document.createElement('section');incoming.className='road-vehicle-controls';incoming.id='test-incoming-controls';incoming.innerHTML='<button>Incoming machine</button>';document.querySelector('.house-stage').append(incoming);} """)
                            page.wait_for_selector('.game-display-flow #test-incoming-controls', state='attached')
                            assert not page.locator('#test-incoming-controls').is_visible()
                            page.locator('#test-incoming-controls').evaluate('element=>element.remove()')
                            page.wait_for_timeout(300)
                            assert not panel.is_visible(), 'Snapshot resurrected hidden controls'
                            if (width, height) == (390, 844):
                                page.screenshot(path='/tmp/mobile-construction-hidden-390x844.png')
                            restore.click()
                            assert panel.is_visible()
                            assert hit_test(panel.locator('[data-operation=park]'))

                            # Work/Drive mode changes release the live travel input.
                            panel.locator('[data-construction-mode=drive]').click()
                            travel = panel.locator('.construction-travel-stick')
                            assert hit_test(travel)
                            start = len(requests)
                            travel.focus()
                            page.keyboard.down('ArrowUp')
                            wait_request(lambda item: item.get('action') == 'input' and item.get('input', {}).get('forward', 0) > .5, start)
                            start = len(requests)
                            panel.locator('[data-construction-mode=work]').click()
                            page.keyboard.up('ArrowUp')
                            wait_request(lambda item: item.get('action') == 'input' and abs(item.get('input', {}).get('forward', 0)) < .01, start)
                            panel.locator('[data-operation=park]').click()
                            assert not travel.is_visible()

                            # The machine's own Hide removes the entire row and restores it locally.
                            local = page.get_by_role('button', name='Show or hide construction dashboard', exact=True)
                            local.click()
                            assert not panel.is_visible()
                            assert hit_test(local)
                            local.click()
                            assert panel.is_visible()
                            assert hit_test(panel.locator('[data-operation=exit]'))
                            page.screenshot(path=f'/tmp/mobile-construction-view-{width}x{height}.png')
                            print(f'Live compact HUD passed {width}x{height}: panel {geometry["panel"]["height"]:.0f}px, stage {geometry["stage"]["height"]:.0f}px.', flush=True)

                        panel.locator('[data-operation=park]').click()
                        panel.locator('.construction-work-sticks').evaluate('element=>element.scrollIntoView({block:"nearest"})')
                        page.screenshot(path='/tmp/mobile-construction-view-' + ('phone' if touch else 'desktop') + '.png')
                        panel.locator('[data-operation=exit]').click()
                        panel.wait_for(state='hidden')
                        viewport_toggle.click()
                        page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded!=="true"')
                        assert not errors, errors
                    except Exception:
                        diagnostic = {'errors': errors, 'requests': requests[-20:], 'replies': replies[-20:], 'state': state()}
                        Path('/tmp/mobile-construction-view-failure.json').write_text(json.dumps(diagnostic, indent=2))
                        page.screenshot(path='/tmp/mobile-construction-view-failure.png')
                        raise
                    finally:
                        context.close()
                browser.close()
                api.dispose()
        finally:
            server.terminate()
            server.wait(timeout=10)

print('Live mobile compact dashboards, HUD restore and held-control neutralization passed.')
