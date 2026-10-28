"""Exercise corrupt browser caches and clean module retries against the real game.

Run after npm run build. Optional --baseline-engine supplies a previous engine
source file to demonstrate the old malformed-HUD startup failure first.
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
from urllib.parse import urlencode, urlsplit, parse_qs
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]


def poison_script(array_value):
    values = {
        'muzikazRadToxHiddenRows': array_value,
        'muzikazRadToxBackpack': array_value,
        'muzikazActiveBackpackItems': array_value,
        'muzikazConsumedBackpackItems': array_value,
        'muzikazUnlockedAttachmentLoot': array_value,
        'muzikazPermanentLandObjects': array_value,
        'muzikazCustomGamePlacements': array_value,
        'muzikazDesignatedAvatar': 'undefined',
        'muzikazLandClaims': '[]',
        'muzikaz.range.records.v1': 'null',
    }
    return '''(() => {
      if (!sessionStorage.getItem('startup-cache-poisoned')) {
        for (const [key, value] of Object.entries(%s)) localStorage.setItem(key, value);
        sessionStorage.setItem('startup-cache-poisoned', '1');
      }
      window.startupDocumentTime = performance.timeOrigin;
      window.startupStages = [];
      for (const name of ['muzikaz:rad-tox-engine-ready', 'muzikaz:gameplay-ready', 'muzikaz:rad-tox-native-error'])
        document.addEventListener(name, event => startupStages.push({name, detail:event.detail}));
    })();''' % json.dumps(values)


async def ready(page, world):
    await page.wait_for_function('''world => {
      const state = window.MuzikazHouseExplorer?.snapshot();
      return state?.gameplayStarted && state.controlsReady &&
        (!state.serverHostedRoom || state.serverReady) && state.roomId === world;
    }''', arg=world, timeout=90000)
    state = await page.evaluate('MuzikazHouseExplorer.snapshot()')
    assert not state['player']['inputBlocked'], 'Startup left a blocking gameplay overlay.'
    assert await page.locator('#house-explorer-canvas').count() == 1, 'Startup duplicated the canvas.'
    return state


async def walk(page):
    start = await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
    greatest = 0
    # A valid spawn can face a wall; allow every ordinary walking direction.
    for key in ['w', 's', 'a', 'd']:
        await page.keyboard.down(key)
        try:
            await page.wait_for_timeout(1200)
        finally:
            await page.keyboard.up(key)
        end = await page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
        greatest = max(greatest, math.hypot(end[0] - start[0], end[2] - start[2]))
        if greatest > .15:
            break
    assert greatest > .15, 'Game became ready but ordinary keyboard input did not move the player.'
    return round(greatest, 3)


async def exercise(browser, base, *, name, world, mode, cache_value='undefined', fail_import=False, baseline=None):
    context = await browser.new_context(viewport={'width': 800, 'height': 600},
                                        reduced_motion='reduce', service_workers='block')
    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
    page = await context.new_page()
    errors, shader_errors, failed_modules = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: shader_errors.append(message.text)
            if message.type == 'error' and ('THREE.WebGLProgram' in message.text or 'VALIDATE_STATUS' in message.text) else None)
    page.on('requestfailed', lambda request: failed_modules.append(request.url)
            if '/public/' in request.url and '.js' in request.url else None)
    await page.route('https://**/*', lambda route: route.abort())
    await page.add_init_script(poison_script(cache_value))
    engine_requests = 0

    async def engine_route(route):
        nonlocal engine_requests
        engine_requests += 1
        if baseline:
            await route.fulfill(content_type='application/javascript', body=baseline.read_text())
        elif fail_import and engine_requests == 1:
            await route.abort('failed')
        else:
            await route.continue_()

    await page.route('**/public/js/house-explorer-glb.js*', engine_route)
    url = base + '/model-explorer.html?' + urlencode({'environment': world, 'mode': mode, 'autoplay': '1'}) + '#startup-check'
    started = time.monotonic()
    try:
        await page.goto(url, wait_until='domcontentloaded', timeout=60000)
        if baseline:
            await page.wait_for_function("document.querySelector('[data-house-start]')?.textContent === 'Try again'", timeout=30000)
            status = await page.locator('#house-game-load-status').inner_text()
            assert 'JSON' in status or 'Unexpected token' in status, status
            return {'case': name, 'reproduced': True, 'status': status}
        if fail_import:
            await page.wait_for_function("document.querySelector('[data-house-start]')?.textContent === 'Try again'", timeout=30000)
            initial_document = await page.evaluate('startupDocumentTime')
            await page.locator('[data-house-start]').click()
            await page.wait_for_function('previous => window.startupDocumentTime && startupDocumentTime !== previous', arg=initial_document, timeout=30000)
            selected = urlsplit(page.url)
            assert parse_qs(selected.query)['environment'] == [world]
            assert parse_qs(selected.query)['mode'] == [mode]
            assert selected.fragment == 'startup-check'
        state = await ready(page, world)
        assert state['serverHostedRoom'] == (mode == 'multiplayer'), {'mode': mode, 'serverHosted': state['serverHostedRoom']}
        displacement = await walk(page)
        assert not errors, errors
        assert not shader_errors, shader_errors
        assert len(failed_modules) == (1 if fail_import else 0), failed_modules
        assert engine_requests == (2 if fail_import else 1), engine_requests
        return {'case': name, 'world': world, 'mode': mode, 'passed': True,
                'movementMetres': displacement, 'engineRequests': engine_requests,
                'elapsedSeconds': round(time.monotonic() - started, 2)}
    except Exception:
        diagnostic = await page.evaluate('''() => ({url:location.href,
          status:document.querySelector('#house-game-load-status')?.textContent,
          worldStatus:document.querySelector('#house-status')?.textContent,
          stages:window.startupStages,
          state:(() => {const s=window.MuzikazHouseExplorer?.snapshot();return s && {
            roomId:s.roomId,gameplayStarted:s.gameplayStarted,controlsReady:s.controlsReady,
            serverReady:s.serverReady,serverHostedRoom:s.serverHostedRoom,player:s.player};})()})''')
        print(json.dumps({'case': name, 'diagnostic': diagnostic, 'errors': errors,
                          'shaderErrors': shader_errors, 'failedModules': failed_modules}), flush=True)
        raise
    finally:
        await context.close()


async def main(args):
    os.chdir(ROOT)
    assert (ROOT / 'dist/public/js/game-storage.js').exists(), 'Run npm run build before this browser test.'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='game-startup-recovery-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                                      args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    base = f'http://127.0.0.1:{port}'
                    request = await p.request.new_context()
                    for _ in range(100):
                        try:
                            if (await request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.1)
                    await request.dispose()
                    results = []
                    if args.baseline_engine:
                        results.append(await exercise(browser, base, name='baseline-invalid-cache', world='muzikaz-airport', mode='solo', baseline=args.baseline_engine))
                        print(json.dumps(results[-1]), flush=True)
                        Path(args.report).write_text(json.dumps(results, indent=2))
                    for settings in [
                        {'name': 'malformed-json-solo', 'world': 'studio-ridge-in', 'mode': 'solo'},
                        {'name': 'wrong-array-shapes-multiplayer', 'world': 'muzikaz-casino', 'mode': 'multiplayer', 'cache_value': '{}'},
                        {'name': 'failed-module-clean-retry', 'world': 'muzikaz-airport', 'mode': 'multiplayer', 'fail_import': True},
                    ]:
                        if args.case and settings['name'] not in args.case:
                            continue
                        results.append(await exercise(browser, base, **settings))
                        print(json.dumps(results[-1]), flush=True)
                        Path(args.report).write_text(json.dumps(results, indent=2))
                    await browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)


parser = argparse.ArgumentParser()
parser.add_argument('--baseline-engine', type=Path)
parser.add_argument('--case', action='append', choices=['malformed-json-solo', 'wrong-array-shapes-multiplayer', 'failed-module-clean-retry'])
parser.add_argument('--report', default='/tmp/game-startup-recovery-results.json')
asyncio.run(main(parser.parse_args()))
