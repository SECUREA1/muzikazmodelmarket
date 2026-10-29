"""Night Watch: real authored scene rays, XR input, audio and live house walking.

The XR fixture checks controller logic with production scene geometry. It does
not claim testing on a physical headset. --live also checks the built Explorer
and a real authoritative room; run npm run build before using that option.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import socket
import subprocess
import tempfile
from threading import Thread
import time
import uuid

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT.parent / 'scratch'
WORLD = 'muzikaz-clown-funhouse'
WARDS = ['nursery-lantern', 'clockwork-lantern', 'mirror-lantern', 'portrait-lantern']


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def fixture_checks(browser):
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/funhouse-haunt.html')
        page.wait_for_function('window.ready', timeout=20000)
        report = page.evaluate('sceneReport()')
        assert len(report['controls']) == 5 and len(report['markers']) == 5, report
        page.evaluate("pressControl('start')")
        page.wait_for_function("vr.snapshot().haunt?.status==='active' && !vr.snapshot().pending")
        assert page.evaluate("commands.length===1 && commands[0].action==='funhouse-haunt' && commands[0].operation==='start'")
        for index, ward in enumerate(WARDS):
            page.evaluate('(index)=>visit(index)', index)
            report = page.evaluate('sceneReport()')
            assert any(marker['wardId'] == ward and marker['lit'] for marker in report['markers']), report
            hand = index % 2
            page.evaluate('(args)=>{release(args.hand);return pressControl("seal",args.ward,args.hand)}', {'hand': hand, 'ward': ward})
            page.wait_for_function('(index)=>vr.snapshot().haunt?.wardIndex===index && !vr.snapshot().pending', arg=index + 1)
            assert page.evaluate('commands.at(-1).wardId') == ward
            before = page.evaluate('commands.length')
            page.evaluate('(hand)=>rawTrigger(hand)', hand)
            assert page.evaluate('commands.length') == before, 'held trigger replayed a lantern seal'
            report = page.evaluate('sceneReport()')
            assert any(marker['wardId'] == ward and marker['sealed'] for marker in report['markers']), report
        assert page.evaluate("vr.snapshot().haunt.status==='complete'")
        assert page.evaluate('sceneReport().reveal'), 'final authored clown reveal did not appear'
        assert not page.evaluate('expireReveal().reveal'), 'old completion kept the final reveal visible'
        assert page.evaluate('combatCalls') == 0, 'a haunted control fell through to combat input'
        page.evaluate("release();release(0);visit('start');runMenu('funhouse:haunt-start')")
        page.wait_for_function("vr.snapshot().haunt?.status==='active' && !vr.snapshot().pending")
        page.evaluate("runMenu('funhouse:haunt-stop')")
        page.wait_for_function("vr.snapshot().haunt?.status==='cancelled' && !vr.snapshot().pending")
        page.evaluate('vr.setVisible(true);finishSession()')
        assert page.evaluate('!vr.snapshot().visible && vr.snapshot().haunt===null'), 'session exit retained the watch board'
        page.get_by_role('button', name='Check haunted sound effects', exact=True).click()
        page.wait_for_function('window.audioReport || window.audioError', timeout=20000)
        assert not page.evaluate('window.audioError'), page.evaluate('window.audioError')
        audio = page.evaluate('window.audioReport')
        assert len(audio['peaks']) == 6, audio
        assert not errors, errors
        print(json.dumps({'scene': 'physical start and four ordered lanterns, either XR controller, trigger deduplication, seals, final reveal, menu stop and session cleanup pass', 'audio': audio}), flush=True)
    finally:
        page.close()
        server.shutdown()


def live_checks(browser):
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='funhouse-haunt-live-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            process = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT, env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            context = browser.new_context(service_workers='block', viewport={'width': 1200, 'height': 800}, reduced_motion='reduce', has_touch=True)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            try:
                for _ in range(100):
                    try:
                        if context.request.get(base + '/api/health', timeout=1000).ok:
                            break
                    except Exception:
                        time.sleep(.1)
                else:
                    raise AssertionError('Night Watch game server did not start.')
                assert context.request.post(base + '/api/access/guest', data={}).status == 201
                csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']

                def command(action, **fields):
                    response = context.request.post(base + '/api/rooms/' + WORLD + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                    assert response.ok, (action, response.status, response.text())
                    return response.json()['data']

                def self_state():
                    value = command('input', input={})
                    return value['players'][value['selfId']]

                def snapshot():
                    return page.evaluate('window.MuzikazHouseExplorer.snapshot()')

                page.route('https://**/*', lambda route: route.abort())
                page.route('**/api/player/settings', lambda route: route.fulfill(status=200, json={'ok': True, 'data': {'owner_id': 'haunt-browser-fixture', 'settings': {'introductionMuted': True, 'announcementsMuted': True}}}))
                page.goto(base + '/model-explorer.html?environment=' + WORLD + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                canvas = page.locator('#house-explorer-canvas')
                command('map-access', position={'x': 0, 'z': -15.5})
                page.wait_for_function('(()=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0],p[2]+15.5)<1.5})()', timeout=15000)
                canvas.focus()
                page.keyboard.press('e')
                panel = page.locator('.funhouse-dialog[open] #clown-funhouse-panel')
                panel.wait_for(state='visible')
                panel.locator('[data-funhouse-haunt-start]').click()
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouse?.haunt?.status==="active"', timeout=10000)
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().cameraMode==="first-person"', timeout=10000)
                hud = page.locator('.funhouse-haunt-hud')
                hud.wait_for(state='visible')
                initial_score = self_state()['score']

                def look(yaw):
                    view = snapshot()['player']
                    delta = math.atan2(math.sin(view['yaw'] - yaw), math.cos(view['yaw'] - yaw))
                    box = canvas.bounding_box()
                    start = None
                    for x_fraction, y_fraction in [(.82, .38), (.72, .45), (.55, .4), (.9, .5)]:
                        candidate = {'x': box['x'] + box['width'] * x_fraction, 'y': box['y'] + box['height'] * y_fraction}
                        if page.evaluate('(p)=>document.elementFromPoint(p.x,p.y)?.id==="house-explorer-canvas"', candidate):
                            start = candidate
                            break
                    assert start, 'the haunted game left no clear drag-to-look area'
                    page.mouse.move(start['x'], start['y'])
                    page.mouse.down()
                    page.mouse.move(start['x'] + delta / .006, start['y'] + view['pitch'] / .005, steps=2)
                    page.mouse.up()
                    page.wait_for_function('(yaw)=>{const p=window.MuzikazHouseExplorer.snapshot().player;return Math.abs(Math.atan2(Math.sin(p.yaw-yaw),Math.cos(p.yaw-yaw)))<.04}', arg=yaw, timeout=10000)

                def walk_to(x, z, radius=1.2):
                    before = snapshot()['player']['position']
                    if math.hypot(before[0] - x, before[2] - z) <= radius:
                        return
                    look(math.atan2(-(x - before[0]), -(z - before[2])))
                    canvas.focus()
                    page.keyboard.down('Shift')
                    page.keyboard.down('w')
                    try:
                        page.wait_for_function('(target)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;if(Math.hypot(p[0]-target.x,p[2]-target.z)>target.radius)return false;for(const key of ["w","Shift"])window.dispatchEvent(new KeyboardEvent("keyup",{key,bubbles:true}));return true}', arg={'x': x, 'z': z, 'radius': radius}, polling=30, timeout=20000)
                    finally:
                        page.keyboard.up('w')
                        page.keyboard.up('Shift')

                routes = [
                    [(19, -15.5)],
                    [(5, -17), (5, -38.2)],
                    [(0, -18), (-4.8, -18), (-4.8, -28), (-22, -28), (-22, -38), (-18, -38)],
                    [(-22, -38), (-22, -28), (-4.8, -28), (-4.8, -19), (-20, -17)],
                ]
                for index, route in enumerate(routes):
                    for x, z in route:
                        walk_to(x, z, .35 if x in [-4.8, -22] else 1.0)
                    hud.locator('[data-funhouse-haunt-seal]').wait_for(state='visible')
                    page.wait_for_function('!document.querySelector("[data-funhouse-haunt-seal]").disabled', timeout=10000)
                    if index == 0:
                        canvas.focus()
                        page.keyboard.press('f')
                    else:
                        hud.locator('[data-funhouse-haunt-seal]').click()
                    page.wait_for_function('(index)=>window.MuzikazHouseExplorer.snapshot().funhouse?.haunt?.wardIndex===index', arg=index + 1, timeout=10000)
                    own = self_state()
                    assert own['funhouse']['haunt']['sealed'] == WARDS[:index + 1], own['funhouse']['haunt']
                    if index < 3:
                        assert own['score'] == initial_score, 'the unfinished watch awarded spendable round points'
                own = self_state()
                result = own['funhouse']['haunt']
                assert result['status'] == 'complete' and result['settled'] is True, result
                assert 140 <= result['score'] <= 200 and own['score'] == initial_score + result['score'], own
                assert own['funhouse']['bestScores']['haunt'] == result['score'], own
                ARTIFACTS.mkdir(exist_ok=True)
                page.screenshot(path=str(ARTIFACTS / 'funhouse-night-watch-complete.png'), timeout=20000)
                command('map-access', position={'x': 0, 'z': -15.5})
                page.wait_for_function('(()=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0],p[2]+15.5)<1.5})()', timeout=15000)
                hud.locator('[data-funhouse-haunt-replay]').click()
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouse?.haunt?.status==="active"', timeout=10000)
                canvas.focus()
                page.keyboard.press('Escape')
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouse?.haunt?.status==="cancelled"', timeout=10000)
                assert self_state()['score'] == own['score'], 'stopping the replay awarded a second round'
                assert not errors, errors
                print(json.dumps({'live': 'lobby E start, on-foot path through four wards and maze gaps, F and touch seals, authoritative completion-only score, personal best, replay and Escape stop pass', 'result': result}), flush=True)
            except Exception:
                ARTIFACTS.mkdir(exist_ok=True)
                try:
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-night-watch-failure.png'), timeout=15000)
                    print(json.dumps(page.evaluate('(()=>{const s=window.MuzikazHouseExplorer?.snapshot();return {player:s?.player,haunt:s?.funhouse?.haunt,status:document.querySelector("#house-status")?.textContent}})()')), flush=True)
                except Exception:
                    pass
                raise
            finally:
                context.close()
                process.terminate()
                process.wait(timeout=15)


parser = argparse.ArgumentParser()
parser.add_argument('--live', action='store_true', help='Also exercise the built Explorer and real room.')
parser.add_argument('--live-only', action='store_true', help='Only exercise the built Explorer and real room.')
arguments = parser.parse_args()
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    try:
        if not arguments.live_only:
            fixture_checks(browser)
        if arguments.live or arguments.live_only:
            live_checks(browser)
    finally:
        browser.close()
