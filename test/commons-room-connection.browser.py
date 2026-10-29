"""Commons accepts a slow, valid session lookup and join, then remains playable."""
import asyncio
import math
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time

from playwright.async_api import async_playwright


ROOT = Path(__file__).resolve().parents[1]
READY = """() => {
    const state=window.MuzikazHouseExplorer?.snapshot();
    return state?.roomId==='public-commons' && state.serverHostedRoom &&
        state.serverReady && state.gameplayStarted && state.controlsReady;
}"""


async def main():
    os.chdir(ROOT)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='commons-room-connection-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={
                **os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory,
                'MUZIKAZ_STATIC_SOURCE': 'repository',
            }, stdout=log, stderr=log)
            try:
                async with async_playwright() as playwright:
                    browser = await playwright.chromium.launch(
                        executable_path='/usr/bin/chromium', headless=True,
                        args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = await browser.new_context(
                        viewport={'width': 1100, 'height': 800},
                        service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(60):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    else:
                        raise AssertionError('Test server did not start.')
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    page = await context.new_page()
                    errors, replies, session_delays, join_delays = [], [], [], []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    await page.route('https://**/*', lambda route: route.abort())
                    slow_startup = True
                    initial_join = True

                    async def session_route(route):
                        started = time.monotonic()
                        response = await route.fetch()
                        if slow_startup:
                            # Each lookup stays inside its 8-second request budget.
                            await asyncio.sleep(max(0, 6 - (time.monotonic() - started)))
                            session_delays.append(time.monotonic() - started)
                        await route.fulfill(response=response)

                    async def gameplay_route(route):
                        nonlocal initial_join
                        command = route.request.post_data_json
                        started = time.monotonic()
                        delayed = command.get('action') == 'join' and initial_join
                        if delayed:
                            initial_join = False
                        response = await route.fetch()
                        payload = await response.json()
                        state = payload.get('data') or {}
                        own_player = state.get('players', {}).get(state.get('selfId'))
                        replies.append({'command': command, 'status': response.status,
                                        'player': own_player})
                        if delayed:
                            assert response.ok and own_player, payload
                            # Session + join exceed the former 30-second readiness
                            # deadline, though this join meets its 25-second budget.
                            # Its server presence also ages past the 15-second lease.
                            await asyncio.sleep(max(0, 24 - (time.monotonic() - started)))
                            join_delays.append(time.monotonic() - started)
                        await route.fulfill(response=response)

                    await page.route('**/api/game/room-session', session_route)
                    await page.route('**/api/rooms/public-commons/gameplay', gameplay_route)
                    await page.goto(base + '/model-explorer.html?environment=public-commons&autoplay=1&mode=solo',
                                    wait_until='domcontentloaded', timeout=60000)
                    await page.wait_for_function(READY, timeout=90000)
                    assert session_delays and join_delays, 'The slow startup was not exercised.'
                    assert min(session_delays) >= 5.9 and join_delays[0] >= 23.9
                    await page.locator('#house-explorer-canvas').focus()
                    baseline = next(row['player']['position'] for row in reversed(replies)
                                    if row['player'])
                    first_input = len(replies)
                    await page.keyboard.down('w')
                    try:
                        deadline = time.monotonic() + 20
                        while time.monotonic() < deadline:
                            moved = any(
                                row['status'] == 200 and row['player'] and
                                row['command'].get('action') == 'input' and
                                row['command'].get('input', {}).get('forward', 0) > .1 and
                                row['player'].get('input', {}).get('forward', 0) > .1 and
                                math.hypot(row['player']['position']['x'] - baseline['x'],
                                           row['player']['position']['z'] - baseline['z']) > .1
                                for row in replies[first_input:])
                            if moved:
                                break
                            await asyncio.sleep(.1)
                        else:
                            raise AssertionError('The accepted room did not apply walking input after the delayed join.')
                    finally:
                        await page.keyboard.up('w')
                    await page.wait_for_function(READY, timeout=20000)
                    slow_startup = False
                    await page.reload(wait_until='domcontentloaded', timeout=60000)
                    await page.wait_for_function(READY, timeout=60000)
                    assert not errors, errors
                    await browser.close()
                    print('Commons slow session + join, server-confirmed walking, and normal reload passed.', flush=True)
            finally:
                server.terminate()
                server.wait(timeout=15)


asyncio.run(main())
