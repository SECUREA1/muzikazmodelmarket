"""Real login keeps movement/look controls separate from actions and menus.

No player relocation or synthetic activity state is used: authentication goes
through the visible sign-in form and movement must reach the room server.
"""
from pathlib import Path
import argparse
import json
import math
import os
import socket
import subprocess
import tempfile
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ARTIFACTS = ROOT.parent / 'scratch'
ARTIFACTS.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--world', action='append')
args = parser.parse_args()
worlds = args.world or ['ironwood-prison', 'public-commons']


def displacement(a, b):
    return math.hypot(a[0] - b[0], a[2] - b[2])


def state(page):
    return page.evaluate('MuzikazHouseExplorer.snapshot()')


def hold_stick(page, name, dx, dy, duration=1200, touch=False):
    stick = page.locator('[data-thumbstick="' + name + '"] .thumbstick-base').first
    stick.wait_for(state='visible')
    box = stick.bounding_box()
    assert box and box['width'] > 0 and box['height'] > 0
    x = box['x'] + box['width'] * (.5 + dx * .35)
    y = box['y'] + box['height'] * (.5 + dy * .35)
    if touch:
        cdp = page.context.new_cdp_session(page)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'id': 1, 'x': x, 'y': y}]})
        try:
            page.wait_for_timeout(duration)
        finally:
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            cdp.detach()
    else:
        page.mouse.move(x, y)
        page.mouse.down()
        try:
            page.wait_for_timeout(duration)
        finally:
            page.mouse.up()
    page.wait_for_timeout(180)


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = 'http://127.0.0.1:' + str(port)
with tempfile.TemporaryDirectory(prefix='login-control-isolation-') as directory:
    env = {**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}
    for variable, filename in [
        ('MUZIKAZ_USER_DATABASE_FILE', 'users.json'),
        ('MUZIKAZ_ACCOUNTS_FILE', 'accounts.json'),
        ('MUZIKAZ_ACCOUNT_SESSIONS_FILE', 'account-sessions.json'),
        ('MUZIKAZ_GAME_SESSIONS_FILE', 'game-sessions.json'),
    ]:
        env[variable] = str(Path(directory) / filename)
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env=env, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, service_workers='block', reduced_motion='reduce')
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError('Local game server did not start: ' + Path(directory, 'server.log').read_text()[-3000:])
                    context.close()
                    reports = []
                    for index, world in enumerate(worlds):
                        context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, service_workers='block', reduced_motion='reduce')
                        page = context.new_page()
                        errors, commands, authentications = [], [], []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        def record(request):
                            if request.method != 'POST':
                                return
                            if '/api/access/' in request.url:
                                authentications.append(request.url.rsplit('/', 1)[-1])
                            if '/gameplay' in request.url:
                                commands.append(request.post_data_json or {})
                        page.on('request', record)
                        page.route('https://**/*', lambda route: route.abort())
                        try:
                            page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                            access = page.get_by_role('dialog', name='Choose how to play', exact=True)
                            access.wait_for(state='visible', timeout=90000)
                            access.get_by_label('Username', exact=True).fill('ControlIsolationTester' + str(index))
                            access.get_by_label('Password', exact=True).fill('local-regression-password')
                            access.get_by_role('button', name='Sign in and continue', exact=True).click()
                            access.wait_for(state='hidden', timeout=90000)
                            page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=120000)
                            assert authentications == ['free-play'], authentications
                            assert not state(page)['player']['inputBlocked'], state(page)
                            assert page.locator('dialog[open]').count() == 0

                            # A press on the movement pad is never Use, Shoot, or
                            # a menu toggle. Verify both desktop and touch input.
                            before = state(page)['player']['position']
                            start = len(commands)
                            hold_stick(page, 'left', 0, -1, touch=False)
                            assert page.locator('dialog[open]').count() == 0, (world, 'Movement opened a menu', page.locator('dialog[open]').evaluate_all('(nodes)=>nodes.map(n=>({label:n.getAttribute("aria-label"),className:n.className}))'))
                            assert not state(page)['player']['inputBlocked'], state(page)
                            after = state(page)['player']['position']
                            assert displacement(before, after) > .2, (world, 'Mouse hold did not move forward', before, after)
                            sent = commands[start:]
                            assert any(row.get('action') == 'input' and row.get('input', {}).get('forward', 0) > .1 for row in sent), sent
                            assert not any(row.get('action') in ['fire', 'prison-action', 'interact'] for row in sent), sent
                            if world == 'ironwood-prison':
                                # We walked into intake's reach. E remains an
                                # explicit interaction after pads become movement-only.
                                page.keyboard.press('e')
                                panel = page.locator('#ironwood-prison-panel')
                                panel.wait_for(state='visible')
                                assert 'intake' in panel.locator('[data-station-title]').inner_text().casefold()
                                panel.locator('[data-close]').click()
                                panel.wait_for(state='hidden')

                            before = state(page)['player']['position']
                            start = len(commands)
                            hold_stick(page, 'left', 1, 0, touch=True)
                            assert page.locator('dialog[open]').count() == 0, (world, 'Touch movement opened a menu')
                            assert displacement(before, state(page)['player']['position']) > .2, (world, 'Touch hold did not move')
                            assert not any(row.get('action') in ['fire', 'prison-action', 'interact'] for row in commands[start:]), commands[start:]

                            # Releasing a centered pad press must also remain
                            # neutral: no delayed click, action, or modal opening.
                            start = len(commands)
                            hold_stick(page, 'left', 0, 0, duration=140, touch=True)
                            assert page.locator('dialog[open]').count() == 0, (world, 'Center touch opened a menu')
                            assert not any(row.get('action') in ['fire', 'prison-action', 'interact'] for row in commands[start:]), commands[start:]

                            # Looking around should never make the avatar jump.
                            start = len(commands)
                            yaw = state(page)['player']['yaw']
                            hold_stick(page, 'right', 1, 0, duration=600, touch=True)
                            assert page.locator('dialog[open]').count() == 0
                            assert abs(state(page)['player']['yaw'] - yaw) > .05, (world, 'Look control did not turn')
                            assert not any(row.get('action') == 'input' and row.get('input', {}).get('jump') for row in commands[start:]), commands[start:]

                            # Jump has its own explicit button; mouse/touch and
                            # accessible keyboard activation must retain the action.
                            jump_button = page.get_by_role('button', name='Jump', exact=True)
                            for keyboard in [False, True]:
                                page.wait_for_function('MuzikazHouseExplorer.snapshot().player.serverGrounded', timeout=20000)
                                page.evaluate('''() => {
                                    window.controlJumpHeights=[];window.controlJumpWatching=true;
                                    const frame=()=>{if(!controlJumpWatching)return;controlJumpHeights.push(MuzikazHouseExplorer.snapshot().player.position[1]);requestAnimationFrame(frame);};requestAnimationFrame(frame);
                                }''')
                                start = len(commands)
                                if keyboard:
                                    jump_button.focus()
                                    page.keyboard.press('Enter')
                                else:
                                    jump_button.tap()
                                page.wait_for_timeout(1350)
                                heights = page.evaluate('()=>{controlJumpWatching=false;return controlJumpHeights;}')
                                assert heights and max(heights)-min(heights) > .15, (world, 'Explicit Jump did not produce an arc', keyboard, heights)
                                assert any(row.get('action') == 'input' and row.get('input', {}).get('jump') for row in commands[start:]), (world, 'Explicit Jump did not reach server')
                                assert page.locator('dialog[open]').count() == 0

                            # After using and closing an explicit menu, fresh W
                            # must still move instead of activating its focused button.
                            if world == 'ironwood-prison':
                                trigger = page.get_by_role('button', name='Open Ironwood prison activities', exact=True)
                                if not trigger.is_visible():
                                    page.get_by_role('button', name='More view controls', exact=True).click()
                                trigger.click()
                                panel = page.locator('#ironwood-prison-panel')
                                panel.wait_for(state='visible')
                                panel.locator('[data-close]').click()
                                panel.wait_for(state='hidden')
                                before = state(page)['player']['position']
                                page.keyboard.down('w')
                                page.wait_for_timeout(750)
                                page.keyboard.up('w')
                                assert page.locator('dialog[open]').count() == 0
                                assert displacement(before, state(page)['player']['position']) > .1, (world, 'Movement stayed blocked after closing menu')
                            assert not errors, errors
                            reports.append({'world': world, 'passed': True, 'realMemberLogin': True, 'mouseForward': True, 'touchMovement': True, 'centerNeutral': True, 'lookWithoutJump': True, 'explicitJumpTouchAndEnter': True})
                            print(json.dumps(reports[-1]), flush=True)
                        except Exception:
                            page.screenshot(path=str(ARTIFACTS / ('login-control-isolation-' + world + '.png')))
                            print(json.dumps({'world': world, 'player': state(page).get('player'), 'ready': state(page).get('controlsReady'), 'dialogs': page.locator('dialog[open]').evaluate_all('(nodes)=>nodes.map(n=>({label:n.getAttribute("aria-label"),className:n.className}))'), 'commands': commands[-15:], 'errors': errors}), flush=True)
                            raise
                        finally:
                            context.close()
                    (ARTIFACTS / 'login-control-isolation.json').write_text(json.dumps(reports, indent=2))
                finally:
                    browser.close()
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
