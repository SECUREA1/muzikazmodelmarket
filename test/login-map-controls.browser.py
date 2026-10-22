"""Real member login keeps map controls gated until gameplay is ready.

Uses a fresh local server and the actual username/password access dialog. The
first room join reply is held while controls are probed, then real keyboard and
CDP touch input verify recovery after the mini map and both full map views.
"""
from pathlib import Path
import argparse
import asyncio
import json
import math
import os
import socket
import subprocess
import tempfile
import time
from urllib.parse import quote

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
DEFAULT_WORLDS = ['public-commons', 'muzikaz-airport', 'world-district-neon-docks', 'muzikaz-main']


def distance(a, b):
    return math.hypot(a[0] - b[0], a[2] - b[2])


async def snapshot(page):
    return await page.evaluate('MuzikazHouseExplorer.snapshot()')


async def touch_move(page, cdp, *, dx=.85, dy=0):
    stick = page.locator('[data-thumbstick="left"] .thumbstick-base').first
    await stick.wait_for(state='visible', timeout=30000)
    await stick.scroll_into_view_if_needed()
    await page.wait_for_timeout(80)
    box = await stick.bounding_box()
    assert box and box['width'] > 0 and box['height'] > 0, 'No visible movement stick.'
    hit = await stick.evaluate('(node)=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node||node.contains(hit);}')
    assert hit, 'A map or overlay intercepts the movement stick.'
    await page.evaluate('''(box)=>{
        window.loginTouchGestures??=[];
        loginTouchGestures.push({at:performance.now(),box,viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY,scale:visualViewport?.scale,top:visualViewport?.offsetTop,left:visualViewport?.offsetLeft},before:MuzikazHouseExplorer.snapshot()});
    }''', box)
    center = {'id': 1, 'x': box['x'] + box['width']/2, 'y': box['y'] + box['height']/2}
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [center]})
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{**center, 'x': center['x']+box['width']*.4*dx, 'y': center['y']+box['height']*.4*dy}]})
    await page.evaluate('''()=>{const node=document.querySelector('[data-thumbstick="left"] .thumbstick-base');Object.assign(loginTouchGestures.at(-1),{during:{active:node.classList.contains('is-active'),knob:node.querySelector('.thumbstick-knob').style.transform,state:MuzikazHouseExplorer.snapshot()}});}''')
    await page.wait_for_timeout(1100)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await page.wait_for_timeout(180)


async def wait_for_ack(responses, start, predicate, description):
    deadline = time.monotonic()+10
    while time.monotonic() < deadline:
        for row in responses[start:]:
            if row['ok'] and predicate(row):
                return row
        await asyncio.sleep(.05)
    raise AssertionError(description)


def applied_axis(row, axis):
    sent = row['request'].get('input', {}).get(axis, 0)
    own = row['state'].get('players', {}).get(row['state'].get('selfId'), {})
    return row['request'].get('action') == 'input' and abs(sent) > .1 and abs(own.get('input', {}).get(axis, 0)-sent) < .001


async def controls_unavailable(page):
    state = await snapshot(page)
    assert not state['controlsReady'], 'Gameplay controls became ready before join completed.'
    for selector in ['.district-map-toggle', '.live-local-map', '.basketball-controls']:
        assert await page.locator(selector).is_hidden(), ('Control leaked through joining overlay.', selector)
    for selector in ['#house-outside-button', '#house-world-button', '#house-environment-select', '#house-environment-list-toggle']:
        assert await page.locator(selector).is_disabled(), ('World navigation is active during login/join.', selector)
    assert await page.locator('.district-map-dialog[open]').count() == 0


async def verify_fire(page, responses, label):
    before = len(responses)
    await page.get_by_role('button', name='Fire selected weapon', exact=True).tap()
    await wait_for_ack(responses, before, lambda row: row['request'].get('action') == 'fire' and row['state'].get('result', {}).get('firedAt') and row['state'].get('result', {}).get('direction'), label+': firing stopped after closing map.')


