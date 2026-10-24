"""Real facility menus release held controls and return keyboard/touch movement.

Factory and fitness also reload their current map through the existing map
selector while their menu is open. A stale menu must not prevent the replacement
server player from initializing. No test hooks are added to the game runtime.
"""
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
WORLDS = {
    'skyscraper-construction': {
        'toggle': '.construction-crew-toggle',
        'panel': '.construction-crew-dialog',
        'close': 'Close crew',
    },
    'muzikaz-missile-factory': {
        'toggle': '.factory-toggle',
        'panel': '.factory-dialog',
        'close': 'Close factory',
        'reload': True,
    },
    'muzikaz-fitness-centre': {
        'toggle': '.fitness-menu-trigger',
        'panel': '.fitness-dialog',
        'close': 'Close fitness centre',
        'reload': True,
    },
    'pixel-peaks-ski-resort': {
        'toggle': '.ski-resort-toggle',
        'panel': '[data-ski-menu-body]',
        'close': 'Close ski race panel',
        'companion': True,
    },
}


def distance(a, b):
    return math.hypot(a[0] - b[0], a[2] - b[2])


def neutral(value):
    return all(abs(value.get(axis, 0)) < .01 for axis in ['forward', 'side', 'lift', 'rudder']) and not any(value.get(key) for key in ['jump', 'sprint', 'firing'])


async def state(page):
    return await page.evaluate('MuzikazHouseExplorer.snapshot()')


