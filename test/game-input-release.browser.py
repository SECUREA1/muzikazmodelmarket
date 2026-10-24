"""Double taps and map changes release old holds without disabling fresh controls."""
from pathlib import Path
import argparse
import asyncio
import math
import os
import socket
import subprocess
import tempfile
import time

from playwright.async_api import async_playwright

os.chdir(Path(__file__).resolve().parents[1])
WORLDS = ['muzikaz-airport', 'world-district-neon-docks']


def neutral(value):
    return all(abs(value.get(axis, 0)) < .001 for axis in ['forward', 'side', 'lift', 'rudder']) and not any(value.get(key) for key in ['jump', 'sprint', 'firing'])


async def state(page):
    return await page.evaluate('window.MuzikazHouseExplorer?.snapshot() ?? null')


async def check_world(context, base, world):
    page = await context.new_page()
    page.set_default_timeout(30000)
    requests, replies, errors = [], [], []
    request_indices = {}

    def record_request(request):
        if request.method == 'POST' and '/gameplay' in request.url:
            body = request.post_data_json or {}
            request_indices[body.get('requestId')] = len(requests)
            requests.append(body)

    async def record_reply(response):
        if response.request.method != 'POST' or '/gameplay' not in response.url:
            return
        try:
            body = response.request.post_data_json or {}
            payload = await response.json()
            snapshot = payload.get('data', payload)
            own = snapshot.get('players', {}).get(snapshot.get('selfId'), {})
            replies.append({'index': request_indices.get(body.get('requestId'), -1), 'request': body,
                            'ok': response.ok, 'input': own.get('input', {}), 'self': own})
        except Exception:
            pass

    async def applied_since(start, predicate, label, server_predicate=None):
        server_predicate = server_predicate or predicate
        print(world + ': checking ' + label, flush=True)
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            for row in replies:
                if row['index'] >= start and row['ok'] and row['request'].get('action') == 'input' and predicate(row['request'].get('input', {})) and server_predicate(row['input']):
                    return row
            await asyncio.sleep(.05)
        raise AssertionError((world, label, 'No matching authoritative input.', replies[-8:], await state(page)))

    async def free_canvas_point():
        return await page.locator('#house-explorer-canvas').evaluate('''canvas=>{
          const r=canvas.getBoundingClientRect();
          for(const [x,y]of [[.5,.18],[.35,.18],[.65,.18],[.5,.3],[.35,.3]]){
            const point={x:r.left+r.width*x,y:r.top+r.height*y};
            if(document.elementFromPoint(point.x,point.y)===canvas)return point;
          }
          throw Error('No unobstructed canvas point for the release gesture.');
        }''')

    async def assert_released(start, label):
        await applied_since(start, neutral, label)
        # Replayed keyboard repeats are the same physical hold, not a new press.
        after = len(requests)
        await page.locator('#house-explorer-canvas').dispatch_event('keydown', {'key': 'w', 'code': 'KeyW', 'repeat': True})
        await applied_since(after, neutral, label + ' after an old keyboard repeat')
        await page.wait_for_timeout(450)
        values = [body['input'] for body in requests[after:] if body.get('action') == 'input']
        assert values and all(neutral(value) for value in values), (world, label, 'An old hold rearmed after release.', values)
        assert (await state(page))['controlsReady'], (world, label, 'Release disabled the game.')
        assert not await page.evaluate('Boolean(document.pointerLockElement)'), (world, label, 'Pointer lock survived release.')

    async def hold_key():
        await page.locator('#house-explorer-canvas').focus()
        before = len(requests)
        await page.keyboard.down('Shift')
        await page.keyboard.down('w')
        await applied_since(before, lambda value: value.get('forward', 0) > .5, 'held keyboard')

    async def end_keys():
        await page.keyboard.up('w')
        await page.keyboard.up('Shift')

    async def fresh_walk(label):
        origin = (await state(page))['player']['position']
        moved = False
        for key, axis, sign in [('s', 'forward', -1), ('a', 'side', -1), ('d', 'side', 1), ('w', 'forward', 1)]:
            before = len(requests)
            await page.keyboard.down(key)
            try:
                await applied_since(before, lambda value: value.get(axis, 0) * sign > .5, label)
                await page.wait_for_timeout(500)
            finally:
                await page.keyboard.up(key)
            current = (await state(page))['player']['position']
            if math.hypot(current[0] - origin[0], current[2] - origin[2]) > .15:
                moved = True
                break
        assert moved, (world, label, 'Fresh input acknowledged but visible walking remained stuck.', origin, await state(page))

    async def touch_sequence(cdp, points, kind):
        await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})

    async def fresh_touch_walk(label):
        stick = page.locator('[data-thumbstick="left"] .thumbstick-base')
        box = await stick.bounding_box()
        assert box and await stick.evaluate('''node=>{
          const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
          return hit===node||node.contains(hit);
        }'''), (world, label, 'The open map covers the movement pad.')
        origin = (await state(page))['player']['position']
        center = {'id': 71, 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
        cdp = await context.new_cdp_session(page)
        touch_active = False
        try:
            for dx, dy in [(0, .35), (.35, 0), (-.35, 0)]:
                before = len(requests)
                await touch_sequence(cdp, [center], 'touchStart')
                touch_active = True
                await touch_sequence(cdp, [{**center, 'x': center['x'] + dx * box['width'], 'y': center['y'] + dy * box['height']}], 'touchMove')
                axis, sign = ('forward', -1) if dy else ('side', 1 if dx > 0 else -1)
                await applied_since(before, lambda value: value.get(axis, 0) * sign > .5, label + ' fresh touch')
                await page.wait_for_timeout(500)
                await touch_sequence(cdp, [], 'touchEnd')
                touch_active = False
                current = (await state(page))['player']['position']
                if math.hypot(current[0] - origin[0], current[2] - origin[2]) > .15:
                    return
            raise AssertionError((world, label, 'Fresh touch input did not move the visible player.'))
        finally:
            if touch_active:
                await touch_sequence(cdp, [], 'touchEnd')
            await cdp.detach()

    page.on('request', record_request)
    page.on('response', record_reply)
    def page_error(error):
        errors.append(str(error))
        print(world + ': page error: ' + str(error), flush=True)
    page.on('pageerror', page_error)
    await page.route('https://**/*', lambda route: route.abort())
    try:
        await page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
        await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && MuzikazHouseExplorer.snapshot().serverReady', timeout=120000)
        print(world + ': gameplay ready', flush=True)
        canvas = page.locator('#house-explorer-canvas')
        await canvas.focus()
        for _ in range(3):
            if (await state(page))['cameraMode'] == 'first-person':
                break
            await page.keyboard.press('v')
        # Look above the horizon so the reset is tested without ground travel.
        point = await free_canvas_point()
        await page.mouse.move(point['x'], point['y'] + 90)
        await page.mouse.down()
        await page.mouse.move(point['x'], point['y'])
        await page.mouse.up()
        assert (await state(page))['player']['pitch'] > .2

        await hold_key()
        before = len(requests)
        point = await free_canvas_point()
        await page.mouse.dblclick(point['x'], point['y'], delay=60)
        await assert_released(before, 'sky double-click')
        assert not any(body.get('action') == 'teleport-floor' for body in requests[before:]), 'Sky reset must not invent a floor destination.'
        await end_keys()
        await fresh_walk('after sky double-click')

        # Placement/edit tools can stop events at the canvas. The escape
        # gesture must run earlier than those target capture handlers.
        await hold_key()
        await canvas.evaluate('''node=>{
          window.releasePointerBlocker=event=>event.stopImmediatePropagation();
          node.addEventListener('pointerup',releasePointerBlocker,true);
        }''')
        before = len(requests)
        try:
            point = await free_canvas_point()
            await page.mouse.dblclick(point['x'], point['y'], delay=60)
            await assert_released(before, 'canvas function capture double-click')
        finally:
            await canvas.evaluate('node=>node.removeEventListener("pointerup",window.releasePointerBlocker,true)')
        await end_keys()
        await fresh_walk('after canvas function capture')

        # A second finger must be able to release a first finger still holding
        # the movement pad; terminal pointer events may have been discarded.
        cdp = await context.new_cdp_session(page)
        stick = page.locator('[data-thumbstick="left"] .thumbstick-base')
        box = await stick.bounding_box()
        finger = {'id': 31, 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
        before = len(requests)
        await touch_sequence(cdp, [finger], 'touchStart')
        finger['y'] -= box['height'] * .35
        await touch_sequence(cdp, [finger], 'touchMove')
        await applied_since(before, lambda value: value.get('forward', 0) > .5, 'first held touch')
        before = len(requests)
        point = await free_canvas_point()
        tap = {'id': 32, **point}
        for _ in range(2):
            await touch_sequence(cdp, [finger, tap], 'touchStart')
            await touch_sequence(cdp, [finger], 'touchEnd')
        await assert_released(before, 'second-finger double tap')
        # Moving the old physical finger must not resume the released stick.
        before = len(requests)
        finger['y'] -= 4
        await touch_sequence(cdp, [finger], 'touchMove')
        await applied_since(before, neutral, 'old touch stays released')
        await touch_sequence(cdp, [], 'touchEnd')
        await cdp.detach()
        await fresh_walk('after second-finger release')

        # The map is a companion: opening or changing views releases old holds,
        # while fresh inputs remain usable without closing it or focusing canvas.
        dialog = page.locator('.district-map-dialog')
        for view in ['2D plan', '3D map']:
            await hold_key()
            before = len(requests)
            await page.locator('.district-map-toggle').click()
            await dialog.wait_for(state='visible')
            await dialog.get_by_role('button', name=view, exact=True).click()
            await assert_released(before, view + ' opened')
            await end_keys()
            assert not await dialog.evaluate('node=>node.matches(":modal")')
            assert not await canvas.evaluate('node=>!!node.closest("[inert]")')
            assert not (await state(page))['player']['inputBlocked']
            await fresh_walk(view + ' stays open')
            await fresh_touch_walk(view + ' stays open')
            assert await dialog.is_visible(), 'Fresh movement closed the companion map.'
            before = len(requests)
            await dialog.get_by_role('button', name='Close', exact=True).click()
            await applied_since(before, neutral, view + ' closed')
        mini = page.locator('.live-local-map [data-collapse]')
        await hold_key()
        before = len(requests)
        await mini.click()
        await assert_released(before, 'live mini map opened')
        await end_keys()
        await fresh_walk('live mini map stays open')
        await fresh_touch_walk('live mini map stays open')
        if await mini.get_attribute('aria-expanded') == 'true':
            await mini.click()

        await hold_key()
        before = len(requests)
        await page.locator('#house-world-button').click()
        world_picker = page.locator('.world-map-picker')
        await world_picker.wait_for(state='visible')
        await assert_released(before, 'world destination map opened')
        await end_keys()
        assert not await world_picker.evaluate('node=>node.closest("dialog").matches(":modal")')
        assert not await canvas.evaluate('node=>!!node.closest("[inert]")')
        assert not (await state(page))['player']['inputBlocked']
        await fresh_walk('world destination map stays open')
        await fresh_touch_walk('world destination map stays open')
        assert await world_picker.is_visible(), 'Fresh movement closed the world destination picker.'
        await page.locator('dialog.game-companion-dialog[open] .game-fullscreen-close').click()
        await world_picker.wait_for(state='hidden')

        # Release an actual captured mouse hold using native touch taps. This
        # covers both continuous tool firing and aircraft/boat control holds.
        async def captured_hold_release(control, predicate, label, server_predicate=None):
            await control.wait_for(state='visible')
            await control.scroll_into_view_if_needed()
            box = await control.bounding_box()
            before = len(requests)
            await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            await page.mouse.down()
            await applied_since(before, predicate, label + ' held', server_predicate)
            before = len(requests)
            point = await free_canvas_point()
            await page.touchscreen.tap(point['x'], point['y'])
            await page.touchscreen.tap(point['x'], point['y'])
            await assert_released(before, label + ' released')
            assert not await control.evaluate('node=>node.hasPointerCapture(1)'), label + ' retained pointer capture'
            await page.mouse.up()

        await captured_hold_release(page.get_by_role('button', name='Fire selected weapon', exact=True), lambda value: value.get('firing') is True, 'tool fire', neutral)
        await page.locator('.district-map-toggle').click()
        await dialog.get_by_role('button', name='Vehicles', exact=True).click()
        craft = dialog.locator('[data-craft-choices] button[data-name*="Corsair"]' if world == 'muzikaz-airport' else '[data-craft-choices] button[data-name="Neon Launch"]')
        await craft.first.click()
        await dialog.wait_for(state='hidden')
        await page.wait_for_function('MuzikazHouseExplorer.snapshot().vehicleActive')
        vehicle_id = (await state(page))['vehicleId']
        toggle_name = 'Show flight controls' if world == 'muzikaz-airport' else 'Show boat functions'
        await page.get_by_role('button', name=toggle_name, exact=True).click()
        control = page.get_by_role('button', name='Climb aircraft' if world == 'muzikaz-airport' else 'Ahead boat', exact=True)
        predicate = (lambda value: value.get('lift', 0) > .5) if world == 'muzikaz-airport' else (lambda value: value.get('forward', 0) > .5)
        await captured_hold_release(control, predicate, 'vehicle hold')
        assert (await state(page))['vehicleId'] == vehicle_id, 'Control release must keep the selected vehicle.'
        # The same control accepts a new hold after the old capture was released.
        before = len(requests)
        await control.dispatch_event('pointerdown', {'pointerId': 81, 'pointerType': 'mouse', 'isPrimary': True, 'button': 0})
        await applied_since(before, predicate, 'fresh vehicle hold')
        await control.dispatch_event('pointerup', {'pointerId': 81, 'pointerType': 'mouse', 'isPrimary': True, 'button': 0})
        assert not errors, (world, errors)
        print(world + ': sky and second-finger resets, map release, fresh walking, captured tool and vehicle holds passed.', flush=True)
    except Exception:
        print(world, 'release diagnostic', {'requests': requests[-12:], 'replies': replies[-8:], 'errors': errors, 'state': await state(page)}, flush=True)
        await page.screenshot(path='/tmp/game-input-release-' + world + '.png')
        raise
    finally:
        await page.close()


async def main(worlds):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='game-input-release-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(80):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    for world in worlds:
                        await check_world(context, base, world)
                    await browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)


parser = argparse.ArgumentParser()
parser.add_argument('--world', action='append', choices=WORLDS)
asyncio.run(main(parser.parse_args().world or WORLDS))