async def verify_inputs(page, cdp, responses, label, *, fire=True):
    async def mark(step):
        await page.evaluate('(step)=>{window.loginCheckpoints??=[];loginCheckpoints.push({step,at:performance.now(),wallTime:Date.now(),state:MuzikazHouseExplorer.snapshot()});}', label+': '+step)

    await mark('begin')
    state = await snapshot(page)
    assert state['controlsReady'] and not state['player']['inputBlocked'], (label, 'Controls remain blocked.', state)
    assert await page.locator('dialog[open]').count() == 0, (label, 'A dialog remained open.')
    phase = {'phase': label}

    # Do not focus the canvas: closing a map must leave ordinary game keys usable.
    before = len(responses)
    start = state['player']['position']
    await page.keyboard.down('w')
    await page.wait_for_timeout(1200)
    await page.keyboard.up('w')
    await page.wait_for_timeout(200)
    await wait_for_ack(responses, before, lambda row: applied_axis(row, 'forward'), label+': focused map swallowed W input.')
    end = (await snapshot(page))['player']['position']
    phase['wDisplacement'] = round(distance(start, end), 3)
    await mark('after W')

    # Record the rendered jump arc in addition to the fresh server jump edge.
    await page.wait_for_function('MuzikazHouseExplorer.snapshot().player.serverGrounded', timeout=20000)
    await page.evaluate('''() => {
        window.loginJumpHeights=[];window.loginRecordJump=true;
        const sample=()=>{if(!loginRecordJump)return;loginJumpHeights.push(MuzikazHouseExplorer.snapshot().player.position[1]);requestAnimationFrame(sample);};
        requestAnimationFrame(sample);
    }''')
    before = len(responses)
    await page.keyboard.down('Space')
    await page.wait_for_timeout(220)
    await page.keyboard.up('Space')
    await page.wait_for_timeout(1300)
    await wait_for_ack(responses, before, lambda row: row['request'].get('action') == 'input' and row['request'].get('input', {}).get('jump'), label+': map swallowed jump.')
    heights = await page.evaluate('() => {loginRecordJump=false;return loginJumpHeights;}')
    assert heights and max(heights)-min(heights) > .15, (label, 'No visible jump.', heights)
    phase['jumpArc'] = round(max(heights)-min(heights), 3)
    await mark('after jump, before touch')

    before = len(responses)
    start = (await snapshot(page))['player']['position']
    await touch_move(page, cdp)
    await wait_for_ack(responses, before, lambda row: applied_axis(row, 'side'), label+': touch input was not applied.')
    end = (await snapshot(page))['player']['position']
    touch_progress = distance(start, end)
    # A GLB corner can block both forward walking and the first sideways drag.
    # Preserve the same progress goal while trying the other actual directions.
    touch_attempts = [{'direction':[.85,0],'progress':round(touch_progress,3)}]
    for dx, dy, axis in [(-.85,0,'side'),(0,-.85,'forward'),(0,.85,'forward')]:
        if touch_progress > .03 and max(phase['wDisplacement'],touch_progress) > .15:
            break
        before = len(responses)
        await touch_move(page, cdp, dx=dx, dy=dy)
        await wait_for_ack(responses, before, lambda row: applied_axis(row, axis), label+': alternate touch input was not applied.')
        end = (await snapshot(page))['player']['position']
        touch_progress = distance(start, end)
        touch_attempts.append({'direction':[dx,dy],'progress':round(touch_progress,3)})
    assert touch_progress > .03, (label, 'No rendered touch movement.', start, end)
    phase['touchDisplacement'] = round(touch_progress, 3)
    phase['touchAttempts'] = touch_attempts
    await mark('after touch, before fire')
    assert max(phase['wDisplacement'], touch_progress) > .15, (label, 'No meaningful rendered walking progress.')

    if fire:
        await verify_fire(page, responses, label)
        phase['fired'] = True
    else:
        assert await page.locator('.rad-tox-fire-trigger').is_hidden(), 'The default GLB mode should keep combat disabled.'
        phase['defaultCombatOff'] = True
    return phase


