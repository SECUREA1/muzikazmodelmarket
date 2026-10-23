"""Native casino intelligence: contextual conversation, memory, tasks and NPC life.

The casino is loaded through its real multiplayer entry and authenticated API.
Task acceptance/progress/cancellation use the same controls as ordinary play.
"""
import json
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
with tempfile.TemporaryDirectory(prefix='casino-intelligence-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(service_workers='block', viewport={'width': 1100, 'height': 760}, device_scale_factor=.8, reduced_motion='reduce')
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError('Server did not start: ' + Path(directory, 'server.log').read_text()[-2000:])
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']
                    def command(action, **fields):
                        response = context.request.post(base + '/api/rooms/muzikaz-casino/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                        assert response.ok, (response.status, response.text())
                        return response.json()['data']
                    def room():
                        response = context.request.get(base + '/api/rooms/muzikaz-casino/gameplay')
                        assert response.ok, response.text()
                        return response.json()['data']
                    initial_balance = context.request.get(base + '/api/casino/state').json()['data']['balance']
                    page = context.new_page()
                    errors = []
                    failures = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('response', lambda response: failures.append(response.json().get('message')) if '/api/rooms/muzikaz-casino/gameplay' in response.url and response.status >= 400 else None)
                    page.route('https://**/*', lambda route: route.abort())
                    def start():
                        page.goto(base + '/model-explorer.html?environment=muzikaz-casino&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                        page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && window.MuzikazHouseExplorer.snapshot().serverReady || document.querySelector("[data-house-start]")?.textContent === "Try again"', timeout=90000)
                        assert page.evaluate('window.MuzikazHouseExplorer?.snapshot().gameplayStarted'), failures
                        page.wait_for_function('window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=30000)
                        assert page.evaluate('window.MuzikazHouseExplorer.snapshot().roomId') == 'muzikaz-casino'
                    start()
                    state = command('input', input={})
                    self_id = state['selfId']
                    residents = [actor for actor in state['actors'].values() if actor.get('resident')]
                    assert len(residents) == 22, [actor['id'] for actor in residents]
                    assert sum(actor['resident'].get('duty') == 'guard' for actor in residents) == 2
                    assert all(actor['resident'].get('personality') for actor in residents)
                    assert all(actor['resident'].get('skills') for actor in residents)
                    assert all(actor['resident'].get('needs') for actor in residents)
                    assert not any(actor.get('loot') or actor.get('trafficAI') and not actor.get('resident') for actor in state['actors'].values())
                    print('Casino intelligence: native scene, 22 personalities and skills, two guards', flush=True)
                    host_id = 'casino-resident-welcome'
                    host = state['actors'][host_id]
                    # Enter within normal conversation reach before accepting a task.
                    target = {'x': 0, 'z': 32}
                    reached = command('map-access', position=target)
                    actual = reached['players'][self_id]['position']
                    page.wait_for_function('(target)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1.5}', arg=actual, timeout=30000)
                    page.screenshot(path='/workspace/casino-intelligence-native.png')
                    toggle = page.get_by_role('button', name='Residents, conversations and daily objectives', exact=True)
                    toggle.click()
                    resident_panel = page.locator('.world-resident-panel.is-casino')
                    resident_panel.wait_for(state='visible', timeout=30000)
                    resident_panel.locator('[data-residents] button').filter(has_text='Amira Lane').first.click()
                    transcript = resident_panel.get_by_label('Casino conversation transcript', exact=True)
                    transcript.wait_for(state='visible', timeout=30000)
                    question = resident_panel.get_by_label('Question for resident', exact=True)
                    choice = resident_panel.get_by_label('Choose quest conversation reply', exact=True)
                    send = resident_panel.locator('.quest-conversation').get_by_role('button', name='Talk to Amira Lane', exact=True)
                    def converse(option, text=''):
                        before = transcript.inner_text()
                        choice.select_option(option)
                        question.fill(text)
                        if text:
                            page.wait_for_timeout(1200)
                            assert question.input_value() == text, 'Room updates must preserve an unfinished question'
                        else:
                            page.wait_for_timeout(1000)
                        def matching_reply(response):
                            if '/api/rooms/muzikaz-casino/gameplay' not in response.url or response.request.method != 'POST':
                                return False
                            body = response.request.post_data_json or {}
                            return body.get('action') == 'npc-social' and body.get('entityId') == host_id and body.get('choice') == option and body.get('text', '') == text
                        with page.expect_response(matching_reply, timeout=30000) as completed:
                            send.click()
                        response = completed.value
                        assert response.ok, response.text()
                        reply = response.json()['data']['players'][self_id]['npcConversation']['conversation'][-1]['text']
                        try:
                            page.wait_for_function("(reply)=>document.querySelector('.world-resident-panel.is-casino [data-conversation-transcript]')?.textContent.includes(reply)", arg=reply, timeout=30000)
                        except Exception:
                            print('Conversation diagnostic', json.dumps({'expected': reply, 'actual': transcript.text_content(), 'errors': errors}), flush=True)
                            page.screenshot(path='/workspace/casino-intelligence-diagnostic.png')
                            raise
                        send.wait_for(state='visible')
                        return reply
                    first = converse('question', 'I like poker. What can you tell me about your work here?')
                    assert 'poker' in first.lower(), first
                    remembered = converse('question', 'What do you remember about me?')
                    assert 'poker' in remembered.lower(), remembered
                    assert resident_panel.locator('.casino-contact-profile').is_visible()
                    assert resident_panel.locator('.casino-contact-memory').is_visible()
                    assert resident_panel.locator('[data-casino-progress]').is_visible()
                    print('Casino intelligence: typed questions, role context and remembered preference', flush=True)
                    converse('casino-skills')
                    converse('casino-task')
                    offered = room()['players'][self_id].get('npcConversation', {}).get('casino', {}).get('taskOffer')
                    assert offered and offered.get('kind') and offered.get('reward'), offered
                    converse('casino-accept')
                    accepted = room()['players'][self_id]['casinoTask']
                    assert accepted['status'] == 'active', accepted
                    assert accepted['checkpoints'] and accepted['reward']['reputation'] > 0
                    resident_panel.locator('[data-casino-task]').wait_for(state='visible')
                    converse('casino-progress')
                    assert accepted['title'].lower() in resident_panel.locator('[data-casino-task]').inner_text().lower()
                    task_id = accepted['id']
                    # Same-account native reload must retain the current task and memory.
                    start()
                    restored = command('input', input={})['players'][self_id]['casinoTask']
                    assert restored['id'] == task_id and restored['status'] == 'active', restored
                    toggle.click()
                    resident_panel.locator('[data-casino-task]').wait_for(state='visible')
                    resident_panel.locator('[data-casino-cancel]').click()
                    deadline = time.monotonic() + 15
                    while time.monotonic() < deadline:
                        cancelled = room()['players'][self_id]['casinoTask']
                        if cancelled['status'] == 'cancelled':
                            break
                        time.sleep(.1)
                    else:
                        raise AssertionError('Casino task did not cancel: ' + json.dumps(cancelled))
                    assert cancelled['id'] == task_id
                    print('Casino intelligence: task offer, acceptance, progress, reload restoration and cancellation', flush=True)
                    transcript.wait_for(state='visible')
                    remembered_after_reload = converse('question', 'What do you remember about me?')
                    assert 'poker' in remembered_after_reload.lower(), remembered_after_reload
                    # The published shared AI transcript is separate from player dialogue.
                    deadline = time.monotonic() + 35
                    while time.monotonic() < deadline:
                        state = room()
                        cast_ids = {actor['id'] for actor in state['actors'].values() if actor.get('resident')}
                        chatter = (state.get('casinoLife') or {}).get('conversations', [])
                        shared_talks = [talk for talk in chatter if len(talk.get('participants', [])) >= 2 and set(talk['participants']).issubset(cast_ids) and len({line.get('speakerId') for line in talk.get('lines', [])}) >= 2]
                        if shared_talks:
                            break
                        time.sleep(.2)
                    else:
                        raise AssertionError('No shared NPC-to-NPC interaction was observed')
                    assert initial_balance == context.request.get(base + '/api/casino/state').json()['data']['balance'], 'NPC tasks and practice games must not alter player MZK'
                    page.set_viewport_size({'width': 390, 'height': 844})
                    question.scroll_into_view_if_needed()
                    box = resident_panel.bounding_box()
                    assert box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= 391 and box['y'] + box['height'] <= 845, box
                    assert resident_panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    page.screenshot(path='/workspace/casino-intelligence-conversation-mobile.png')
                    page.get_by_role('button', name='Close resident conversations', exact=True).click()
                    page.set_viewport_size({'width': 1100, 'height': 760})
                    page.locator('#house-explorer-canvas').focus()
                    page.screenshot(path='/workspace/casino-intelligence-native.png')
                    arrival = command('map-access', position={'x': 0, 'z': 0})['players'][self_id]['position']
                    page.wait_for_function('(target)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1.5}', arg=arrival, timeout=30000)
                    canvas = page.locator('#house-explorer-canvas')
                    canvas.focus()
                    for _ in range(3):
                        if page.evaluate('window.MuzikazHouseExplorer.snapshot().cameraMode') == 'broadcast':
                            break
                        page.keyboard.press('v')
                    page.wait_for_function("window.MuzikazHouseExplorer.snapshot().cameraMode === 'broadcast'")
                    for _ in range(8):
                        page.locator('.broadcast-controls').get_by_role('button', name='Zoom out', exact=True).click()
                    page.screenshot(path='/workspace/casino-intelligence-broadcast.png')
                    assert not errors, errors
                    print(json.dumps({'checks': ['native upgraded casino', '22 distinct AI residents and two guards', 'contextual player conversation and memory', 'task offer/accept/progress/reload/cancel', 'skills and reputation UI', 'NPC-to-NPC interaction', 'mobile layout', 'unchanged MZK wallet'], 'browserErrors': errors}), flush=True)
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
