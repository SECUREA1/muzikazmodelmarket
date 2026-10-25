"""Exercise the public map directory with startup, keyboard and sustained touch.

Unlike a list of hand-picked IDs, the default run enumerates every public world
served by /api/environments. --world can narrow a debugging run; its summary
always reports the selected and available counts separately.
"""
from pathlib import Path
import argparse
import asyncio
import json
import math
import os
import re
import socket
import subprocess
import tempfile
import time
from urllib.parse import quote
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
# One 8s request deadline, 1s reconnect backoff, proof refresh and retry.
HELD_INPUT_ACK_SECONDS = 20

INPUT_TRACE = '''(() => {
    window.worldInputTrace={pointers:[],intersections:[],probes:[],statuses:[],longTasks:[],eventLoop:[],frames:0,lastFrame:null};
    const trace=worldInputTrace,keep=(list,value)=>{list.push(value);if(list.length>100)list.shift();};
    const frame=at=>{trace.frames++;trace.lastFrame=at;requestAnimationFrame(frame);};requestAnimationFrame(frame);
    try{new PerformanceObserver(list=>{for(const entry of list.getEntries())keep(trace.longTasks,{at:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});}catch{}
    let tickAt=performance.now(),lastStatus='';setInterval(()=>{
        const at=performance.now();if(at-tickAt>750)keep(trace.eventLoop,{at,gap:at-tickAt});tickAt=at;
        const status=document.querySelector('#house-status,#status')?.textContent,connection=document.querySelector('.game-live-connection')?.textContent,key=JSON.stringify([status,connection]);
        if(key!==lastStatus){lastStatus=key;keep(trace.statuses,{at,status,connection});}
    },250);
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])
        window.addEventListener(type,event=>queueMicrotask(()=>keep(trace.pointers,{type,at:performance.now(),id:event.pointerId,primary:event.isPrimary,pointerType:event.pointerType,x:event.clientX,y:event.clientY,prevented:event.defaultPrevented,target:event.target?.outerHTML?.slice(0,180)})),true);
    const NativeObserver=window.IntersectionObserver;
    if(NativeObserver)window.IntersectionObserver=class extends NativeObserver{
        constructor(callback,options){super((entries,observer)=>{for(const entry of entries)if(entry.target.matches('.house-stage'))keep(trace.intersections,{at:performance.now(),intersecting:entry.isIntersecting,ratio:entry.intersectionRatio});callback(entries,observer);},options);}
    };
})();'''


def distance(a, b):
    return math.hypot(a[0] - b[0], a[2] - b[2])


def json_safe(value):
    # Browser snapshots use Infinity for untimed rounds. Keep report artifacts
    # valid for strict JSON consumers while retaining the unbounded/null meaning.
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    return value


async def position(page, kind):
    if kind == 'hockey':
        return await page.evaluate('() => {const p=MuzikazHockey.snapshot().player;return p?[p.x,0,p.z]:null;}')
    if kind == 'arcade':
        return await page.evaluate('NeonJunction.snapshot().playerPosition')
    return await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')


