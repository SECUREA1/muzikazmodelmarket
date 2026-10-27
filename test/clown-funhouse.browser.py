"""Native clown funhouse: shared map, movement, attraction UI and timed splashes.

Station travel uses the existing validated local-map command. Scores and
costumes are read from the live room; the test never edits player state.
"""
import json
import math
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import uuid
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ARTIFACTS = ROOT.parent / 'scratch'
ARTIFACTS.mkdir(exist_ok=True)
WORLD = 'muzikaz-clown-funhouse'
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='funhouse-browser-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(service_workers='block', viewport={'width': 1280, 'height': 900}, reduced_motion='reduce', has_touch=True)
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError('Funhouse server did not start: ' + Path(directory, 'server.log').read_text()[-2000:])
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']
                    def command(action, **fields):
                        response = context.request.post(base + '/api/rooms/' + WORLD + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                        assert response.ok, (action, response.status, response.text())
                        return response.json()['data']
                    directory_response = context.request.get(base + '/api/environments').json()['data']
                    worlds = directory_response if isinstance(directory_response, list) else directory_response.get('environments', [])
                    world = next(row for row in worlds if row['id'] == WORLD)
                    assert world['permanent'] and world['playable'] and world['multiplayer']
                    assert any(place['name'] == 'Water-Gun Gallery' for place in world['builderScene']['layoutMeta']['locations'])
                    # Touch capability selects the existing performance renderer on SwiftShader.
                    # The viewport still exercises the desktop layout before mobile resize.
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/model-explorer.html?environment=' + WORLD + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && window.MuzikazHouseExplorer.snapshot().serverReady || document.querySelector("[data-house-start]")?.textContent === "Try again"', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=30000)
                    snapshot = page.evaluate('window.MuzikazHouseExplorer.snapshot()')
                    assert snapshot['roomId'] == WORLD and snapshot['serverPlayerInitialized'], snapshot
                    assert not snapshot['world']['slimeFloor']
                    state = command('input', input={})
                    assert not state.get('radTox')
                    assert not any(actor.get('loot') or actor.get('roadFleet') for actor in state['actors'].values())
                    canvas = page.locator('#house-explorer-canvas')
                    canvas.scroll_into_view_if_needed()
                    def walk():
                        canvas.focus()
                        before = page.evaluate('window.MuzikazHouseExplorer.snapshot().player.position')
                        page.keyboard.down('w')
                        try:
                            page.wait_for_function('(before)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-before[0],p[2]-before[2])>.3}', arg=before, timeout=15000)
                        finally:
                            page.keyboard.up('w')
                    walk()
                    print('Funhouse startup: native shared world, clear walking, no ambient combat', flush=True)
                    def travel(x, z):
                        result = command('map-access', position={'x': x, 'z': z})
                        position = result['players'][result['selfId']]['position']
                        assert math.hypot(position['x'] - x, position['z'] - z) < 1.5, position
                        page.wait_for_function('(target)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1.5}', arg=position, timeout=15000)
                        return result
                    panel = page.locator('.funhouse-dialog[open] #clown-funhouse-panel')
                    def open_panel(title):
                        page.wait_for_function('!document.querySelector(".funhouse-use").hidden', timeout=10000)
                        canvas.focus()
                        page.keyboard.press('e')
                        panel.wait_for(state='visible', timeout=10000)
                        assert title.lower() in panel.locator('[data-funhouse-title]').inner_text().lower(), panel.inner_text()
                    def close_panel():
                        panel.locator('[data-funhouse-close]').click()
                        page.locator('.funhouse-dialog[open]').wait_for(state='detached', timeout=10000)
                    travel(0, 40)
                    print('Funhouse arrival map travel passed', flush=True)
                    open_panel('Welcome')
                    assert panel.locator('.funhouse-directory article').count() == 6
                    print('Funhouse welcome E panel passed', flush=True)
                    close_panel()
                    page.locator('.district-map-toggle').click()
                    local_map = page.locator('.district-map-dialog')
                    local_map.wait_for(state='visible')
                    assert 'Water-Gun Gallery' in local_map.text_content()
                    assert 'Clown Car Court' in local_map.text_content()
                    local_map.get_by_role('button', name='Close', exact=True).click()
                    local_map.wait_for(state='hidden')
                    walk()
                    canvas.focus()
                    page.keyboard.press('v')
                    page.wait_for_function("window.MuzikazHouseExplorer.snapshot().cameraMode === 'top-down'")
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-midway.png'), timeout=20000)
                    print('Funhouse top-down screenshot saved', flush=True)
                    travel(-28, 34)
                    open_panel('Clown Dressing Room')
                    panel.locator('[data-funhouse-dress="hat"]').click()
                    page.wait_for_function('document.querySelector("[data-funhouse-dress=hat]")?.getAttribute("aria-pressed")==="true"', timeout=10000)
                    panel.locator('[data-funhouse-dress="shoes"]').click()
                    page.wait_for_function('document.querySelector("[data-funhouse-dress=shoes]")?.getAttribute("aria-pressed")==="true"', timeout=10000)
                    state = command('input', input={})
                    self_state = state['players'][state['selfId']]['funhouse']
                    assert self_state['costume'] == {'hat': True, 'shoes': True}
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseCostume.hat && window.MuzikazHouseExplorer.snapshot().funhouseCostume.shoes', timeout=10000)
                    assert 'funhouse-dressup' in self_state['stamps']
                    print('Funhouse costume wearing and actual meshes passed', flush=True)
                    close_panel()
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-costume.png'))
                    travel(24, 28)
                    open_panel('Impossible Clown Car')
                    panel.locator('[data-funhouse-use]').click()
                    page.wait_for_function('document.querySelector("[data-funhouse-message]")?.textContent.includes("HONK")', timeout=10000)
                    close_panel()
                    travel(-30, 12)
                    open_panel('Splash the Clowns')
                    print('Funhouse car effect and gallery E panel passed', flush=True)
                    panel.locator('[data-funhouse-start]').click()
                    page.wait_for_function('document.querySelectorAll(".funhouse-target.is-lit:not(:disabled)").length===1', timeout=10000)
                    for hit in range(3):
                        if hit == 0:
                            panel.locator('.funhouse-target.is-lit').click()
                        else:
                            target = int(panel.locator('.funhouse-target.is-lit').get_attribute('data-funhouse-target'))
                            page.keyboard.press(str(target + 1))
                        page.wait_for_function('(score)=>document.querySelector("[data-funhouse-score]")?.textContent===String(score)', arg=(hit + 1) * 10, timeout=10000)
                        # The water gun has a real server refill cooldown.
                        page.wait_for_timeout(400)
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-water-gallery.png'), timeout=20000)
                    print('Funhouse water target round scored 30 points', flush=True)
                    page.set_viewport_size({'width': 390, 'height': 844})
                    box = page.locator('.funhouse-dialog[open]').bounding_box()
                    assert box['x'] >= 0 and box['x'] + box['width'] <= 391, box
                    assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-water-mobile.png'))
                    page.wait_for_function('document.querySelector("[data-funhouse-time]")?.textContent==="FINISHED"', timeout=40000)
                    page.wait_for_function('document.querySelector("[data-funhouse-best]")?.textContent==="30"', timeout=10000)
                    state = command('input', input={})
                    self_state = state['players'][state['selfId']]['funhouse']
                    assert self_state['round']['status'] == 'complete' and self_state['bestScore'] == 30, self_state
                    assert 'funhouse-water-gallery' in self_state['stamps']
                    assert state['players'][state['selfId']]['score'] >= 30
                    panel.locator('[data-funhouse-start]').click()
                    page.wait_for_function('document.querySelectorAll(".funhouse-target.is-lit:not(:disabled)").length===1', timeout=10000)
                    # Local-map travel closes the old panel and cancels its round.
                    travel(0, 40)
                    page.locator('.funhouse-dialog[open]').wait_for(state='detached', timeout=10000)
                    state = command('input', input={})
                    assert state['players'][state['selfId']]['funhouse']['round']['status'] == 'cancelled'
                    page.set_viewport_size({'width': 1280, 'height': 900})
                    walk()
                    print('Funhouse UI: E prompts, costumes, clown car, desktop/mobile target play, timed best score, passport stamps and resumed movement passed.', flush=True)
                    assert not errors, errors
                except Exception:
                    if 'page' in locals():
                        try:
                            page.screenshot(path=str(ARTIFACTS / 'funhouse-failure.png'), timeout=15000)
                        except Exception as screenshot_error:
                            print('Failure screenshot unavailable: ' + str(screenshot_error), flush=True)
                        print(json.dumps(page.evaluate('(()=>{const s=window.MuzikazHouseExplorer?.snapshot();return {url:location.href,roomId:s?.roomId,player:s?.player,funhouse:s?.funhouse,funhouseCostume:s?.funhouseCostume,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.className),status:document.querySelector("#house-status")?.textContent}})()')), flush=True)
                    print(Path(directory, 'server.log').read_text()[-3000:], flush=True)
                    raise
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
