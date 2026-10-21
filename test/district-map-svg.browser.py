from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width, height in [(320, 568), (390, 844), (844, 390), (1280, 800)]:
            page = browser.new_page(viewport={'width': width, 'height': height}, has_touch=True)
            page.set_default_timeout(6000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
            page.wait_for_selector('body[data-ready=true]')
            page.evaluate('''async () => {
                const {mountDistrictMap, districtLocations} = await import('/public/js/district-map.js');
                window.commands = []; window.holdTravel = false; window.completeTravel = null;
                window.keyEvents = []; window.addEventListener('keydown', event => keyEvents.push(event.key));
                window.mapWorld = {id:'offset-room', name:'Offset room'};
                window.runtimeBounds = {min:{x:100,y:-2,z:-90},max:{x:180,y:14,z:-30}};
                window.localMap = mountDistrictMap({
                    stage: document.querySelector('.house-stage'),
                    fetchAtlas: async () => ({locations: []}),
                    command: async (action, fields) => {
                        commands.push({action, ...fields});
                        if (holdTravel) return new Promise(resolve => completeTravel = resolve);
                        return {result:{message:'Arrived'}};
                    }
                });
                localMap.update(mapWorld, {bounds:runtimeBounds});
                window.expectedLocations = districtLocations(mapWorld, runtimeBounds);
            }''')
            opener = page.get_by_role('button', name='Local map and land deeds', exact=True)
            dialog = page.get_by_role('dialog', name='Local map and land deeds', exact=True)

            def open_map():
                opener.click()
                page.wait_for_function("Math.abs((document.querySelector('.district-map-dialog[open] .district-map-marker-hit')?.getBoundingClientRect().width || 0) - 44) < .1")

            def wait_closed():
                page.wait_for_function("document.querySelector('.district-map-toggle').getAttribute('aria-expanded') === 'false'")

            open_map()
            assert dialog.locator('[data-local-location]').count() == page.evaluate('expectedLocations.length')
            assert dialog.locator('.district-map-destination').count() == page.evaluate('expectedLocations.length')
            assert page.evaluate('''() => {
                const svg = document.querySelector('.district-local-map');
                const b = svg.viewBox.baseVal;
                return b.x <= 100 && b.y <= -90 && b.x + b.width >= 180 && b.y + b.height >= -30 && b.width < 100;
            }''')
            assert dialog.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
            assert dialog.locator('.district-map-destination').evaluate_all('''elements => elements.every(el => {
                const r = el.getBoundingClientRect();
                return r.width >= 44 && r.height >= 44 && !el.closest('details');
            })''')
            assert dialog.locator('.district-map-marker-hit').evaluate_all('elements => elements.every(el => el.getBoundingClientRect().width >= 43.9 && el.getBoundingClientRect().height >= 43.9)')

            # Touching a named SVG marker sends its safe identifier, never a second raw-ground click.
            north = dialog.locator('[data-local-location="map-north"]')
            north.tap()
            wait_closed()
            assert page.evaluate('commands') == [{'action': 'map-access', 'locationId': 'map-north'}]

            # Both standard keyboard activation keys work without controlling the underlying game.
            for key, place_id in [('Enter', 'map-east'), ('Space', 'map-west')]:
                open_map()
                marker = dialog.locator(f'[data-local-location="{place_id}"]')
                marker.focus()
                marker.press(key)
                wait_closed()
                assert page.evaluate('commands.at(-1)') == {'action': 'map-access', 'locationId': place_id}
            assert page.evaluate('keyEvents') == []

            open_map()
            dialog.locator('.district-map-destination[data-local-destination="map-south"]').click()
            wait_closed()
            assert page.evaluate('commands.at(-1)') == {'action': 'map-access', 'locationId': 'map-south'}

            # Ground clicks remain available, using coordinates in the offset scene rather than +/-128.
            open_map()
            page.evaluate('''() => {
                const svg = document.querySelector('.district-local-map');
                const point = svg.createSVGPoint(); point.x = 106; point.y = -84;
                const screen = point.matrixTransform(svg.getScreenCTM());
                svg.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:screen.x, clientY:screen.y}));
            }''')
            wait_closed()
            command = page.evaluate('commands.at(-1)')
            assert command['action'] == 'map-access' and 'locationId' not in command
            unit = page.evaluate('1 / document.querySelector(".district-local-map").getScreenCTM().a')
            assert abs(command['position']['x'] - 106) <= unit and abs(command['position']['z'] + 84) <= unit

            # Repeated touches while a command is pending cannot submit a second journey.
            open_map()
            page.evaluate('''() => {
                holdTravel = true; window.beforePending = commands.length;
                const marker = document.querySelector('[data-local-location="map-north"]');
                marker.dispatchEvent(new MouseEvent('click', {bubbles:true}));
                marker.dispatchEvent(new MouseEvent('click', {bubbles:true}));
            }''')
            assert page.evaluate('commands.length === beforePending + 1')
            assert dialog.locator('.district-map-destination').first.is_disabled()
            assert dialog.locator('[data-local-location="map-north"]').get_attribute('aria-disabled') == 'true'
            page.evaluate('completeTravel(false)')
            page.wait_for_function("document.querySelector('.district-map-dialog [role=status]').textContent.startsWith('Travel could not')")
            assert not dialog.locator('.district-map-destination').first.is_disabled()

            # An old reply cannot close a newly opened map or re-enable the wrong controls.
            page.evaluate('''() => document.querySelector('[data-local-location="map-north"]').dispatchEvent(new MouseEvent('click', {bubbles:true}))''')
            dialog.get_by_role('button', name='Close', exact=True).click()
            wait_closed()
            open_map()
            page.evaluate('completeTravel({result:{message:"Old arrival"}})')
            page.wait_for_timeout(30)
            assert dialog.is_visible()
            assert not dialog.locator('.district-map-destination').first.is_disabled()
            assert dialog.get_by_role('status').inner_text() != 'Old arrival'

            # A live occupied seat blocks SVG and ground travel just like the server does.
            page.evaluate('''() => {
                localMap.updateLive({players:{self:{id:'self',vehicleId:'boat',position:{x:140,y:0,z:-60}}},actors:{}},'self');
                window.beforeSeated = commands.length;
                document.querySelector('[data-local-location="map-north"]').dispatchEvent(new MouseEvent('click', {bubbles:true}));
                document.querySelector('.district-local-map').dispatchEvent(new MouseEvent('click', {bubbles:true,clientX:1,clientY:1}));
            }''')
            assert page.evaluate('commands.length === beforeSeated')
            assert dialog.locator('.district-map-destination').first.is_disabled()
            assert 'Exit your seat' in dialog.get_by_role('status').inner_text()
            dialog.get_by_role('button', name='Close', exact=True).click()
            wait_closed()
            # Resized terrain keeps destinations in view; close landmarks retain separate touch targets.
            page.evaluate('''() => {
                holdTravel = false;
                localMap.update({id:'small-terrain',name:'Small terrain',spawn:{x:0,z:72},builderScene:{mapSize:256}}, {scale:.1});
            }''')
            open_map()
            assert page.evaluate('''() => {
                const box=document.querySelector('.district-local-map').viewBox.baseVal;
                return box.width<30 && box.height<30;
            }''')
            assert dialog.locator('.district-map-marker-hit').evaluate_all('''elements => {
                const boxes=elements.map(el=>el.getBoundingClientRect());
                return boxes.every((a,i)=>boxes.every((b,j)=>i===j||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
            }'''), f'{width}x{height}: ' + str(dialog.locator('.district-map-marker-hit').evaluate_all('elements=>elements.map(el=>({id:el.parentElement.dataset.localLocation,rect:el.getBoundingClientRect().toJSON()}))'))
            dialog.locator('[data-local-location="map-south"]').tap()
            wait_closed()
            assert page.evaluate('commands.at(-1)') == {'action':'map-access','locationId':'map-south'}
            assert not errors, errors
            page.close()
        browser.close()
    print('Local SVG map markers: touch, keyboard, visible destinations, scene bounds, ground clicks, pending travel and occupied-seat guards passed at four viewports.')
finally:
    server.shutdown()