async def touch_move(page, cdp, dx=0, dy=-.85, duration=1400, *, responses=None, response_start=0):
    stick = page.locator('[data-thumbstick="left"] .thumbstick-base').first
    await stick.wait_for(state='visible', timeout=30000)
    # These controls are fixed in the gameplay viewport. Scrolling them into
    # view would conceal an offscreen startup control, and waits for compositor
    # stability on every gesture despite the explicit hit test below.
    box = await stick.bounding_box()
    assert box and box['width'] > 0 and box['height'] > 0, 'Movement stick is outside the viewport.'
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    hit = await stick.evaluate('(stick, point) => {const target=document.elementFromPoint(point.x,point.y);return {hit:!!target&&stick.contains(target),target:target?.outerHTML.slice(0,180),width:innerWidth,height:innerHeight,viewport:{scale:visualViewport?.scale,top:visualViewport?.offsetTop,left:visualViewport?.offsetLeft}};}', {'x': x, 'y': y})
    assert hit['hit'], ('Touch target is covered or outside the viewport.', box, hit)
    target = {'x': x + dx * box['width'] * .4, 'y': y + dy * box['height'] * .4, 'id': 1}
    # Hold the visible direction without an initial center-to-edge drag.
    # A floating touch origin used to keep this entire gesture neutral.
    held_at = time.monotonic()
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [target]})
    try:
        await page.wait_for_timeout(duration)
        if responses is not None:
            # A release deliberately supersedes an older press. Verify the
            # currently held intent before releasing, even on a slow link.
            axis, sign = ('side', dx) if dx else ('forward', -dy)
            accepted = await wait_for_applied_input(responses, response_start, expected_axis=axis, expected_sign=sign, timeout=max(0, HELD_INPUT_ACK_SECONDS-(time.monotonic()-held_at)))
            assert accepted, 'The server did not apply the current touch input within the bounded hold.'
        await stick.evaluate('''(stick, direction) => {
            const stage=document.querySelector('.house-stage'),r=stage?.getBoundingClientRect();
            worldInputTrace.probes.push({at:performance.now(),direction,active:stick.classList.contains('is-active'),knob:stick.querySelector('.thumbstick-knob')?.style.transform,hidden:document.hidden,focus:document.activeElement?.id,frames:worldInputTrace.frames,lastFrame:worldInputTrace.lastFrame,stage:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,state:window.MuzikazHouseExplorer?.snapshot()});
        }''', [dx, dy])
    finally:
        held_ms = round((time.monotonic()-held_at)*1000)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await page.wait_for_timeout(150)
    assert not await stick.evaluate('node => node.classList.contains("is-active")'), 'Touch controls remained held after the finger lifted.'
    return held_ms


async def wait_for_applied_input(responses, start, *, right_only=False, expected_axis=None, expected_sign=1, timeout=12):
    # The response listener may still be reading a large scene snapshot after
    # the gesture ends. Await an actual matching acknowledgement, with a bound,
    # instead of mistaking slow SwiftShader/JSON work for rejected controls.
    deadline = time.monotonic() + timeout
    while True:
        for entry in responses[start:]:
            if entry['action'] != 'input' or not entry['ok']:
                continue
            sent = entry['request'].get('input', {})
            state = entry['state']
            if entry['request'].get('inputEpoch') and entry['request']['inputEpoch'] != state.get('inputEpoch'):
                continue
            applied = state.get('players', {}).get(state.get('selfId'), {}).get('input', {})
            if expected_axis:
                if sent.get(expected_axis, 0)*expected_sign > .1 and abs(sent[expected_axis]-applied.get(expected_axis, 0)) < .001:
                    return True
            elif right_only:
                if sent.get('side', 0) > .1 and applied.get('side', 0) > .1:
                    return True
            elif any(abs(sent.get(axis, 0)) > .1 and abs(sent.get(axis, 0) - applied.get(axis, 0)) < .001 for axis in ['side', 'forward']):
                return True
        if time.monotonic() >= deadline:
            break
        await asyncio.sleep(.05)
    return False


