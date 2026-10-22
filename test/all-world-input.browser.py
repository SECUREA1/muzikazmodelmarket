"""Exercise the live public map directory with sustained touch and map travel.

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


def distance(a, b):
    return math.hypot(a[0] - b[0], a[2] - b[2])


async def close_dialogs(page):
    # Native close dispatches the same close event as the menu's own button,
    # including its hidden/focus cleanup. It avoids language-specific labels.
    await page.locator('dialog[open]').evaluate_all('(dialogs) => dialogs.forEach(dialog => dialog.close())')
    await page.wait_for_timeout(100)


async def position(page, kind):
    if kind == 'hockey':
        return await page.evaluate('() => {const p=MuzikazHockey.snapshot().player;return p?[p.x,0,p.z]:null;}')
    if kind == 'arcade':
        return await page.evaluate('NeonJunction.snapshot().playerPosition')
    return await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')


async def touch_move(page, cdp, dx=0, dy=-.85, duration=1400):
    stick = page.locator('[data-thumbstick="left"] .thumbstick-base').first
    await stick.wait_for(state='visible', timeout=30000)
    await stick.scroll_into_view_if_needed()
    await page.wait_for_timeout(80)
    box = await stick.bounding_box()
    assert box and box['width'] > 0 and box['height'] > 0, 'Movement stick is outside the viewport.'
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    hit = await stick.evaluate('(stick, point) => {const target=document.elementFromPoint(point.x,point.y);return {hit:!!target&&stick.contains(target),target:target?.outerHTML.slice(0,180),width:innerWidth,height:innerHeight,viewport:{scale:visualViewport?.scale,top:visualViewport?.offsetTop,left:visualViewport?.offsetLeft}};}', {'x': x, 'y': y})
    assert hit['hit'], ('Touch target is covered or outside the viewport.', box, hit)
    target = {'x': x + dx * box['width'] * .4, 'y': y + dy * box['height'] * .4, 'id': 1}
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': 1}]})
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [target]})
    await page.wait_for_timeout(duration)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await page.wait_for_timeout(150)


async def wait_for_applied_input(responses, start, *, right_only=False):
    # The response listener may still be reading a large scene snapshot after
    # the gesture ends. Await an actual matching acknowledgement, with a bound,
    # instead of mistaking slow SwiftShader/JSON work for rejected controls.
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        for entry in responses[start:]:
            if entry['action'] != 'input' or not entry['ok']:
                continue
            sent = entry['request'].get('input', {})
            state = entry['state']
            applied = state.get('players', {}).get(state.get('selfId'), {}).get('input', {})
            if right_only:
                if sent.get('side', 0) > .1 and applied.get('side', 0) > .1:
                    return True
            elif any(abs(sent.get(axis, 0)) > .1 and abs(sent.get(axis, 0) - applied.get(axis, 0)) < .001 for axis in ['side', 'forward']):
                return True
        await asyncio.sleep(.05)
    return False


async def exercise_world(context, environment, base, hold_ms):
    world_id = environment['id']
    kind = 'hockey' if environment.get('game') == 'hockey' else 'arcade' if environment.get('game') == 'arcade' else 'house'
    page = await context.new_page()
    page.set_default_timeout(15000)
    errors, commands, responses = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def record_request(request):
        if request.method == 'POST' and '/gameplay' in request.url:
            commands.append(request.post_data_json or {})

    async def record_response(response):
        if response.request.method == 'POST' and '/gameplay' in response.url:
            try:
                body = await response.json()
                state = body.get('data', body)
                responses.append({'ok': response.ok, 'status': response.status, 'action': (response.request.post_data_json or {}).get('action'), 'request': response.request.post_data_json or {}, 'state': state})
            except Exception:
                pass

    page.on('request', record_request)
    page.on('response', record_response)
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
    await page.route('**/api/rooms/*/gameplay', delayed_map_reply)
    report = {'id': world_id, 'name': environment.get('name'), 'kind': kind, 'passed': False}
    started = time.monotonic()
    try:
        native_page = 'hockey.html' if kind == 'hockey' else 'arcade.html' if kind == 'arcade' else 'model-explorer.html'
        await page.goto(base + '/' + native_page + '?environment=' + quote(world_id) + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
        if kind == 'hockey':
            await page.wait_for_function('window.MuzikazHockey?.snapshot().ready', timeout=90000)
            await page.locator('#start').evaluate('(button) => button.click()')
            await page.wait_for_function('MuzikazHockey.snapshot().running && MuzikazHockey.snapshot().player', timeout=30000)
        elif kind == 'arcade':
            await page.wait_for_function('window.NeonJunction?.ready', timeout=90000)
        else:
            await page.wait_for_function('() => {const s=window.MuzikazHouseExplorer?.snapshot();return s?.gameplayStarted&&s.serverReady&&s.roomId===' + json.dumps(world_id) + ';}', timeout=90000)
        await close_dialogs(page)
        cdp = await context.new_cdp_session(page)
        positions = [await position(page, kind)]
        phase_started = time.monotonic()

        for dx, dy in [(0, -.85), (.85, 0), (0, .85), (-.85, 0)]:
            await touch_move(page, cdp, dx, dy, hold_ms)
            positions.append(await position(page, kind))

        initial_progress = max(distance(a, b) for a in positions for b in positions)
        assert initial_progress > .15, 'No rendered touch movement before map travel.'
        report['initialTouchDisplacement'] = round(initial_progress, 3)

        if kind == 'house':
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
            await port.tap()
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
            state = await page.evaluate('MuzikazHouseExplorer.snapshot()')
            assert state['serverReady'] and state['gameplayStarted'], 'The live room disconnected during sustained controls.'
            report['health'] = state['health']
        else:
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
        await touch_move(page, cdp, -.85, 0, hold_ms)
        positions.append(await position(page, kind))
        final_progress = distance(final_start, positions[-1])
        for dx, dy in [(.85, 0), (0, -.85), (0, .85)]:
            if final_progress > .03:
                break
            await touch_move(page, cdp, dx, dy, hold_ms)
            positions.append(await position(page, kind))
            final_progress = distance(final_start, positions[-1])
        assert final_progress > .03, 'Rendered movement stopped after the sustained interval.'
        report['finalTouchDisplacement'] = round(final_progress, 3)
        if kind == 'house':
            final = await page.evaluate('MuzikazHouseExplorer.snapshot()')
            assert final['serverReady'] and final['gameplayStarted'], 'The live room disconnected after the sustained interval.'
            assert any(command.get('action') == 'input' and any(abs(command.get('input', {}).get(axis, 0)) > .1 for axis in ['side', 'forward']) for command in commands[commands_before:]), 'Fresh touch input stopped after the sustained interval.'
            assert await wait_for_applied_input(responses, response_before), 'The server stopped applying touch input after the sustained interval.'
        assert positions and all(p and all(math.isfinite(v) for v in p) for p in positions), 'Player position became invalid.'
        travel = max(distance(a, b) for a in positions for b in positions)
        assert travel > .15, 'No rendered walking/skating progress in any tested direction.'
        assert not errors, errors
        report.update({'passed': True, 'maximumDisplacement': round(travel, 3), 'samples': len(positions)})
    except Exception as error:
        report['error'] = str(error)
        report['pageErrors'] = errors
        try:
            await page.screenshot(path='/tmp/world-input-failed-' + re.sub(r'[^a-zA-Z0-9_-]', '_', world_id) + '.png')
        except Exception:
            pass
        try:
            report['diagnostic'] = await page.evaluate('({url:location.href,status:document.querySelector("[data-house-status],#status")?.textContent,loader:document.querySelector("[data-level-loader-message]")?.textContent,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.className),state:window.MuzikazHouseExplorer?.snapshot()||window.MuzikazHockey?.snapshot()||window.NeonJunction?.snapshot()})')
        except Exception:
            pass
    finally:
        report['elapsedSeconds'] = round(time.monotonic() - started, 2)
        await page.close()
    return report


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
                    assert selected, 'No selected worlds exist in the public directory.'
                    if args.world:
                        assert set(args.world) == {world['id'] for world in selected}, 'One or more requested worlds are absent.'
                    print(json.dumps({'availableWorlds': len(available), 'selectedWorlds': len(selected)}), flush=True)
                    results = []
                    for world in selected:
                        result = await exercise_world(context, world, base, args.hold_ms)
                        results.append(result)
                        print(json.dumps(result), flush=True)
                        Path(args.report).write_text(json.dumps({'availableWorlds': len(available), 'selectedWorlds': len(selected), 'results': results}, indent=2))
                    await browser.close()
                    failed = [result['id'] for result in results if not result['passed']]
                    print(json.dumps({'testedWorlds': len(results), 'passedWorlds': len(results) - len(failed), 'failedWorlds': failed}), flush=True)
                    assert not failed, 'World input regressions: ' + ', '.join(failed)
            finally:
                server.terminate()
                server.wait(timeout=15)


parser = argparse.ArgumentParser()
parser.add_argument('--world', action='append', help='Debug only this exact public world ID; repeat for several.')
parser.add_argument('--hold-ms', type=int, default=1400)
parser.add_argument('--report', default='/tmp/all-world-input-results.json')
asyncio.run(main(parser.parse_args()))
