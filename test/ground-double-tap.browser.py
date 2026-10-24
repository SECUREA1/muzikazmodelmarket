"""Real airport and marina ground relocation by mouse and touch."""
from pathlib import Path
import asyncio, math, os, socket, subprocess, tempfile
from playwright.async_api import async_playwright

os.chdir(Path(__file__).resolve().parents[1])

async def check_world(context, base, world):
    page = await context.new_page()
    errors, commands, replies, failed, shots = [], [], [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda request: failed.append((request.url, request.failure)) if '/gameplay' in request.url else None)
    def ground_request(request):
        return request.method == 'POST' and '/gameplay' in request.url and (request.post_data_json or {}).get('action') == 'teleport-floor'
    page.on('request', lambda request: commands.append(request.post_data_json) if ground_request(request) else None)
    page.on('request', lambda request: shots.append(request.post_data_json) if request.method == 'POST' and '/gameplay' in request.url and (request.post_data_json or {}).get('action') == 'fire' else None)
    page.on('response', lambda response: replies.append(response) if ground_request(response.request) else None)
    await page.route('https://**/*', lambda route: route.abort())
    try:
        await page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
        await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && MuzikazHouseExplorer.snapshot().serverReady', timeout=180000)
        print(world + ': ground travel ready', flush=True)
        await page.evaluate('''()=>{window.groundEvents=[];for(const type of ['pointerdown','pointerup','lostpointercapture'])document.addEventListener(type,event=>groundEvents.push({type,target:event.target.id,button:event.button,pointer:event.pointerType,primary:event.isPrimary,time:event.timeStamp,x:event.clientX,y:event.clientY}),true);}''')
        canvas = page.locator('#house-explorer-canvas')
        await canvas.focus()
        for _ in range(3):
            if await page.evaluate('MuzikazHouseExplorer.snapshot().cameraMode') == 'top-down':
                break
            await page.keyboard.press('v')
            await page.wait_for_timeout(100)
        assert await page.evaluate('MuzikazHouseExplorer.snapshot().cameraMode') == 'top-down'
        for kind in ['mouse', 'touch', 'held-touch']:
            choices = await canvas.evaluate('''canvas => {
                const r=canvas.getBoundingClientRect();
                return [[.54,.55],[.46,.55],[.54,.45],[.46,.45]].map(([a,b])=>({x:r.left+r.width*a,y:r.top+r.height*b})).filter(p=>document.elementFromPoint(p.x,p.y)===canvas);
            }''')
            assert choices, (world, kind, 'No unobstructed ground touch target.')
            if kind == 'mouse':
                point, before_shots = choices[0], len(shots)
                await page.mouse.move(point['x'], point['y'])
                await page.mouse.down()
                await page.mouse.move(point['x'] + 24, point['y'])
                await page.mouse.move(point['x'], point['y'])
                await page.mouse.up()
                await page.wait_for_timeout(300)
                assert len(shots) == before_shots, 'Dragging to look must not fire a tool.'
            arrived = False
            for point in choices:
                before, first_reply = len(commands), len(replies)
                tap = page.mouse.click if kind == 'mouse' else page.touchscreen.tap
                await tap(point['x'], point['y'])
                await page.wait_for_timeout(500)
                assert len(commands) == before, 'A single tap must not relocate the player.'
                before_double_shots = len(shots)
                if kind == 'mouse':
                    await page.mouse.dblclick(point['x'], point['y'], delay=60)
                elif kind == 'touch':
                    await tap(point['x'], point['y'])
                    await tap(point['x'], point['y'])
                else:
                    cdp = await context.new_cdp_session(page)
                    box = await page.locator('[data-thumbstick="left"] .thumbstick-base').bounding_box()
                    finger = {'id': 31, 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
                    try:
                        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [finger]})
                        finger['y'] -= box['height'] * .3
                        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [finger]})
                        second = {'id': 32, 'x': point['x'], 'y': point['y']}
                        for _ in range(2):
                            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [finger, second]})
                            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [second]})
                    finally:
                        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
                        await cdp.detach()
                await page.wait_for_timeout(500)
                # Pressing the left stick has its own normal tool action.
                assert len(shots) - before_double_shots <= (2 if kind == 'held-touch' else 1), 'The second tap leaked into tool firing.'
                if len(commands) == before:
                    diagnostic = await page.evaluate('({events:groundEvents.slice(-12),status:document.querySelector("#house-status")?.textContent,state:MuzikazHouseExplorer.snapshot()})')
                    print(world, kind, 'ground candidate not accepted', diagnostic, errors, flush=True)
                    continue
                for _ in range(300):
                    if len(replies) > first_reply:
                        break
                    await asyncio.sleep(.1)
                assert len(replies) > first_reply, (world, kind, 'No shared ground travel reply.', commands, failed, errors, await page.evaluate('({events:groundEvents.slice(-12),status:document.querySelector("#house-status")?.textContent,state:MuzikazHouseExplorer.snapshot()})'))
                assert len(commands) == before + 1, (world, kind, 'Duplicate relocation commands.')
                response = replies[-1]
                if not response.ok:
                    print(world, kind, 'ground candidate rejected', response.status, await response.text(), flush=True)
                    continue
                payload = await response.json()
                state = payload.get('data', payload)
                player, target = state['players'][state['selfId']], commands[-1]['position']
                assert math.hypot(player['position']['x'] - target['x'], player['position']['z'] - target['z']) < .03, (world, kind, target, player['position'])
                await page.wait_for_function('(target)=>{const p=MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<.12}', arg=target, timeout=15000)
                await page.wait_for_timeout(500)
                assert len(commands) == before + 1, 'A delayed compatibility click replayed travel.'
                arrived = True
                print(world + ': ' + kind + ' double tap reached the precise shared ground point', flush=True)
                break
            assert arrived, (world, kind, 'Nearby ground travel was never accepted.', errors)
        assert not errors, (world, errors)
    finally:
        await page.close()

async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='ground-double-tap-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as playwright:
                    browser = await playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(80):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    for world in ['muzikaz-airport', 'world-district-neon-docks']:
                        await check_world(context, base, world)
                    await browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)

asyncio.run(main())