async def exercise_world(context, environment, base, hold_ms, mode, skip_map_travel):
    world_id = environment['id']
    kind = 'hockey' if environment.get('game') == 'hockey' else 'arcade' if environment.get('game') == 'arcade' else 'house'
    page = await context.new_page()
    page.set_default_timeout(15000)
    await page.add_init_script(INPUT_TRACE)
    errors, commands, responses, request_failures, network = [], [], [], [], []
    pending_requests, request_entries = {}, {}
    def record_error(error):
        errors.append(error.stack or str(error))
        print(json.dumps({'worldError': world_id, 'error': errors[-1]}), flush=True)
    page.on('pageerror', record_error)

    def phase(name):
        print(json.dumps({'worldPhase': world_id, 'phase': name, 'elapsedSeconds': round(time.monotonic()-started, 2)}), flush=True)

    def record_request(request):
        if '/api/' in request.url and ('/gameplay' in request.url or '/api/game/room-session' in request.url):
            body = (request.post_data_json or {}) if request.method == 'POST' else {}
            entry = {'atMs':round((time.monotonic()-started)*1000), 'path':request.url.removeprefix(base), 'method':request.method, 'action':body.get('action'), 'requestId':body.get('requestId'), 'inputSequence':body.get('inputSequence')}
            pending_requests[request] = entry
            request_entries[request] = entry
            network.append({'phase':'request', **entry})
        if request.method == 'POST' and '/gameplay' in request.url:
            commands.append(request.post_data_json or {})

    async def record_response(response):
        request = response.request
        entry = request_entries.get(request)
        if entry:
            entry['status'] = response.status
            network.append({'phase':'headers', **entry, 'status':response.status, 'elapsedMs':round((time.monotonic()-started)*1000-entry['atMs'])})
        if response.request.method == 'POST' and '/gameplay' in response.url:
            try:
                body = await response.json()
                state = body.get('data', body)
                responses.append({'ok': response.ok, 'status': response.status, 'error': body.get('error'), 'code':body.get('code'), 'message':body.get('message'), 'action': (response.request.post_data_json or {}).get('action'), 'request': response.request.post_data_json or {}, 'state': state})
                if entry:
                    network.append({'phase':'body-read', **entry, 'status':response.status, 'code':body.get('code'), 'message':body.get('message'), 'elapsedMs':round((time.monotonic()-started)*1000-entry['atMs'])})
            except Exception as error:
                if entry:
                    network.append({'phase':'body-read-failed', **entry, 'elapsedMs':round((time.monotonic()-started)*1000-entry['atMs']), 'error':str(error)})

    def record_finished(request):
        entry = pending_requests.pop(request, None)
        if entry:
            network.append({'phase':'finished', **entry, 'elapsedMs':round((time.monotonic()-started)*1000-entry['atMs']), 'timing':request.timing})

    def record_failed(request):
        entry = pending_requests.pop(request, None)
        if entry:
            failure = {'phase':'failed', **entry, 'elapsedMs':round((time.monotonic()-started)*1000-entry['atMs']), 'error':request.failure, 'timing':request.timing}
            network.append(failure)
            request_failures.append(failure)

    page.on('request', record_request)
    page.on('response', record_response)
    page.on('requestfinished', record_finished)
    page.on('requestfailed', record_failed)
    await page.route('https://**/*', lambda route: route.abort())
    # Deliberately let a neutral heartbeat overtake map travel. The map command
    # has already executed on the server while its HTTP response is held here.
    async def delayed_map_reply(route):
        body = route.request.post_data_json or {}
        if body.get('action') == 'map-access':
            response = await route.fetch()
            await asyncio.sleep(.65)
            await route.fulfill(response=response)
        else:
            await route.continue_()
    if not skip_map_travel:
        await page.route('**/api/rooms/*/gameplay', delayed_map_reply)
    report = {'rasterScale': await page.evaluate('devicePixelRatio'), 'id': world_id, 'name': environment.get('name'), 'kind': kind, 'mode': mode, 'mapTravelTested': not skip_map_travel, 'passed': False}
    started = time.monotonic()
    try:
        native_page = 'hockey.html' if kind == 'hockey' else 'arcade.html' if kind == 'arcade' else 'model-explorer.html'
        await page.goto(base + '/' + native_page + '?environment=' + quote(world_id) + '&autoplay=1&mode=' + mode, wait_until='domcontentloaded', timeout=90000)
        phase('page-loaded')
        if kind == 'hockey':
            await page.wait_for_function('window.MuzikazHockey?.snapshot().ready', timeout=90000)
            await page.locator('#start').evaluate('(button) => button.click()')
            await page.wait_for_function('MuzikazHockey.snapshot().running && MuzikazHockey.snapshot().player', timeout=30000)
        elif kind == 'arcade':
            await page.wait_for_function('window.NeonJunction?.ready', timeout=90000)
        else:
            await page.wait_for_function('() => {const s=window.MuzikazHouseExplorer?.snapshot();return s?.gameplayStarted&&s.controlsReady&&(!s.serverHostedRoom||s.serverReady)&&s.roomId===' + json.dumps(world_id) + ';}', timeout=90000)
            startup = await page.evaluate('MuzikazHouseExplorer.snapshot()')
            assert not startup['player']['inputBlocked'], 'Startup left a blocking gameplay overlay.'
            report['serverHosted'] = startup['serverHostedRoom']
        hosted_house = kind == 'house' and report['serverHosted']
        phase('game-ready')
        # Probe the page exactly as the user receives it. Closing all dialogs or
        # focusing the canvas here would conceal startup overlays and focus bugs.
        cdp = await context.new_cdp_session(page)
        positions = [await position(page, kind)]
        phase_started = time.monotonic()

        touch_directions = []
        for dx, dy in [(0, -.85), (0, .85), (.85, 0), (-.85, 0)]:
            await touch_move(page, cdp, dx, dy, hold_ms)
            positions.append(await position(page, kind))
            touch_directions.append([dx, dy])
            if skip_map_travel and max(distance(a, b) for a in positions for b in positions) > .15:
                break

        initial_progress = max(distance(a, b) for a in positions for b in positions)
        report['initialTouchDisplacement'] = round(initial_progress, 3)
        report['touchDirections'] = touch_directions
        assert initial_progress > .15, 'No rendered touch movement at startup.'
        phase('initial-touch-passed')

        keyboard_positions = [await position(page, kind)]
        keyboard_keys = []
        for key in ['w', 's', 'a', 'd']:
            await page.keyboard.down(key)
            try:
                await page.wait_for_timeout(hold_ms)
                keyboard_positions.append(await position(page, kind))
            finally:
                await page.keyboard.up(key)
            keyboard_keys.append(key)
            if skip_map_travel and max(distance(a, b) for a in keyboard_positions for b in keyboard_positions) > .15:
                break
        keyboard_progress = max(distance(a, b) for a in keyboard_positions for b in keyboard_positions)
        assert keyboard_progress > .15, 'No rendered keyboard movement after initial touch.'
        report['keyboardDisplacement'] = round(keyboard_progress, 3)
        report['keyboardKeys'] = keyboard_keys
        phase('keyboard-passed')

        if hosted_house and not skip_map_travel:
            # Touch-open and collapse the mini map while preserving control use.
            mini = page.locator('.live-local-map [data-collapse]')
            await mini.tap()
            await mini.tap()
            before = len(commands)
            await touch_move(page, cdp, 0, -.85, hold_ms)
            assert any(abs(command.get('input', {}).get('forward', 0)) > .1 for command in commands[before:] if command.get('action') == 'input'), 'Touch movement vanished after mini-map collapse.'
            positions.append(await position(page, kind))

            # Use the actual map directory button and authored arrival entry.
            await page.locator('.district-map-toggle').tap()
            dialog = page.locator('.district-map-dialog')
            await dialog.wait_for(state='visible')
            await dialog.get_by_role('button', name='2D plan', exact=True).tap()
            port = dialog.get_by_role('button', name=re.compile(r'^Port to '), include_hidden=True).first
            await port.evaluate('(button) => {for(let details=button.closest("details");details;details=details.parentElement.closest("details")) details.open=true;}')
            async with page.expect_response(lambda reply: reply.request.method == 'POST' and '/gameplay' in reply.url and (reply.request.post_data_json or {}).get('action') == 'map-access') as travelled:
                await port.tap()
            assert (await travelled.value).ok, 'Map travel was rejected.'
            assert await dialog.is_visible(), 'Map travel must keep its directory open.'
            await dialog.get_by_role('button', name='Close', exact=True).tap()
            await dialog.wait_for(state='hidden', timeout=30000)
            await page.wait_for_timeout(250)
            before = len(commands)
            response_before = len(responses)
            await touch_move(page, cdp, .85, 0, hold_ms)
            phase_commands = [command for command in commands[before:] if command.get('action') == 'input' and abs(command.get('input', {}).get('side', 0)) > .1]
            assert phase_commands, 'Touch movement vanished after map travel.'
            await page.wait_for_timeout(350)
            # A stale epoch can leave rendering alive while the server silently
            # rejects every control. Confirm actual applied input, not HTTP 200.
            assert await wait_for_applied_input(responses, response_before, right_only=True), 'The server did not apply side movement after map travel.'
            positions.append(await position(page, kind))
            report['mapTravel'] = True
            report['inputRequests'] = len([command for command in commands if command.get('action') == 'input'])
            # Input requests time out at eight seconds and reconnect after one.
            # Allow that bounded recovery before calling a busy room disconnected.
            await page.wait_for_function('MuzikazHouseExplorer.snapshot().serverReady',timeout=12000)
            state = await page.evaluate('MuzikazHouseExplorer.snapshot()')
            assert state['serverReady'] and state['gameplayStarted'], 'The live room disconnected during sustained controls.'
            report['health'] = state['health']
            phase('map-travel-passed')
        elif kind == 'house' and not skip_map_travel:
            await page.locator('.district-map-toggle').tap()
            dialog = page.locator('.district-map-dialog')
            await dialog.wait_for(state='visible')
            assert not (await page.evaluate('MuzikazHouseExplorer.snapshot()'))['player']['inputBlocked'], 'Solo map blocked gameplay.'
            await touch_move(page, cdp, .85, 0, hold_ms)
            positions.append(await position(page, kind))
            await dialog.get_by_role('button', name='Close', exact=True).tap()
            report['mapStayedPlayable'] = True
        elif kind != 'house' and not skip_map_travel:
            # Native pages have their own input pumps and menus, not house maps.
            for dx, dy in [(0, -.85), (.85, 0)]:
                await touch_move(page, cdp, dx, dy, hold_ms)
                positions.append(await position(page, kind))

        # Keep the room active past its old 15 second expiry window. New touch
        # gestures, rather than a single held key, must remain accepted afterward.
        remaining = 16.5 - (time.monotonic() - phase_started)
        if remaining > 0:
            await page.wait_for_timeout(remaining * 1000)
        final_start = await position(page, kind)
        response_before = len(responses)
        commands_before = len(commands)
        final_holds = []
        final_hold = await touch_move(page, cdp, -.85, 0, hold_ms, responses=responses if hosted_house else None, response_start=response_before)
        final_holds.append({'direction':[-.85, 0], 'heldMilliseconds':final_hold})
        positions.append(await position(page, kind))
        final_progress = distance(final_start, positions[-1])
        for dx, dy in [(.85, 0), (0, -.85), (0, .85)]:
            if final_progress > .03:
                break
            final_hold = await touch_move(page, cdp, dx, dy, hold_ms, responses=responses if hosted_house else None, response_start=len(responses))
            final_holds.append({'direction':[dx, dy], 'heldMilliseconds':final_hold})
            positions.append(await position(page, kind))
            final_progress = distance(final_start, positions[-1])
        assert final_progress > .03, 'Rendered movement stopped after the sustained interval.'
        report['finalTouchDisplacement'] = round(final_progress, 3)
        report['finalTouchHolds'] = final_holds
        if hosted_house:
            await page.wait_for_function('MuzikazHouseExplorer.snapshot().serverReady',timeout=12000)
            final = await page.evaluate('MuzikazHouseExplorer.snapshot()')
            assert final['serverReady'] and final['gameplayStarted'], 'The live room disconnected after the sustained interval.'
            assert any(command.get('action') == 'input' and any(abs(command.get('input', {}).get(axis, 0)) > .1 for axis in ['side', 'forward']) for command in commands[commands_before:]), 'Fresh touch input stopped after the sustained interval.'
            assert await wait_for_applied_input(responses, response_before), 'The server stopped applying touch input after the sustained interval.'
        assert positions and all(p and all(math.isfinite(v) for v in p) for p in positions), 'Player position became invalid.'
        travel = max(distance(a, b) for a in positions for b in positions)
        assert travel > .15, 'No rendered walking/skating progress in any tested direction.'
        report['touchProbes'] = await page.evaluate('worldInputTrace.probes.map(p=>({direction:p.direction,active:p.active,knob:p.knob,hidden:p.hidden,frames:p.frames,stage:p.stage,serverReady:p.state?.serverReady,controlsReady:p.state?.controlsReady,inputBlocked:p.state?.player?.inputBlocked,position:p.state?.player?.position}))')
        report['networkHealth'] = {
            'requests':sum(row['phase']=='request' for row in network),
            'failedRequests':len(request_failures),
            'maximumHeaderLatencyMs':max((row['elapsedMs'] for row in network if row['phase']=='headers'), default=0),
            'maximumRequestDurationMs':max((row['elapsedMs'] for row in network if row['phase']=='finished'), default=0),
            'roomSessions':[{'status':row.get('status'), 'durationMs':row['elapsedMs']} for row in network if row['phase']=='finished' and '/api/game/room-session' in row['path']],
        }
        if request_failures:
            report['requestFailures'] = request_failures[-20:]
            report['network'] = network[-500:]
        assert not errors, errors
        report.update({'passed': True, 'maximumDisplacement': round(travel, 3), 'samples': len(positions)})
    except Exception as error:
        report['error'] = str(error)
        report['pageErrors'] = errors
        report['recentCommands'] = commands[-20:]
        report['requestFailures'] = request_failures[-20:]
        report['network'] = network[-500:]
        report['pendingRequests'] = list(pending_requests.values())
        report['recentInputs'] = [{'request':row['request'], 'ok':row['ok'], 'status':row['status'], 'error':row['error'], 'code':row['code'], 'message':row['message'], 'result':row['state'].get('result'), 'inputEpoch':row['state'].get('inputEpoch'), 'applied':row['state'].get('players',{}).get(row['state'].get('selfId'),{}).get('input')} for row in responses[-12:]]
        phase('failed: ' + str(error))
        try:
            await page.screenshot(path='/tmp/world-input-failed-' + re.sub(r'[^a-zA-Z0-9_-]', '_', world_id) + '.png')
        except Exception:
            pass
        try:
            report['diagnostic'] = await page.evaluate('({url:location.href,status:document.querySelector("#house-status,#status,[data-house-status]")?.textContent,loader:document.querySelector("[data-level-loader-message]")?.textContent,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.className),trace:window.worldInputTrace,state:window.MuzikazHouseExplorer?.snapshot()||window.MuzikazHockey?.snapshot()||window.NeonJunction?.snapshot()})')
        except Exception:
            pass
    finally:
        report['elapsedSeconds'] = round(time.monotonic() - started, 2)
        await page.close()
    return json_safe(report)


