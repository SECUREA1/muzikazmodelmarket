"""Real explorer UI requests an AI world action through its live quest contact."""
from pathlib import Path
import json
import os
import socket
import subprocess
import tempfile
import time

from playwright.sync_api import sync_playwright

os.chdir(Path(__file__).resolve().parents[1])
WORLD = 'quest-live-ai-garden'


def world():
    def item(item_id, model_id, x, z, behavior):
        return {'id': item_id, 'name': 'Garden beacon' if behavior == 'switch' else 'Garden guide',
                'modelId': model_id, 'position': {'x': x, 'y': 0, 'z': z},
                'rotation': {'x': 0, 'y': 0, 'z': 0}, 'scale': {'x': 1, 'y': 1, 'z': 1},
                'functionalSettings': {'behavior': behavior, 'interactionDistance': 4,
                                       'cooldown': .25, 'destructible': False},
                'dialogueSettings': {'text': 'The garden guide explains this public path.'}}
    return {'id': WORLD, 'name': 'Live AI Garden', 'source': 'custom-builder',
            'visibility': 'public', 'playable': True, 'spawn': {'x': -8, 'y': 0, 'z': -6},
            'updatedAt': '2026-10-24T12:00:00Z',
            'builderScene': {'layout': 'grand-floor', 'mapSize': 64,
                             'gameplay': {'multiplayer': True},
                             'objects': [item('garden-beacon', 'lever-switch', 4, 0, 'switch'),
                                         item('garden-guide', 'street-sign', 7, 8, 'talk')],
                             'layoutMeta': {'locations': [
                                 {'id': 'arrival', 'name': 'Garden arrival', 'x': -8, 'z': -6},
                                 {'id': 'beacon', 'name': 'Garden beacon', 'x': 4, 'z': 0},
                                 {'id': 'reading', 'name': 'Garden reading point', 'x': 7, 'z': 8}]}}}


def wait_until(check, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = check()
        if value:
            return value
        time.sleep(.1)
    raise AssertionError('Timed out waiting for the live server state.')


def main():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    base = 'http://127.0.0.1:' + str(port)
    with tempfile.TemporaryDirectory(prefix='ai-quest-browser-') as directory:
        Path(directory, 'custom-maps.json').write_text(json.dumps([world()]))
        with open(Path(directory, 'server.log'), 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, service_workers='block', reduced_motion='reduce')

                    def ready():
                        try:
                            return context.request.get(base + '/api/health', timeout=1000).ok
                        except Exception:
                            return False

                    wait_until(ready)
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    page = context.new_page()
                    page.set_default_timeout(20000)
                    errors, commands = [], []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('request', lambda request: commands.append(request.post_data_json) if request.method == 'POST' and '/gameplay' in request.url else None)
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/model-explorer.html?environment=' + WORLD + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('''()=>{const s=window.MuzikazHouseExplorer?.snapshot();return s?.controlsReady&&s.serverReady&&s.serverPlayerInitialized;}''', timeout=180000)
                    page.locator('.map-quest-card').wait_for(state='visible')
                    print('Live AI garden and automatic quest card ready.', flush=True)
                    launcher = page.locator('.game-display-flow-views > .map-quest-launcher')
                    assert launcher.is_visible(), 'Quests must occupy a visible top shelf cell.'
                    assert launcher.locator('svg').count() == 1
                    assert launcher.evaluate('''node=>{const r=node.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.y<120&&(h===node||node.contains(h));}''')
                    page.get_by_label('Choose local challenge', exact=True).select_option('map:' + WORLD + ':service')
                    page.locator('[data-quest-accept]').click()
                    page.get_by_role('button', name='Contact & dispatch', exact=True).wait_for()
                    self_id = page.evaluate('MuzikazHouseExplorer.snapshot().serverSelfId')

                    def state():
                        response = context.request.get(base + '/api/rooms/' + WORLD + '/gameplay')
                        assert response.ok, response.text()
                        data = response.json()
                        return data.get('data', data)

                    before = state()
                    original = before['players'][self_id]['vehicleMission']
                    assert before['actors']['garden-beacon']['switched'] is False
                    page.get_by_role('button', name='Contact & dispatch', exact=True).click()
                    question = page.get_by_label('Question for contact', exact=True)
                    question.wait_for(state='visible')
                    question.fill('Please toggle the garden beacon.')
                    question.press('Enter')
                    wait_until(lambda: any(command.get('choice') == 'question' and command.get('text') == 'Please toggle the garden beacon.' for command in commands))
                    wait_until(lambda: (state()['players'][self_id]['vehicleMission'].get('aiWork') or {}).get('status') == 'active')
                    print('The natural question created active authoritative AI work.', flush=True)
                    wait_until(lambda: question.input_value() == '')
                    question.fill('Keep this question draft while you work.')
                    question.evaluate('(input)=>{window.aiDraft=input;input.setSelectionRange(5,13)}')
                    page.wait_for_timeout(700)
                    assert question.evaluate('(input)=>input===aiDraft&&input.selectionStart===5&&input.selectionEnd===13')
                    live_status = page.locator('.transport-radio-panel [data-ai-work-status]')
                    assert live_status.is_visible()
                    wait_until(lambda: (state()['players'][self_id]['vehicleMission'].get('aiWork') or {}).get('status') == 'completed', timeout=35)
                    after = state()
                    assert after['actors']['garden-beacon']['switched'] is True
                    assert after['players'][self_id]['vehicleMission']['index'] == original['index']
                    assert after['players'][self_id]['score'] == before['players'][self_id]['score']
                    assert question.input_value() == 'Keep this question draft while you work.'
                    assert question.evaluate('(input)=>input===aiDraft&&document.activeElement===input')
                    expected_message = after['players'][self_id]['vehicleMission']['aiWork']['message']
                    print('Completed server work:', expected_message, 'UI:', live_status.inner_text(), flush=True)
                    wait_until(lambda: expected_message in live_status.inner_text(), timeout=10)
                    assert not page.evaluate('MuzikazHouseExplorer.snapshot().player.inputBlocked')
                    assert not errors, errors
                    browser.close()
                print('Top SVG Quests, actual natural contact request, live AI status/draft retention and shared switch state pass.', flush=True)
            finally:
                server.terminate()
                server.wait(timeout=15)


if __name__ == '__main__':
    main()
