"""Real saved-map and permanent-world intelligence, including account continuity.

Runs against an isolated Node server and real authenticated room APIs. Favor
checkpoints are reached with keyboard walking, with no task-state injection.
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
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
account = {'username': 'WorldIntelligenceTest', 'password': 'World-intelligence-pass-2026'}

with tempfile.TemporaryDirectory(prefix='world-intelligence-') as directory:
    log = open(Path(directory) / 'server.log', 'w')
    server = None
    try:
        def run_server():
            return subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)

        server = run_server()
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
            try:
                context = browser.new_context(service_workers='block', viewport={'width': 1100, 'height': 760}, device_scale_factor=.8, reduced_motion='reduce')

                def wait_server():
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                return
                        except Exception:
                            time.sleep(.1)
                    raise AssertionError('Server did not start: ' + Path(directory, 'server.log').read_text()[-2000:])

                wait_server()
                login = context.request.post(base + '/api/access/free-play', data=account)
                assert login.ok, login.text()
                csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']
                initial_balance = context.request.get(base + '/api/wallet/state').json()['data']['tokens']
                market_csrf = context.request.get(base + '/api/market/session').json()['data']['csrfToken']
                scene = {'id': 'world-intelligence-saved', 'name': 'Music Workshop Saved Map', 'layout': 'grand-floor', 'mapSize': 40, 'baseTransform': {'x': 180, 'y': 6, 'z': -120, 'rotation': 90, 'scale': 1.25}, 'objects': [], 'gameplay': {'multiplayer': True}}
                published = context.request.post(base + '/api/custom-maps', headers={'X-CSRF-Token': market_csrf}, data={'scene': scene})
                assert published.status == 201, published.text()
                custom_url = published.json()['data']['playUrl']
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://**/*', lambda route: route.abort())
                map_id = 'land-field-echo-gardens'
                self_id = None
                npc_id = None
                panel = page.locator('.world-resident-panel')
                toggle = page.get_by_role('button', name='Residents, conversations and daily objectives', exact=True)

                def command(action, expected_ok=True, **fields):
                    response = context.request.post(base + '/api/rooms/' + map_id + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                    assert response.ok == expected_ok, (response.status, response.text())
                    return response.json().get('data', response.json())

                def room():
                    response = context.request.get(base + '/api/rooms/' + map_id + '/gameplay')
                    assert response.ok, response.text()
                    return response.json()['data']

                def start(url=None):
                    target = url or ('model-explorer.html?environment=' + map_id + '&autoplay=1&mode=multiplayer')
                    page.goto(base + '/' + target.lstrip('/'), wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && window.MuzikazHouseExplorer.snapshot().serverReady || document.querySelector("[data-house-start]")?.textContent === "Try again"', timeout=90000)
                    assert page.evaluate('window.MuzikazHouseExplorer?.snapshot().gameplayStarted'), page.locator('#house-status').text_content()
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=30000)
                    assert page.evaluate('window.MuzikazHouseExplorer.snapshot().roomId') == map_id
                    # Use the normal peaceful exploration setting while
                    # testing conversation rather than the combat encounter.
                    command('rad-tox-toggle', enabled=False)
                    return command('input', input={})

                def open_panel():
                    if not panel.is_visible():
                        toggle.click()
                    panel.wait_for(state='visible')

                def close_panel():
                    if panel.is_visible():
                        panel.get_by_role('button', name='Close resident conversations', exact=True).click()

                def choose_npc(state):
                    cast = [actor for actor in state['actors'].values() if actor.get('resident') and actor.get('active', True)]
                    assert len(cast) >= 2, {'map': map_id, 'cast': cast}
                    assert all(actor['resident'].get('personality') and actor['resident'].get('skills') and actor['resident'].get('needs') for actor in cast)
                    position = state['players'][self_id]['position']
                    return min(cast, key=lambda actor: math.hypot(actor['position']['x'] - position['x'], actor['position']['z'] - position['z']))

                def open_conversation(npc):
                    target = npc['position']
                    state = command('map-access', position={'x': target['x'] + 1.5, 'z': target['z']})
                    actual = state['players'][self_id]['position']
                    page.wait_for_function('(p)=>{const a=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(a[0]-p.x,a[2]-p.z)<1.5}', arg=actual, timeout=30000)
                    open_panel()
                    panel.locator('[data-resident-talk="' + npc['id'] + '"]').click()
                    panel.get_by_label('Quest conversation transcript', exact=True).wait_for(state='visible')

                def converse(choice_id, text=''):
                    choice = panel.get_by_label('Choose quest conversation reply', exact=True)
                    question = panel.get_by_label('Question for resident', exact=True)
                    choice.select_option(choice_id)
                    question.fill(text)
                    page.wait_for_timeout(1100)
                    assert question.input_value() == text, 'Incoming room snapshots replaced a drafted question'

                    def matches(response):
                        if '/api/rooms/' + map_id + '/gameplay' not in response.url or response.request.method != 'POST':
                            return False
                        body = response.request.post_data_json or {}
                        return body.get('action') == 'npc-social' and body.get('entityId') == npc_id and body.get('choice') == choice_id and body.get('text', '') == text

                    with page.expect_response(matches, timeout=30000) as completed:
                        panel.locator('.quest-conversation .casino-conversation-send').click()
                    response = completed.value
                    assert response.ok, response.text()
                    state = response.json()['data']
                    reply = state['players'][self_id]['npcConversation']['conversation'][-1]['text']
                    page.wait_for_function('(reply)=>document.querySelector(".world-resident-panel [data-conversation-transcript]")?.textContent.includes(reply)', arg=reply, timeout=30000)
                    return state, reply

                def walk_to(point):
                    close_panel()
                    page.locator('#house-explorer-canvas').focus()
                    held = None
                    started = time.monotonic()
                    try:
                        while time.monotonic() - started < 35:
                            state = room()
                            target = state['actors'].get(point.get('actorId'), {}).get('position') or point
                            player = state['players'][self_id]['position']
                            dx, dz = target['x'] - player['x'], target['z'] - player['z']
                            if math.hypot(dx, dz) <= min(2.5, point.get('radius', 4) - .6):
                                return
                            yaw = page.evaluate('window.MuzikazHouseExplorer.snapshot().player.yaw')
                            forward = -math.sin(yaw) * dx - math.cos(yaw) * dz
                            side = math.cos(yaw) * dx - math.sin(yaw) * dz
                            key = ('w' if forward > 0 else 's') if abs(forward) >= abs(side) else ('d' if side > 0 else 'a')
                            if key != held:
                                if held:
                                    page.keyboard.up(held)
                                page.keyboard.down(key)
                                held = key
                            page.wait_for_timeout(180)
                        raise AssertionError({'message': 'Keyboard route did not reach favor marker', 'point': point, 'state': room()['players'][self_id], 'native': page.evaluate('window.MuzikazHouseExplorer.snapshot()')})
                    finally:
                        if held:
                            page.keyboard.up(held)

                state = start()
                self_id = state['selfId']
                npc = choose_npc(state)
                npc_id = npc['id']
                open_conversation(npc)
                state, reply = converse('question', 'I enjoy music. What do you do in this world?')
                assert state['players'][self_id]['npcConversation']['residentContext']['relationship']['rememberedInterest'] == 'music'
                assert state['players'][self_id]['npcConversation'].get('residentContext'), state['players'][self_id]['npcConversation']
                assert panel.locator('.resident-contact-profile').is_visible()
                state, reply = converse('resident-memory')
                assert 'music' in reply.lower(), reply
                assert panel.locator('.resident-contact-memory').is_visible()
                converse('resident-skills')
                converse('help')
                assert panel.locator('.resident-task-offer').is_visible()
                state, _ = converse('accept')
                task = state['players'][self_id]['residentTask']
                assert task['status'] == 'active' and task['progressReward']['reputation'] > 0, task
                old_progress = state['players'][self_id].get('residentProgress', {})
                original_revision = state['players'][self_id]['movementRevision']
                for index, point in enumerate(task['checkpoints']):
                    walk_to(point)
                    if index == 0 and task.get('socialTargetId'):
                        page.wait_for_timeout(1000)
                        command('npc-social', entityId=task['socialTargetId'], choice='day')
                    open_panel()
                    page.wait_for_timeout(1100)
                    with page.expect_response(lambda r: '/gameplay' in r.url and r.request.method == 'POST' and (r.request.post_data_json or {}).get('choice') == 'confirm', timeout=30000) as completed:
                        panel.locator('[data-confirm]').click()
                    assert completed.value.ok, completed.value.text()
                state = room()
                player = state['players'][self_id]
                assert player['residentTask']['status'] == 'completed', player
                assert player['movementRevision'] == original_revision, 'Favor completion must use normal walking'
                earned = player['residentProgress']
                assert earned['reputation'] > old_progress.get('reputation', 0), earned
                assert earned['skills'] and earned.get('cosmetics', earned.get('badges')), earned
                page.wait_for_timeout(1100)
                command('npc-social', expected_ok=False, entityId=npc_id, choice='confirm')
                assert room()['players'][self_id]['residentProgress'] == earned
                panel.locator('[data-resident-progress]').wait_for(state='visible')
                print('Permanent world: typed preference, role profile, remembered interest, real walking favor and replay protection passed', flush=True)

                state = start()
                assert state['players'][self_id]['residentTask']['status'] == 'completed'
                assert state['players'][self_id]['residentProgress'] == earned
                map_id = scene['id']
                state = start(custom_url)
                assert state['players'][self_id]['position']['x'] > 100
                assert state['players'][self_id]['residentProgress'] == earned
                npc = choose_npc(state)
                npc_id = npc['id']
                assert npc['position']['x'] > 100 and npc['position']['y'] > 5, npc['position']
                open_conversation(npc)
                state, reply = converse('resident-memory')
                assert 'music' in reply.lower(), reply
                assert state['players'][self_id]['npcConversation']['residentContext']['relationship']['rememberedInterest'] == 'music'
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline:
                    state = room()
                    conversations = state.get('residentLife', {}).get('conversations', [])
                    if any(len({line['speakerId'] for line in talk.get('lines', [])}) >= 2 for talk in conversations):
                        break
                    page.wait_for_timeout(600)
                else:
                    raise AssertionError({'message': 'No alternating resident conversation on saved map', 'life': state.get('residentLife')})
                page.screenshot(path='/workspace/world-intelligence-saved-native.png')
                page.set_viewport_size({'width': 390, 'height': 844})
                panel.get_by_label('Question for resident', exact=True).scroll_into_view_if_needed()
                bounds = panel.bounding_box()
                assert bounds['x'] >= 0 and bounds['y'] >= 0 and bounds['x'] + bounds['width'] <= 391 and bounds['y'] + bounds['height'] <= 845, bounds
                assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                assert panel.locator('[data-resident-chatter]').is_visible()
                page.screenshot(path='/workspace/world-intelligence-saved-mobile.png')
                assert context.request.get(base + '/api/wallet/state').json()['data']['tokens'] == initial_balance
                assert not errors, errors
                page.close()
                # The canonical save must survive a process restart and a new
                # account login; a browser's in-memory UI cannot supply it.
                server.terminate()
                server.wait(timeout=10)
                server = run_server()
                wait_server()
                login = context.request.post(base + '/api/access/free-play', data=account)
                assert login.ok, login.text()
                csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']
                restored = command('join')
                assert restored['selfId'] == self_id
                assert restored['players'][self_id]['residentProgress'] == earned
                time.sleep(1.1)
                restored = command('npc-social', entityId=npc_id, choice='resident-memory')
                assert 'music' in restored['players'][self_id]['npcConversation']['conversation'][-1]['text'].lower()
                assert context.request.get(base + '/api/wallet/state').json()['data']['tokens'] == initial_balance
                print(json.dumps({'checks': ['permanent native world', 'published transformed saved map', 'NPC profiles and skills', 'typed preference and memory', 'walking favor and reward exactly once', 'same-map reload and cross-map carry', 'alternating NPC conversation', 'mobile layout', 'server restart and account relogin', 'unchanged MZK'], 'browserErrors': errors}), flush=True)
            except Exception:
                if 'page' in locals() and not page.is_closed():
                    print('Native diagnostic', page.evaluate('({snapshot:window.MuzikazHouseExplorer?.snapshot(),status:document.querySelector("#house-status")?.textContent,panel:document.querySelector(".world-resident-panel")?.textContent})'), flush=True)
                    page.screenshot(path='/workspace/world-intelligence-diagnostic.png', timeout=15000)
                print('Server diagnostic', Path(directory, 'server.log').read_text()[-2500:], flush=True)
                raise
            finally:
                browser.close()
    finally:
        if server is not None:
            server.terminate()
            server.wait(timeout=10)
        log.close()
