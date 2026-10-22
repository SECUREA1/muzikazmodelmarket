"""Sustained real touch input and recovery from interrupted mobile gestures.

Chromium emulates an iPhone viewport and receives CDP touch input. Discarded
terminal events simulate an OS/browser suspension; this is not a WebKit test.
"""
from pathlib import Path
import asyncio, os, shutil, socket, subprocess, tempfile
from playwright.async_api import async_playwright

os.chdir(Path(__file__).resolve().parents[1])


async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='mobile-touch-recovery-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(**p.devices['iPhone 13'], service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(80):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    for world in os.environ.get('MUZIKAZ_TEST_WORLDS', 'muzikaz-airport,world-district-neon-docks').split(','):
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
                        await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && MuzikazHouseExplorer.snapshot().serverReady', timeout=120000)
                        assert await page.evaluate('MuzikazHouseExplorer.snapshot().roomId') == world
                        # The room handshake completes before the first large
                        # scene finishes shader compilation in software WebGL.
                        await page.wait_for_timeout(1500)
                        await page.evaluate('''async () => {
                            await new Promise(requestAnimationFrame);
                            await new Promise(requestAnimationFrame);
                            window.touchFrameCount=0;
                            const sample=()=>{touchFrameCount++;requestAnimationFrame(sample);};
                            requestAnimationFrame(sample);
                        }''')
                        cdp = await context.new_cdp_session(page)
                        touch_id = 0

                        async def center(name):
                            stick = page.locator('[data-thumbstick="' + name + '"] .thumbstick-base')
                            # Overlay taps may scroll the document to its corner
                            # buttons. CDP does not scroll an offscreen touch target.
                            await stick.scroll_into_view_if_needed()
                            box = await stick.bounding_box()
                            assert box and box['width'] > 0, (world, name, 'controller missing')
                            viewport = await page.evaluate('({width:innerWidth,height:innerHeight,scrollY})')
                            assert 0 <= box['x'] + box['width'] / 2 <= viewport['width'] and 0 <= box['y'] + box['height'] / 2 <= viewport['height'], (world, name, 'controller outside viewport', box, viewport)
                            assert await stick.evaluate('(node)=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return node===hit||node.contains(hit); }'), (world, name, 'controller touch intercepted')
                            return box['x'] + box['width'] / 2, box['y'] + box['height'] / 2

                        async def touch(kind, points):
                            await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})

                        async def begin(names=('left',), reverse=False):
                            nonlocal touch_id
                            points = []
                            for name in names:
                                touch_id += 1
                                x, y = await center(name)
                                points.append({'id': touch_id, 'x': x, 'y': y})
                            await touch('touchStart', points)
                            moved = [{**point, 'y': point['y'] + (23 if reverse else -23)} if name == 'left' else {**point, 'x': point['x'] + (-10 if reverse else 10)} for name, point in zip(names, points)]
                            await touch('touchMove', moved)
                            return moved

                        async def drag(label, reverse=False, dual=False):
                            inputs.clear()
                            start = await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
                            yaw = await page.evaluate('MuzikazHouseExplorer.snapshot().player.yaw')
                            await begin(('left', 'right') if dual else ('left',), reverse)
                            await page.wait_for_timeout(650)
                            await touch('touchEnd', [])
                            await page.wait_for_timeout(120)
                            end = await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
                            diagnostic = await page.evaluate('''() => ({state:MuzikazHouseExplorer.snapshot(),frames:touchFrameCount,status:document.querySelector('[data-house-status]')?.textContent,overlays:[...document.querySelectorAll('dialog[open], #crib-chat-panel:not([hidden]), .world-resident-ui:not([hidden]) .world-resident-panel:not([hidden])')].map(node=>node.className),sticks:[...document.querySelectorAll('.thumbstick-base')].map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,200)};})})''')
                            assert any(abs(value.get('forward', 0)) > .4 for value in inputs), (world, label, 'new touch was ignored', diagnostic, errors)
                            if dual:
                                turn = await page.evaluate('MuzikazHouseExplorer.snapshot().player.yaw')
                                assert abs(turn - yaw) > .01, (world, label, 'look finger was ignored')
                            # The real scene has solid buildings. If this gesture
                            # meets a wall, verify that backing away still moves.
                            if ((end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2) ** .5 <= .1:
                                await begin(reverse=not reverse)
                                await page.wait_for_timeout(650)
                                await touch('touchEnd', [])
                                await page.wait_for_timeout(120)
                                end = await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
                            diagnostic = await page.evaluate('''() => ({state:MuzikazHouseExplorer.snapshot(),frames:touchFrameCount,status:document.querySelector('[data-house-status]')?.textContent,overlays:[...document.querySelectorAll('dialog[open], #crib-chat-panel:not([hidden]), .world-resident-ui:not([hidden]) .world-resident-panel:not([hidden])')].map(node=>node.className)})''')
                            assert ((end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2) ** .5 > .1, (world, label, 'view stopped responding', start, end, diagnostic, errors)
                            assert not await page.locator('.thumbstick-base.is-active').count(), (world, label, 'release left controller captured')

                        # Repeated alternating gestures stay in a clear corridor;
                        # dual gestures exercise distinct fingers on both sticks.
                        for index in range(8):
                            await drag('sustained ' + str(index), reverse=index % 2 == 1, dual=index in (2, 3))

                        # Use actual touch taps on the overlays that used to trap
                        # keyboard focus, then continue with a new finger gesture.
                        for open_name, close_name in [
                            ('Residents, conversations and daily objectives', 'Close resident conversations'),
                            ('Crew radio and vehicle quests', 'Close crew radio'),
                        ]:
                            await page.get_by_role('button', name=open_name, exact=True).tap()
                            await page.get_by_role('button', name=close_name, exact=True).tap()
                            await drag('after ' + open_name, reverse=True)
                        mini = page.locator('.live-local-map [data-collapse]')
                        await mini.tap()
                        await mini.tap()
                        await drag('after mini map')
                        await page.locator('.district-map-toggle').tap()
                        await page.locator('.district-map-dialog').get_by_role('button', name='Close', exact=True).tap()
                        await drag('after detailed map', reverse=True)

                        async def discard_terminal_events():
                            await page.evaluate('''() => {
                                window.discardTouchEnd = event => event.stopImmediatePropagation();
                                for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
                                    window.addEventListener(type, discardTouchEnd, true);
                            }''')
                            await touch('touchEnd', [])
                            await page.wait_for_timeout(80)
                            await page.evaluate('''() => {
                                for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
                                    window.removeEventListener(type, discardTouchEnd, true);
                                delete window.discardTouchEnd;
                            }''')

                        # A browser may discard the end of a gesture. The next
                        # primary finger must recover without reloading the page.
                        await begin()
                        await discard_terminal_events()
                        await drag('after missing terminal events', reverse=True)
                        await begin(('left', 'right'))
                        await discard_terminal_events()
                        await drag('after both fingers lost terminal events', reverse=True, dual=True)

                        # Backgrounding is delivered as visibility/page lifecycle
                        # events, and need not include a window blur on mobile.
                        await begin(('left', 'right'))
                        await discard_terminal_events()
                        await page.evaluate('''() => {
                            Object.defineProperty(document, 'hidden', {configurable:true, value:true});
                            document.dispatchEvent(new Event('visibilitychange'));
                            delete document.hidden;
                            document.dispatchEvent(new Event('visibilitychange'));
                        }''')
                        assert not await page.locator('.thumbstick-base.is-active').count(), (world, 'suspension retained private pointer state')
                        await drag('after visibility suspension', reverse=True, dual=True)
                        await begin(('left', 'right'))
                        await discard_terminal_events()
                        await page.evaluate("window.dispatchEvent(new Event('pagehide'))")
                        assert not await page.locator('.thumbstick-base.is-active').count(), (world, 'pagehide retained private pointer state')
                        await drag('after pagehide', reverse=True)

                        await begin(('left', 'right'))
                        await touch('touchCancel', [])
                        await drag('after native touch cancellation', reverse=True)
                        async with page.expect_response(lambda response: '/gameplay' in response.url and response.request.method == 'POST' and response.request.post_data_json.get('action') == 'fire') as fired:
                            await page.locator('.rad-tox-fire-trigger').tap()
                        assert (await fired.value).ok, (world, 'tools stopped after interrupted gestures')
                        assert await page.evaluate('MuzikazHouseExplorer.snapshot().serverReady'), (world, 'room disconnected')
                        assert not errors, (world, errors)
                        print(world + ': sustained touch, simultaneous sticks, panels/maps, lost-release recovery, visibility, pagehide, cancellation and firing passed.', flush=True)
                        await page.close()
                    await browser.close()
            except BaseException:
                room_file = Path(directory) / 'shared-rooms.json'
                if room_file.exists():
                    shutil.copyfile(room_file, '/tmp/mobile-touch-failed-shared-rooms.json')
                raise
            finally:
                server.terminate()
                server.wait(timeout=15)


asyncio.run(main())