async def exercise_world(browser, base, world, index):
    context = await browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, service_workers='block', reduced_motion='reduce')
    page = await context.new_page()
    page.set_default_timeout(30000)
    errors, requests, responses, auth = [], [], [], []
    await page.add_init_script('''(() => {
        window.loginPointerTrace=[];
        for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,event=>{
            const target=event.target,record={type,at:performance.now(),id:event.pointerId,primary:event.isPrimary,pointerType:event.pointerType,x:event.clientX,y:event.clientY,target:target?.outerHTML?.slice(0,180),thumb:target?.closest?.('[data-thumbstick]')?.dataset.thumbstick};
            loginPointerTrace.push(record);if(loginPointerTrace.length>160)loginPointerTrace.shift();
            queueMicrotask(()=>{const stick=document.querySelector('[data-thumbstick="left"] .thumbstick-base');record.after={active:stick?.classList.contains('is-active'),knob:stick?.querySelector('.thumbstick-knob')?.style.transform,ready:window.MuzikazHouseExplorer?.snapshot().controlsReady,blocked:window.MuzikazHouseExplorer?.snapshot().player.inputBlocked};});
        },true);
    })();''')
    page.on('pageerror', lambda error: errors.append(str(error)))
    joined, release = asyncio.Event(), asyncio.Event()
    held = False

    def request_received(request):
        if request.method != 'POST':
            return
        if '/api/access/' in request.url:
            auth.append(request.url.rsplit('/', 1)[-1])
        if '/gameplay' in request.url:
            requests.append(request.post_data_json or {})

    async def response_received(response):
        if response.request.method == 'POST' and '/gameplay' in response.url:
            try:
                body = await response.json()
                responses.append({'ok': response.ok, 'status': response.status, 'receivedAt':time.time()*1000, 'request': response.request.post_data_json or {}, 'state': body.get('data', body), 'error':None if response.ok else body})
            except Exception:
                pass

    async def hold_join(route):
        nonlocal held
        command = route.request.post_data_json or {}
        if command.get('action') == 'join' and not held:
            held = True
            result = await route.fetch()
            assert result.ok, ('Initial member join failed.', result.status)
            joined.set()
            try:
                await asyncio.wait_for(release.wait(), timeout=20)
            finally:
                await route.fulfill(response=result)
        else:
            await route.continue_()

    page.on('request', request_received)
    page.on('response', response_received)
    await page.route('https://**/*', lambda route: route.abort())
    await page.route('**/api/rooms/*/gameplay', hold_join)
    report = {'id': world, 'passed': False, 'phases': []}
    started = time.monotonic()
    try:
        await page.goto(base+'/model-explorer.html?environment='+quote(world)+'&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
        access = page.get_by_role('dialog', name='Choose how to play', exact=True)
        await access.wait_for(state='visible', timeout=120000)
        await controls_unavailable(page)
        await access.get_by_label('Username', exact=True).fill('MapLoginTester'+str(index))
        await access.get_by_label('Password', exact=True).fill('local-regression-password')
        await access.get_by_role('button', name='Sign in and continue', exact=True).click()
        await asyncio.wait_for(joined.wait(), timeout=120)
        await access.wait_for(state='hidden')
        await controls_unavailable(page)
        initial_room = (await snapshot(page))['roomId']
        assert initial_room == world
        # Native activation on hidden/disabled controls must not bypass their
        # readiness guards while the initial room response is still held.
        await page.evaluate('''() => {
            for(const selector of ['.district-map-toggle','.live-local-map [data-expand]','#house-outside-button','#house-world-button'])document.querySelector(selector)?.click();
        }''')
        await page.wait_for_timeout(350)
        await controls_unavailable(page)
        assert (await snapshot(page))['roomId'] == initial_room
        assert len([request for request in requests if request.get('action') == 'join']) == 1
        assert auth == ['free-play'], ('Test must use only the real member sign-in form.', auth)
        report['memberLogin'] = True
        report['joiningControlsGated'] = True
        release.set()
        await page.wait_for_function('MuzikazHouseExplorer.snapshot().controlsReady', timeout=120000)
        assert (await snapshot(page))['roomId'] == world
        assert not (await snapshot(page))['player']['inputBlocked']
        assert await page.locator('#house-game-start').evaluate('(node)=>node.classList.contains("is-hidden")')
        assert await page.locator('dialog[open]').count() == 0
        cdp = await context.new_cdp_session(page)

        mini = page.locator('.live-local-map [data-collapse]')
        await mini.tap()
        await mini.tap()
        report['phases'].append(await verify_inputs(page, cdp, responses, 'mini-map', fire=world != 'muzikaz-main'))
        for view in ['2D plan', '3D map']:
            await page.locator('.district-map-toggle').tap()
            dialog = page.locator('.district-map-dialog')
            await dialog.wait_for(state='visible')
            await dialog.get_by_role('button', name=view, exact=True).tap()
            if view == '3D map':
                await dialog.locator('[data-local-map-3d][aria-busy="false"] canvas').wait_for(state='visible', timeout=60000)
            else:
                await dialog.locator('[data-local-map-plan] svg').wait_for(state='visible')
            await dialog.get_by_role('button', name='Close', exact=True).tap()
            await dialog.wait_for(state='hidden')
            report['phases'].append(await verify_inputs(page, cdp, responses, view, fire=world != 'muzikaz-main'))

        if world == 'muzikaz-main':
            # Check all login/map controls in their intended default mode first.
            # Then enable combat through its real UI and verify an accepted shot.
            report['defaultModeControlsPassed'] = True
            before = len(responses)
            await page.get_by_role('button', name='RAD-TOX gaming off', exact=True).tap()
            await wait_for_ack(responses, before, lambda row: row['request'].get('action') == 'rad-tox-toggle', 'RAD-TOX did not enable through its actual control.')
            await page.get_by_role('button', name='RAD-TOX gaming on', exact=True).wait_for(state='visible')
            await verify_fire(page, responses, 'enabled GLB combat')
            report['combatEnabledAndFired'] = True

        if world in ['muzikaz-airport', 'world-district-neon-docks']:
            await page.locator('.district-map-toggle').tap()
            dialog = page.locator('.district-map-dialog')
            await dialog.get_by_role('button', name='Vehicles', exact=True).tap()
            craft = dialog.locator('[data-craft-choices] button[data-name*="Diamond"]') if world == 'muzikaz-airport' else dialog.locator('[data-craft-choices] button[data-name="Neon Launch"]')
            before = len(responses)
            await craft.first.tap()
            boarded = await wait_for_ack(responses, before, lambda row: row['request'].get('action') == 'map-access' and row['state'].get('players', {}).get(row['state'].get('selfId'), {}).get('vehicleId'), 'Craft selection did not board a real shared vehicle.')
            assert await dialog.is_visible(), 'Boarding must keep the map open.'
            await dialog.get_by_role('button', name='Close', exact=True).tap()
            await dialog.wait_for(state='hidden')
            report['boardedVehicle'] = boarded['state']['players'][boarded['state']['selfId']]['vehicleId']
            functions = 'Show flight controls' if world == 'muzikaz-airport' else 'Show boat functions'
            await page.get_by_role('button', name=functions, exact=True).tap()
            exit_name = 'Exit parked aircraft' if world == 'muzikaz-airport' else 'Leave stopped boat'
            exit_button = page.get_by_role('button', name=exit_name, exact=True)
            before = len(responses)
            await exit_button.tap()
            await wait_for_ack(responses, before, lambda row: row['request'].get('action') == 'interact' and row['state'].get('selfId') in row['state'].get('players', {}) and not row['state']['players'][row['state']['selfId']].get('vehicleId'), 'The server did not confirm leaving the vehicle.')
            await exit_button.wait_for(state='hidden')
            report['vehicleExited'] = True
            report['phases'].append(await verify_inputs(page, cdp, responses, 'vehicle-exit'))

        assert not errors, errors
        report['passed'] = True
    except Exception as error:
        report['error'] = str(error)
        report['pageErrors'] = errors
        report['recentRequests'] = requests[-60:]
        report['recentResponses'] = [{'status':row['status'],'receivedAt':row['receivedAt'],'request':row['request'],'sequence':row['state'].get('sequence'),'inputEpoch':row['state'].get('inputEpoch'),'result':row['state'].get('result'),'error':row.get('error'),'match':row['state'].get('match'),'radTox':row['state'].get('radTox'),'self':{key:value for key,value in (row['state'].get('players',{}).get(row['state'].get('selfId')) or {}).items() if key in ['position','input','grounded','health','movementRevision','vehicleId','radToxEnabled','radToxReady']}} for row in responses[-200:]]
        try:
            report['pointerTrace'] = await page.evaluate('loginPointerTrace')
            report['touchGestures'] = await page.evaluate('window.loginTouchGestures')
            report['checkpoints'] = await page.evaluate('window.loginCheckpoints')
            report['diagnostic'] = await page.evaluate('({state:window.MuzikazHouseExplorer?.snapshot(),access:document.querySelector(".play-access-dialog [data-status]")?.textContent,status:document.querySelector("[data-house-status]")?.textContent,dialogs:[...document.querySelectorAll("dialog[open]")].map(node=>node.className),focus:document.activeElement?.outerHTML.slice(0,220)})')
            await page.screenshot(path='/tmp/login-map-failed-'+world+'.png')
        except Exception:
            pass
    finally:
        release.set()
        previous = {}
        rejections = []
        for row in responses:
            if row['ok']:
                own = row['state'].get('players', {}).get(row['state'].get('selfId'), {})
                previous = {'receivedAt':row['receivedAt'],'health':own.get('health'),'matchState':(row['state'].get('match') or {}).get('state'),'radTox':row['state'].get('radTox')}
            else:
                rejections.append({'receivedAt':row['receivedAt'],'action':row['request'].get('action'),'status':row['status'],'error':row.get('error'),'precedingServerState':previous})
        report['gameplayRejections'] = rejections
        try:
            report['healthCheckpoints'] = await page.evaluate('()=>(window.loginCheckpoints||[]).map(row=>({step:row.step,at:row.at,wallTime:row.wallTime,health:row.state.health,ready:row.state.controlsReady,blocked:row.state.player.inputBlocked}))')
        except Exception:
            pass
        report['elapsedSeconds'] = round(time.monotonic()-started, 2)
        await context.close()
    return report


async def main(args):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='login-map-controls-') as directory:
        with open(Path(directory)/'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as playwright:
                    browser = await playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    probe = await playwright.request.new_context()
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(100):
                        try:
                            if (await probe.get(base+'/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.15)
                    await probe.dispose()
                    results = []
                    for index, world in enumerate(args.world or DEFAULT_WORLDS):
                        result = await exercise_world(browser, base, world, index)
                        results.append(result)
                        Path(args.report).write_text(json.dumps({'results': results}, indent=2))
                        print(json.dumps(result), flush=True)
                    await browser.close()
                    failed = [row['id'] for row in results if not row['passed']]
                    assert not failed, 'Real-login map controls failed: '+', '.join(failed)
            finally:
                server.terminate()
                server.wait(timeout=15)


parser = argparse.ArgumentParser()
parser.add_argument('--world', action='append')
parser.add_argument('--report', default='/tmp/login-map-controls-results.json')
asyncio.run(main(parser.parse_args()))
