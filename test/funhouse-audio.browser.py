"""Real Chromium audio samples for clown voices, effects and original ride music.

This checks the production Web Audio engine and repository voice recordings.
It does not require, or claim testing on, physical VR headset hardware.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
import json
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
WORLD = 'muzikaz-clown-funhouse'


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def live_check(browser):
    """Exercise real Explorer hooks, room boarding and the visible sound controls."""
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='funhouse-audio-live-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            process = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT, env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            context = browser.new_context(service_workers='block', viewport={'width': 1000, 'height': 760}, reduced_motion='reduce', has_touch=True)
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
                    raise AssertionError('Game server did not start.')
                assert context.request.post(base + '/api/access/guest', data={}).status == 201
                csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']

                # Use an ordinary supported preference to keep unrelated map
                # narration out of this focused clown-audio check.
                page.route('**/api/player/settings', lambda route: route.fulfill(status=200, json={'ok': True, 'data': {'owner_id': 'audio-browser-fixture', 'settings': {'introductionMuted': True, 'announcementsMuted': True, 'dialogueMuted': False}}}))
                page.route('https://**/*', lambda route: route.abort())
                page.goto(base + '/model-explorer.html?environment=' + WORLD + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio', timeout=90000)
                page.get_by_role('button', name='Clown audio settings', exact=True).click()
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.unlocked')
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.voicePlaying || window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.caption', timeout=15000)
                popover = page.locator('.funhouse-audio-popover')
                popover.wait_for(state='visible')
                popover.locator('[data-funhouse-audio-mute="voice"]').click()
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.settings.voiceMuted && !window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.voicePlaying')
                page.get_by_role('button', name='Clown audio settings', exact=True).click()
                response = context.request.post(base + '/api/rooms/' + WORLD + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': 'map-access', 'requestId': str(uuid.uuid4()), 'position': {'x': 24, 'y': .02, 'z': 28}})
                assert response.ok, response.text()
                page.wait_for_function('(()=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-24,p[2]-28)<1.5})()', timeout=15000)
                page.locator('#house-explorer-canvas').focus()
                page.keyboard.press('e')
                panel = page.locator('.funhouse-dialog[open] #clown-funhouse-panel')
                panel.wait_for(state='visible')
                panel.locator('[data-funhouse-board]').click()
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.musicActive', timeout=10000)
                before = page.evaluate('window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.counts.effects')
                page.locator('#house-explorer-canvas').focus()
                page.keyboard.press('h')
                page.wait_for_function('(before)=>window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.counts.effects>before', arg=before, timeout=10000)
                page.get_by_role('button', name='Clown audio settings', exact=True).click()
                popover.wait_for(state='visible')
                popover.locator('[data-funhouse-audio-mute="music"]').click()
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.settings.musicMuted && !window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.musicActive')
                popover.locator('[data-funhouse-audio-mute="music"]').click()
                popover.get_by_role('button', name='Preview scary car music', exact=True).click()
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio.musicActive', timeout=10000)
                page.evaluate('window.dispatchEvent(new Event("blur"))')
                page.wait_for_function('(()=>{const a=window.MuzikazHouseExplorer.snapshot().funhouseExperience.audio;return a.paused&&!a.unlocked&&!a.musicActive&&!a.voicePlaying})()')
                assert not errors, errors
                print('Live Explorer audio: gesture unlock, recorded clown caption, voice mute, real car boarding/horn/music, music mute and blur/session cleanup pass.', flush=True)
            except Exception:
                try:
                    page.screenshot(path=str(ROOT.parent / 'scratch' / 'funhouse-audio-live-failure.png'), timeout=15000)
                except Exception:
                    pass
                raise
            finally:
                context.close()
                process.terminate()
                process.wait(timeout=15)


parser = argparse.ArgumentParser()
parser.add_argument('--live', action='store_true', help='Also check the built Explorer and real shared room; run npm run build first.')
parser.add_argument('--live-only', action='store_true', help='Run only the built Explorer/room integration.')
arguments = parser.parse_args()
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        if not arguments.live_only:
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/funhouse-audio.html')
            page.wait_for_function('window.ready', timeout=15000)
            page.get_by_role('button', name='Run funhouse audio check', exact=True).click()
            page.wait_for_function('window.audioReport || window.audioError', timeout=45000)
            assert not page.evaluate('window.audioError'), page.evaluate('window.audioError')
            report = page.evaluate('window.audioReport')
            assert report and len(report['checks']) >= 10, report
            assert report['effectPeak'] > .00001 and report['musicPeak'] > .00001 and report['voicePeak'] > .00001, report
            assert report['voiceDuration'] > .5 and report['created']['buffers'] > 0, report
            assert not errors, errors
            print(json.dumps(report))
            page.get_by_role('button', name='Run world audio lifecycle check', exact=True).click()
            page.wait_for_function('window.controllerReport || window.controllerError', timeout=45000)
            assert not page.evaluate('window.controllerError'), page.evaluate('window.controllerError')
            controller = page.evaluate('window.controllerReport')
            assert controller and len(controller['checks']) >= 5, controller
            assert controller['replayPeak'] > .00001 and controller['carPeak'] > .00001, controller
            assert not errors, errors
            print(json.dumps(controller))
            page.close()
        if arguments.live or arguments.live_only:
            live_check(browser)
        browser.close()
finally:
    server.shutdown()