async def exercise(context, base, world):
    config = WORLDS[world]
    page = await context.new_page()
    page.set_default_timeout(30000)
    errors, requests, replies = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def record(request):
        if request.method == 'POST' and '/gameplay' in request.url:
            requests.append(request.post_data_json or {})

    async def reply(response):
        if response.request.method != 'POST' or '/gameplay' not in response.url:
            return
        command = response.request.post_data_json or {}
        if command.get('action') != 'input':
            return
        try:
            payload = await response.json()
            snapshot = payload.get('data', payload)
            own = snapshot.get('players', {}).get(snapshot.get('selfId'), {})
            replies.append({'requestId': command.get('requestId'), 'sent': command.get('input', {}),
                            'input': own.get('input', {}), 'ok': response.ok})
        except Exception:
            pass

    page.on('request', record)
    page.on('response', reply)
    await page.route('https://**/*', lambda route: route.abort())

    async def accepted_since(start, predicate, label):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            ids = {command.get('requestId') for command in requests[start:] if command.get('action') == 'input'}
            if any(row['ok'] and row['requestId'] in ids and predicate(row['sent']) and predicate(row['input']) for row in replies):
                return
            await asyncio.sleep(.05)
        raise AssertionError((world, label, 'No matching authoritative input.', requests[-5:], replies[-5:], await state(page)))

    async def open_menu():
        toggle = page.locator(config['toggle'])
        if not await toggle.is_visible():
            more = page.get_by_role('button', name='More view controls', exact=True)
            await more.click()
        await toggle.click()
        await page.locator(config['panel']).wait_for(state='visible')

    async def keyboard_walk(label, target=None, hold_ms=650):
        start = (await state(page))['player']['position']
        for key, axis, sign in [('s', 'forward', -1), ('a', 'side', -1), ('d', 'side', 1), ('w', 'forward', 1)]:
            if target:
                await target.focus()
            before = len(requests)
            await page.keyboard.down(key)
            try:
                await accepted_since(before, lambda value: value.get(axis, 0) * sign > .5, label)
                await page.wait_for_timeout(hold_ms)
            finally:
                await page.keyboard.up(key)
            end = (await state(page))['player']['position']
            if distance(start, end) > .25:
                return
        raise AssertionError((world, label, 'Acknowledged keyboard control did not move the visible player.', start, await state(page)))

    async def touch_walk(label):
        pad = page.locator('[data-thumbstick="left"] .thumbstick-base').first
        await pad.wait_for(state='visible')
        box = await pad.bounding_box()
        assert box, (world, label, 'Movement pad has no bounds.')
        start = (await state(page))['player']['position']
        cdp = await context.new_cdp_session(page)
        try:
            for dx, dy in [(0, .35), (.35, 0), (-.35, 0), (0, -.35)]:
                point = {'id': 21, 'x': box['x'] + box['width'] * (.5 + dx),
                         'y': box['y'] + box['height'] * (.5 + dy)}
                assert await pad.evaluate('(pad,point)=>pad.contains(document.elementFromPoint(point.x,point.y))', point), (world, label, 'Facility panel covers the movement pad.')
                before = len(requests)
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [point]})
                axis, sign = ('forward', -1 if dy > 0 else 1) if dy else ('side', 1 if dx > 0 else -1)
                try:
                    await accepted_since(before, lambda value: value.get(axis, 0) * sign > .25, label)
                    await page.wait_for_timeout(700)
                finally:
                    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
                end = (await state(page))['player']['position']
                if distance(start, end) > .25:
                    before = len(requests)
                    await accepted_since(before, neutral, label + ' release')
                    return
            raise AssertionError((world, label, 'Acknowledged touch control did not move the visible player.', start, await state(page)))
        finally:
            await cdp.detach()

    try:
        await page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
        await page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && MuzikazHouseExplorer.snapshot().serverReady', timeout=180000)
        print(world + ': live facility ready', flush=True)
        # The arrival quest popup is a companion, and must not cover menu tests.
        close_quests = page.get_by_role('button', name='Close local quests', exact=True)
        if await close_quests.is_visible():
            await close_quests.click()
        await page.locator('#house-explorer-canvas').focus()
        before = len(requests)
        await page.keyboard.down('s')
        await accepted_since(before, lambda value: value.get('forward', 0) < -.5, 'initial hold')
        before = len(requests)
        await open_menu()
        await accepted_since(before, neutral, 'facility opening neutralizes held movement')
        await page.keyboard.up('s')
        assert (await state(page))['player']['inputBlocked'] == (not bool(config.get('companion'))), (world, 'Incorrect facility input boundary.', await state(page))

        if config.get('companion'):
            selector = page.locator('[data-ski-course]')
            await selector.focus()
            await page.keyboard.press('ArrowDown')
            assert await selector.evaluate('node=>document.activeElement===node'), 'Native course selection must retain its arrow keys.'
            await keyboard_walk('walking directly from open ski course selector', selector)
            assert await page.locator(config['panel']).is_visible(), 'Movement should leave the ski companion open.'
            # Entering an editable field in an already-open companion must
            # stop a previous hold, even though its key events stay local.
            await page.locator('#house-explorer-canvas').focus()
            before = len(requests)
            await page.keyboard.down('s')
            try:
                await accepted_since(before, lambda value: value.get('forward', 0) < -.5, 'walking before text editing')
                before = len(requests)
                draft = page.locator('[data-ski-lobby-name]')
                await draft.focus()
                await accepted_since(before, neutral, 'editing focus releases previous walking hold')
            finally:
                await page.keyboard.up('s')
            await draft.fill('Ski route ')
            await page.keyboard.type('wasd')
            assert await draft.input_value() == 'Ski route wasd', 'Gameplay must preserve text input.'
            assert await draft.evaluate('node=>document.activeElement===node'), 'Typing must not hand focus to the game.'

        await page.get_by_role('button', name=config['close'], exact=True).click()
        await page.locator(config['panel']).wait_for(state='hidden')
        await page.wait_for_function('!MuzikazHouseExplorer.snapshot().player.inputBlocked')
        await keyboard_walk('keyboard after facility close')
        await touch_walk('touch after facility close')

        if world == 'skyscraper-construction':
            response = await context.request.get(base + '/api/rooms/' + world + '/gameplay')
            room = (await response.json())['data']
            excavator = next(actor['id'] for actor in room['actors'].values() if actor.get('modelId') == 'site-excavator')
            await page.locator('.district-map-toggle').click()
            await page.get_by_role('button', name='Vehicles', exact=True).click()
            await page.locator('[data-craft-id="' + excavator + '"]').click()
            await page.wait_for_function('MuzikazHouseExplorer.snapshot().vehicleActive')
            dashboard = page.locator('.construction-controls')
            await dashboard.wait_for(state='visible')
            map_dialog = page.locator('.district-map-dialog')
            if await map_dialog.is_visible():
                await map_dialog.get_by_role('button', name='Close', exact=True).click()
            await dashboard.get_by_role('button', name='More machine functions', exact=True).click()
            await page.locator('.construction-functions-dialog').wait_for(state='visible')
            await page.get_by_role('button', name='Close functions', exact=True).click()
            await page.wait_for_function('!MuzikazHouseExplorer.snapshot().player.inputBlocked')
            drive = dashboard.locator('[data-construction-mode=drive]')
            await drive.click()
            await keyboard_walk('fresh excavator driving after mode/button focus', drive, hold_ms=1200)
            assert await page.locator('#house-explorer-canvas').evaluate('node=>document.activeElement===node'), 'Construction drive button retained keyboard focus.'
            async with page.expect_response(lambda reply: '/gameplay' in reply.url and reply.request.method == 'POST' and (reply.request.post_data_json or {}).get('action') == 'construction-controls' and (reply.request.post_data_json or {}).get('operation') == 'park') as parked:
                await dashboard.get_by_role('button', name='Park construction machine', exact=True).click()
            assert (await parked.value).ok, 'Excavator park command was rejected.'
            await dashboard.get_by_role('button', name='Exit parked construction machine', exact=True).click()
            await page.wait_for_function('!MuzikazHouseExplorer.snapshot().vehicleActive')
            await keyboard_walk('walking after excavator exit')
            await touch_walk('touch walking after excavator exit')
            print(world + ': actual excavator functions, Drive focus handoff, park and exit passed', flush=True)

        if config.get('reload'):
            await open_menu()
            joins = sum(command.get('action') == 'join' for command in requests)
            # This is the existing map-selector change handler, including normal
            # world teardown and join. Keep the facility open at its entry.
            await page.locator('#house-environment-select').select_option(world, force=True)
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                current = await state(page)
                if sum(command.get('action') == 'join' for command in requests) > joins and current['controlsReady'] and current['serverReady'] and not current['worldLoading']:
                    break
                await asyncio.sleep(.1)
            else:
                raise AssertionError((world, 'Facility modal survived reload and prevented player initialization.', await state(page), errors))
            assert not await page.locator(config['panel']).is_visible(), (world, 'Old facility remained open after world replacement.')
            assert not (await state(page))['player']['inputBlocked']
            await keyboard_walk('keyboard after facility map reload')
            await touch_walk('touch after facility map reload')

        assert not errors, (world, errors)
        print(world + ': held-input release, keyboard and touch recovery' + (', and open-menu map reload' if config.get('reload') else '') + ' passed.', flush=True)
    except Exception:
        diagnostic = await page.evaluate('window.MuzikazHouseExplorer?.snapshot() ?? null')
        print(world + ' diagnostics: ' + str(diagnostic) + '; errors=' + str(errors), flush=True)
        await page.screenshot(path='/tmp/facility-input-recovery-' + world + '.png')
        raise
    finally:
        await page.close()


async def main(worlds):
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='facility-input-recovery-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, service_workers='block', reduced_motion='reduce')
                    await context.add_init_script("Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4})")
                    for _ in range(150):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.1)
                    else:
                        raise AssertionError('Facility server did not start.')
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    for world in worlds:
                        await exercise(context, base, world)
                    await browser.close()
            except Exception:
                print('Facility server tail: ' + Path(directory, 'server.log').read_text()[-3500:], flush=True)
                raise
            finally:
                server.terminate()
                server.wait(timeout=15)


parser = argparse.ArgumentParser()
parser.add_argument('--world', action='append', choices=list(WORLDS))
args = parser.parse_args()
asyncio.run(main(args.world or list(WORLDS)))