async def main(args):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='all-world-input-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width': 390, 'height': 700}, has_touch=True, is_mobile=True, device_scale_factor=1, service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(100):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.15)
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    manifest = (await (await context.request.get(base + '/api/environments')).json())['data']
                    available = [world for world in manifest if world.get('playable') is not False and world.get('visibility') != 'private']
                    selected = [world for world in available if not args.world or world['id'] in args.world]
                    selected.sort(key=lambda world: world['id'] != 'muzikaz-airport')
                    assert selected, 'No selected worlds exist in the public directory.'
                    if args.world:
                        assert set(args.world) == {world['id'] for world in selected}, 'One or more requested worlds are absent.'
                    print(json.dumps({'availableWorlds': len(available), 'selectedWorlds': len(selected)}), flush=True)
                    results = []
                    semaphore = asyncio.Semaphore(args.jobs)
                    async def check_world(world):
                        async with semaphore:
                            print(json.dumps({'testingWorld': world['id'], 'mode': args.mode}), flush=True)
                            isolated = await browser.new_context(viewport={'width':390,'height':700},has_touch=True,is_mobile=True,device_scale_factor=args.device_scale,service_workers='block',reduced_motion='reduce')
                            try:
                                assert (await isolated.request.post(base+'/api/access/guest',data={})).status == 201
                                result = await exercise_world(isolated, world, base, args.hold_ms, args.mode, args.skip_map_travel)
                            finally:
                                await isolated.close()
                        return result
                    tasks = [asyncio.create_task(check_world(world)) for world in selected]
                    for pending in asyncio.as_completed(tasks):
                        result = await pending
                        results.append(result)
                        print(json.dumps(result, allow_nan=False), flush=True)
                        Path(args.report).write_text(json.dumps({'availableWorlds': len(available), 'selectedWorlds': len(selected), 'results': results}, indent=2, allow_nan=False))
                    await browser.close()
                    failed = [result['id'] for result in results if not result['passed']]
                    print(json.dumps({'testedWorlds': len(results), 'passedWorlds': len(results) - len(failed), 'failedWorlds': failed}), flush=True)
                    assert not failed, 'World input regressions: ' + ', '.join(failed)
            finally:
                server.terminate()
                server.wait(timeout=15)


parser = argparse.ArgumentParser()
parser.add_argument('--world', action='append', help='Debug only this exact public world ID; repeat for several.')
parser.add_argument('--jobs', type=int, choices=range(1,5), default=1, help='Concurrent isolated world pages (1–4).')
parser.add_argument('--device-scale', type=float, default=1, help='Raster scale; CSS touch targets and movement checks are unchanged.')
parser.add_argument('--hold-ms', type=int, default=1400)
parser.add_argument('--mode', choices=['multiplayer', 'solo'], default='multiplayer')
parser.add_argument('--skip-map-travel', action='store_true', help='Probe startup, keyboard, touch and sustained movement; use focused suites for map travel.')
parser.add_argument('--report', default='/tmp/all-world-input-results.json')
asyncio.run(main(parser.parse_args()))
