"""Exercise Doomsday through the actual airport and marina game, UI and server."""
from pathlib import Path
import asyncio, math, os, socket, subprocess, tempfile, uuid
from playwright.async_api import async_playwright

os.chdir(Path(__file__).resolve().parents[1])


async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='doomsday-world-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as playwright:
                    browser = await playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(120):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    else:
                        raise AssertionError(Path(directory, 'server.log').read_text()[-3000:])
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    csrf = (await (await context.request.get(base + '/api/game/room-session')).json())['data']['csrfToken']
                    page = await context.new_page()
                    page.set_default_timeout(30000)
                    errors, inputs = [], []
                    page.on('pageerror', lambda error: (errors.append(str(error)), print('Page error:', error, flush=True)))
                    def record_input(request):
                        if request.method == 'POST' and '/gameplay' in request.url and (request.post_data_json or {}).get('action') == 'input':
                            inputs.append(request.post_data_json.get('input', {}))
                    page.on('request', record_input)
                    await page.route('https://**/*', lambda route: route.abort())

                    async def load(world):
                        await page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                        try:
                            await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && MuzikazHouseExplorer.snapshot().serverReady', timeout=180000)
                        except Exception:
                            await page.screenshot(path='/workspace/doomsday-world-startup-failed.png')
                            print(world, 'startup errors', errors, flush=True)
                            raise
                        print(world + ': actual game ready', flush=True)
                        close = page.get_by_role('button', name='Close local quests', exact=True)
                        if await close.is_visible():
                            await close.click()

                    async def open_menu():
                        invitation = page.locator('.resident-visitor-prompt [data-visitor-dismiss]')
                        if not await page.locator('#doomsday-panel').is_visible() and await invitation.is_visible():
                            await invitation.click()
                        toggle = page.locator('.doomsday-toggle')
                        if not await toggle.is_visible():
                            more = page.get_by_role('button', name='More view controls', exact=True)
                            if await more.is_visible() and await more.get_attribute('aria-expanded') != 'true':
                                await more.click()
                        if await toggle.get_attribute('aria-expanded') != 'true':
                            await toggle.click()
                        await page.locator('#doomsday-panel').wait_for(state='visible')

                    async def command(world, action, **fields):
                        response = await context.request.post(base + '/api/rooms/' + world + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                        assert response.ok, (world, action, response.status, await response.text())
                        payload = await response.json()
                        return payload.get('data', payload)

                    async def phase(expected):
                        await page.wait_for_function('(phase)=>MuzikazHouseExplorer.snapshot().doomsday?.phase===phase', arg=expected, timeout=30000)
                        return await page.evaluate('MuzikazHouseExplorer.snapshot()')

                    airport = 'muzikaz-airport'
                    await load(airport)
                    await open_menu()
                    assert await page.locator('[data-aircraft]').count() == 2, 'Both actual emergency aircraft must be offered.'
                    await page.locator('[data-operation="start"]').click()
                    state = await phase('warning')
                    assert state['doomsday']['active']
                    assert not state['player']['inputBlocked'], 'Doomsday menu blocked movement.'
                    assert await page.locator('.doomsday-banner').is_visible()
                    assert await page.locator('[data-operation="advance"]').is_disabled(), 'Phase advanced before the checkpoint.'
                    print('airport: actual warning state and banner visible', flush=True)

                    inputs.clear()
                    before = state['player']['position']
                    await page.keyboard.down('s')
                    await page.wait_for_timeout(1200)
                    await page.keyboard.up('s')
                    after = (await page.evaluate('MuzikazHouseExplorer.snapshot()'))['player']['position']
                    assert any(abs(item.get('forward', 0)) > .5 for item in inputs), 'Open Doomsday menu swallowed movement input.'
                    assert math.hypot(after[0] - before[0], after[2] - before[2]) > .2, (before, after)
                    print('airport: movement with the command menu open passed', flush=True)

                    for aircraft in ['airport-command-flight', 'airport-evacuation-flight']:
                        await open_menu()
                        await page.locator('[data-aircraft="' + aircraft + '"]').click()
                        await page.wait_for_function('(id)=>MuzikazHouseExplorer.snapshot().vehicleId===id', arg=aircraft, timeout=30000)
                        assert (await page.evaluate('MuzikazHouseExplorer.snapshot()'))['doomsday']['phase'] == 'warning', 'Boarding reset the shared scenario.'
                        await page.locator('#doomsday-panel').wait_for(state='hidden')
                    print('airport: warning menu, free movement, and both actual emergency aircraft passed', flush=True)

                    for current, following in [('warning', 'fallout'), ('fallout', 'recovery'), ('recovery', 'all-clear')]:
                        state = await phase(current)
                        objective = next(item for item in state['doomsday']['objectives'] if item['phase'] == current and not item['completed'])
                        # Use the normal validated public-map travel command to
                        # reach the authored site, then complete it in the UI.
                        moved = await command(airport, 'map-access', position=objective['position'])
                        assert moved['doomsday']['phase'] == current
                        await page.wait_for_function('(point)=>{const p=MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-point.x,p[2]-point.z)<.15}', arg=objective['position'], timeout=15000)
                        await open_menu()
                        await page.locator('[data-objective="' + objective['id'] + '"]').click()
                        await page.wait_for_function('MuzikazHouseExplorer.snapshot().doomsday.canAdvance', timeout=15000)
                        await page.locator('[data-operation="advance"]').click()
                        await phase(following)
                        if following == 'fallout':
                            assert await page.locator('.doomsday-banner').get_attribute('data-phase') == 'fallout'
                            await page.screenshot(path='/workspace/doomsday-world-fallout.png')
                    state = await phase('all-clear')
                    assert state['doomsday']['completedCount'] == 3 and not state['doomsday']['active']
                    await page.locator('.doomsday-banner').wait_for(state='hidden')
                    assert state['controlsReady'] and not state['player']['inputBlocked']
                    print('airport: shelter, fallout supplies, recovery relay and all-clear UI passed', flush=True)

                    await load('world-district-neon-docks')
                    assert (await phase('idle'))['doomsday']['mapId'] == 'world-district-neon-docks'
                    assert not await page.locator('.doomsday-banner').is_visible(), 'Previous-map emergency leaked into marina.'
                    await open_menu()
                    await page.locator('[data-operation="start"]').click()
                    state = await phase('warning')
                    assert state['doomsday']['active'] and state['controlsReady'] and not state['player']['inputBlocked']
                    await page.locator('[data-operation="stop"]').click()
                    await phase('idle')
                    await page.locator('.doomsday-banner').wait_for(state='hidden')
                    assert not errors, errors
                    print('marina: fresh playable scenario, normal controls and clean stop passed', flush=True)
                    await browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)


asyncio.run(main())
