"""Live airport/docks controls remain usable after corner panels and boarding."""
from pathlib import Path
import argparse, asyncio, os, socket, subprocess, tempfile
from playwright.async_api import async_playwright

os.chdir(Path(__file__).resolve().parents[1])


async def snapshot_state(page):
    return await page.evaluate('MuzikazHouseExplorer.snapshot()')


async def reveal_view_control(page, control):
    # Narrow screens place these existing controls behind the visible More button.
    if not await control.is_visible():
        more = page.get_by_role('button', name='More view controls', exact=True)
        if await more.is_visible() and await more.get_attribute('aria-expanded') != 'true':
            await more.click()
    await control.wait_for(state='visible')


async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='world-input-recovery-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width': 390, 'height': 700}, has_touch=True, service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(80):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    for world in args.world or ['muzikaz-airport', 'world-district-neon-docks']:
                        manifest_response = await context.request.get(base + '/api/environments/' + world)
                        assert manifest_response.ok, (world, manifest_response.status)
                        manifest = await manifest_response.json()
                        environment = manifest.get('data', manifest)
                        assert environment['id'] == world
                        if world == 'world-district-neon-docks':
                            assert environment['builderScene']['layoutMeta'].get('harbor'), 'Test must load the actual marina district.'
                            assert any(item.get('modelId') == 'harbor-skiff' for item in environment['builderScene']['objects']), 'Marina must contain a boardable launch.'
                        page = await context.new_page()
                        page.set_default_timeout(30000)
                        errors, inputs = [], []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        def record_input(request):
                            if request.method == 'POST' and '/gameplay' in request.url:
                                body = request.post_data_json or {}
                                if body.get('action') == 'input':
                                    inputs.append(body.get('input', {}))
                        page.on('request', record_input)
                        await page.route('https://**/*', lambda route: route.abort())
                        await page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                        await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && window.MuzikazHouseExplorer.snapshot().serverReady', timeout=120000)

                        async def walk_from_focused_control(label, key='w'):
                            inputs.clear()
                            start = await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
                            await page.keyboard.down(key)
                            await page.wait_for_timeout(1800)
                            await page.keyboard.up(key)
                            await page.wait_for_timeout(200)
                            end = await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
                            assert any(abs(value.get('forward', 0)) > .5 for value in inputs), (world, label, 'focused control swallowed movement')
                            assert ((end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2) ** .5 > .3, (world, label, start, end)

                        # Choosing a local quest leaves the native selector
                        # focused. Arrows keep editing it; WASD resumes walking
                        # directly, without an extra click on the game canvas.
                        quest_select = page.get_by_label('Choose local challenge', exact=True)
                        await quest_select.focus()
                        await page.keyboard.press('ArrowDown')
                        assert await page.evaluate('document.activeElement?.matches(".map-quest-card select")'), (world, 'Quest selector lost keyboard selection.')
                        await walk_from_focused_control('quest selector', 's')
                        assert await page.evaluate('document.activeElement?.id === "house-explorer-canvas"'), (world, 'Quest selection did not return movement focus.')

                        # Closing a resident conversation deliberately restores focus
                        # to its toggle. Movement must work without clicking the canvas.
                        residents = page.get_by_role('button', name='Residents, conversations and daily objectives', exact=True)
                        await reveal_view_control(page, residents)
                        await residents.click()
                        assert not (await snapshot_state(page))['player']['inputBlocked'], 'Open people panel locked gameplay.'
                        await walk_from_focused_control('open residents')
                        inputs.clear()
                        await page.evaluate('window.openPanelJump=[];window.recordPanelJump=setInterval(()=>openPanelJump.push(MuzikazHouseExplorer.snapshot().player.position[1]),20)')
                        await page.keyboard.down('Space');await page.wait_for_timeout(220);await page.keyboard.up('Space');await page.wait_for_timeout(1200)
                        heights=await page.evaluate('()=>{clearInterval(recordPanelJump);return openPanelJump;}')
                        assert any(value.get('jump') for value in inputs), 'People panel swallowed jump input.'
                        assert heights and max(heights)-min(heights)>.2, 'People panel stopped the visible jump.'
                        assert not await page.locator('#house-explorer-canvas').evaluate('canvas=>!!canvas.closest("[inert]")')
                        await page.locator('.district-map-toggle').click()
                        await page.locator('.district-map-dialog').get_by_role('button',name='Close',exact=True).click()
                        close_residents = page.get_by_role('button', name='Close resident conversations', exact=True)
                        await reveal_view_control(page, close_residents)
                        await close_residents.click()
                        await walk_from_focused_control('residents')

                        radio = page.get_by_role('button', name='Crew radio and vehicle quests', exact=True)
                        await reveal_view_control(page, radio)
                        # The open More menu must not cover the companion's Close
                        # button, including when radio itself fits in the top row.
                        more = page.get_by_role('button', name='More view controls', exact=True)
                        if await more.is_visible() and await more.get_attribute('aria-expanded') != 'true':
                            await more.click()
                        await radio.click()
                        await walk_from_focused_control('open crew radio', 's')
                        close_radio = page.get_by_role('button', name='Close crew radio', exact=True)
                        await reveal_view_control(page, close_radio)
                        await close_radio.click()
                        await walk_from_focused_control('radio', 's')

                        mini = page.locator('.live-local-map [data-collapse]')
                        await mini.click()
                        await mini.click()
                        await walk_from_focused_control('collapsed live map')

                        # Record the actual rendered jump arc as well as the input
                        # edge: a successful HTTP request alone would miss a freeze.
                        inputs.clear()
                        await page.evaluate('''() => {
                            window.jumpHeights = [];
                            window.recordJump = true;
                            const sample = () => {
                                if (!window.recordJump) return;
                                jumpHeights.push(MuzikazHouseExplorer.snapshot().player.position[1]);
                                requestAnimationFrame(sample);
                            };
                            requestAnimationFrame(sample);
                        }''')
                        await page.keyboard.down('Space')
                        await page.wait_for_timeout(220)
                        await page.keyboard.up('Space')
                        await page.wait_for_timeout(1200)
                        heights = await page.evaluate('() => { recordJump = false; return jumpHeights; }')
                        assert any(value.get('jump') for value in inputs), (world, 'focused map swallowed jump')
                        assert heights and max(heights) - min(heights) > .2, (world, 'no visible jump', heights)

                        # A clean transport world must still allow ordinary tools.
                        fire = page.locator('.rad-tox-fire-trigger')
                        await fire.wait_for(state='visible')
                        async with page.expect_response(lambda response: '/gameplay' in response.url and response.request.method == 'POST' and response.request.post_data_json.get('action') == 'fire') as pending:
                            await fire.click()
                        response = await pending.value
                        assert response.ok, (world, 'fire rejected', response.status, await response.text())

                        # Board a real authoritative vehicle through the map and
                        # leave it through the scene's controls, then resume walking.
                        await page.locator('.district-map-toggle').evaluate('(button) => button.click()')
                        await page.get_by_role('button', name='Vehicles', exact=True).click()
                        craft = page.locator('[data-craft-choices] button[data-name*="Diamond"]') if world == 'muzikaz-airport' else page.locator('[data-craft-choices] button[data-name="Neon Launch"]')
                        async with page.expect_response(lambda reply: '/gameplay' in reply.url and reply.request.method == 'POST' and (reply.request.post_data_json or {}).get('action') == 'map-access') as boarded:
                            await craft.first.click()
                        response = await boarded.value
                        assert response.ok, (world, 'boarding rejected', response.status)
                        payload = await response.json()
                        state = payload.get('data', payload)
                        assert state.get('players', {}).get(state.get('selfId'), {}).get('vehicleId'), (world, 'boarding was not authoritative')
                        dialog = page.locator('.district-map-dialog')
                        await dialog.wait_for(state='hidden')
                        assert await page.locator('.district-map-toggle').is_enabled(), 'Boarding must expose controls and keep the map available.'
                        functions_name = 'Show flight controls' if world == 'muzikaz-airport' else 'Show boat functions'
                        functions = page.get_by_role('button', name=functions_name, exact=True)
                        await reveal_view_control(page, functions)
                        await functions.click()
                        exit_vehicle = page.get_by_role('button', name='Exit parked aircraft', exact=True) if world == 'muzikaz-airport' else page.get_by_role('button', name='Leave stopped boat', exact=True)
                        await exit_vehicle.wait_for(state='visible')
                        await exit_vehicle.click()
                        await exit_vehicle.wait_for(state='hidden')
                        if world == 'world-district-neon-docks':
                            # Walk-up touch boarding must not be undone by a delayed compatibility click.
                            nearby = page.locator('.builder-nearby-action:not(.builder-portal-action)')
                            await nearby.wait_for(state='visible')
                            await page.wait_for_timeout(250)
                            print('Docks walk-up action: '+str(await nearby.get_attribute('aria-label')),flush=True)
                            async with page.expect_response(lambda reply: '/gameplay' in reply.url and reply.request.method=='POST' and (reply.request.post_data_json or {}).get('action')=='interact') as tapped:
                                await nearby.tap()
                            result=await (await tapped.value).json()
                            print('Docks tap result: '+str(result.get('data',result).get('result')),flush=True)
                            assert (await tapped.value).ok
                            await page.wait_for_function('MuzikazHouseExplorer.snapshot().vehicleActive')
                            await page.wait_for_timeout(600)
                            await nearby.dispatch_event('click',{'detail':1})
                            await page.wait_for_timeout(150)
                            assert (await page.evaluate('MuzikazHouseExplorer.snapshot()'))['vehicleActive'], 'Delayed touch click undid dock boarding.'
                            if not await exit_vehicle.is_visible():
                                functions = page.get_by_role('button', name='Show boat functions', exact=True)
                                await reveal_view_control(page, functions)
                                await functions.click()
                            await exit_vehicle.click()
                            await exit_vehicle.wait_for(state='hidden')
                        await page.locator('#house-explorer-canvas').focus()
                        await walk_from_focused_control('vehicle exit')
                        assert not errors, (world, errors)
                        print(world + ': movement after residents/radio/map, visible jumping, shared firing, boarding and exit passed.', flush=True)
                        await page.close()
                    await browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)


parser=argparse.ArgumentParser()
parser.add_argument('--world',action='append',choices=['muzikaz-airport','world-district-neon-docks'])
args=parser.parse_args()
asyncio.run(main())
