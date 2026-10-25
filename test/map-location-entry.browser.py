"""Real map-directory buttons reach safe destinations after entry and reload.

Uses the production map UI and room client against an isolated server. The
minimal stage avoids making travel assertions depend on 3D shader performance.
"""
from pathlib import Path
from urllib.parse import unquote, urlparse
import asyncio
import math
import mimetypes
import os
import socket
import subprocess
import tempfile
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = '''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#182c35;color:white}main{height:100vh;position:relative}
canvas{width:100%;height:100%}</style><main><canvas tabindex="0"></canvas></main>'''
DESTINATIONS = [
    ('skyscraper-construction', ['city-tower-4', 'city-tower-6', 'city-tower-10']),
    ('muzikaz-airport', ['apron']),
    ('crew-plaza-outdoors', ['map-arrival']),
]


async def run():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='map-location-entry-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(
                ['node', 'server.mjs'], cwd=ROOT,
                env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory},
                stdout=log, stderr=log,
            )
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(
                        executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
                    context = await browser.new_context(
                        viewport={'width': 1280, 'height': 900}, service_workers='block')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(100):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.1)
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201

                    # The server normally prefers dist/. Serve current production
                    # sources directly so an old local build cannot mask changes.
                    async def production_asset(route):
                        path = (ROOT / unquote(urlparse(route.request.url).path).lstrip('/')).resolve()
                        assert path.is_relative_to(ROOT / 'public'), path
                        await route.fulfill(path=path, content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')

                    await context.route('**/public/**', production_asset)
                    page = await context.new_page()
                    page.set_default_timeout(15000)
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    await page.route('**/__map_location_entry', lambda route: route.fulfill(
                        content_type='text/html', body=FIXTURE))
                    count = 0
                    for world_id, location_ids in DESTINATIONS:
                        for load in ['first', 'reload']:
                            await page.goto(base + '/__map_location_entry')
                            await page.evaluate('''async id => {
                                const {SharedGameInventory} = await import('/public/js/shared-game-inventory.js');
                                const {mountDistrictMap} = await import('/public/js/district-map.js');
                                const {connectAuthoritativeRoom} = await import('/public/js/authoritative-room-client.js');
                                const {localMapLocations} = await import('/public/js/local-map-locations.js');
                                const api = new SharedGameInventory();
                                window.world = await api.api('/api/environments/' + encodeURIComponent(id));
                                window.places = localMapLocations(world);
                                window.reply = null; window.sent = []; window.rejectNext = false;
                                window.map = mountDistrictMap({stage:document.querySelector('main'),
                                    fetchAtlas:async () => ({locations:[]}),
                                    command:async (action, fields) => {
                                        if (rejectNext) { rejectNext = false; fields = {...fields, locationId:'removed-test-location'}; }
                                        sent.push({action, ...fields});
                                        reply = await client.send(action, fields);
                                        return reply;
                                    }});
                                map.update(world);
                                window.client = connectAuthoritativeRoom({roomId:id, input:() => ({}),
                                    inputInterval:1000, deferRadTox:true, radToxEnabled:false,
                                    render:(state, selfId) => map.updateLive(state, selfId)});
                                await client.whenReady(30000); map.setReady(true);
                            }''', world_id)
                            places = await page.evaluate('places')
                            await page.locator('.district-map-toggle').click()
                            for location_id in location_ids:
                                place = next(place for place in places if place['id'] == location_id)
                                control = page.get_by_role('button', name='Port to ' + place['name'], exact=True, include_hidden=True)
                                await control.evaluate('''button => {
                                    for (let details = button.closest('details'); details; details = details.parentElement.closest('details')) details.open = true;
                                }''')
                                if count == 0:
                                    # A real server rejection must reach the map
                                    # panel and release its busy latch for retry.
                                    await page.evaluate('rejectNext = true')
                                    await control.click()
                                    await page.wait_for_function("document.querySelector('.game-action-loading')?.dataset.state === 'error'")
                                    assert await page.locator('.local-map-status').inner_text() == 'Choose a listed map location.'
                                    assert await page.locator('.game-action-loading strong').inner_text() == 'Choose a listed map location.'
                                    assert await page.locator('.district-map-dialog').is_visible()
                                    assert await control.is_enabled()
                                    assert await page.evaluate('sent.length') == 1

                                await page.evaluate('reply = null')
                                await control.click()
                                await page.wait_for_function('reply !== null')
                                state = await page.evaluate('reply')
                                point = state['players'][state['selfId']]['position']
                                assert state['result']['message'] == 'Arrived at ' + place['name'] + '.'
                                assert all(math.isfinite(point[axis]) for axis in ['x', 'y', 'z']), point
                                await page.wait_for_function("document.querySelector('.game-action-loading')?.dataset.state === 'ready'")
                                assert await page.locator('.district-map-dialog').is_visible()
                                assert await control.is_enabled()
                                count += 1
                                print(f'{world_id}: {location_id} entered after {load} load.', flush=True)
                            await page.evaluate('client.stop(); map.dispose()')
                    assert not errors, errors
                    await browser.close()
                    print(f'{count} real-server map entries passed; rejection details and retry passed.')
            finally:
                server.terminate()
                server.wait(timeout=15)


asyncio.run(run())
