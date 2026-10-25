"""Actual Tools builder places canonical native/GLB assets in a live room."""
from pathlib import Path
from urllib.parse import unquote, urlparse
import json
import mimetypes
import os
import socket
import subprocess
import tempfile
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
WORLD = 'builder-catalog-live-room'


def wait_for(check, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = check()
        if result:
            return result
        time.sleep(.1)
    raise AssertionError('Timed out waiting for the authoritative builder state.')


with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
base = f'http://127.0.0.1:{port}'

with tempfile.TemporaryDirectory(prefix='live-building-catalog-') as directory:
    Path(directory, 'custom-maps.json').write_text(json.dumps([{
        'id': WORLD, 'name': 'Builder Catalog Test', 'source': 'custom-builder',
        'visibility': 'public', 'playable': True, 'spawn': {'x': 0, 'y': 0, 'z': 0},
        'updatedAt': '2026-10-25T12:00:00Z',
        'builderScene': {'layout': 'grand-floor', 'mapSize': 64,
                         'gameplay': {'multiplayer': True}, 'objects': []}
    }]))
    with open(Path(directory, 'server.log'), 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ,
            'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium',
                    headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                context = browser.new_context(viewport={'width': 1280, 'height': 900},
                    service_workers='block', reduced_motion='reduce')

                def healthy():
                    try:
                        return context.request.get(base+'/api/health', timeout=1000).ok
                    except Exception:
                        return False

                wait_for(healthy)
                login = context.request.post(base+'/api/access/free-play', data={
                    'username': 'BuilderIntegration', 'password': 'builder-integration-password'})
                assert login.ok, login.text()
                session = context.request.get(base+'/api/market/session').json()['data']
                headers = {'X-CSRF-Token': session['csrfToken']}
                economy = context.request.get(base+'/api/economy').json()['data']
                native = next(item for item in economy['items'] if item.get('buildAssetId') == 'sofa')
                glb = next(item for item in economy['items'] if item.get('sku') == 'repository:holophone-gold')
                jersey = next(item for item in economy['items'] if item.get('buildAssetId') == 'basketball-jersey-home')
                for item in (native, glb, jersey):
                    if item.get('owned') or item.get('basic'):
                        continue
                    response = context.request.post(base+'/api/economy/buy', headers=headers,
                        data={'sku': item['sku'], 'requestId': 'test-buy-'+item['sku']})
                    assert response.ok, response.text()

                page = context.new_page()
                page.set_default_timeout(20000)
                errors, commands = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: commands.append(request.post_data_json)
                    if request.method == 'POST' and '/gameplay' in request.url else None)
                page.route('https://**/*', lambda route: route.abort())

                # Test the edited source even if an older static dist exists.
                def current_source(route):
                    path = ROOT / unquote(urlparse(route.request.url).path).lstrip('/')
                    if path.is_file():
                        route.fulfill(path=str(path), content_type=mimetypes.guess_type(path)[0])
                    else:
                        route.continue_()

                page.route(base+'/public/js/**', current_source)
                page.route(base+'/public/assets/*.css', current_source)
                page.goto(base+'/model-explorer.html?environment='+WORLD+'&autoplay=1&mode=multiplayer',
                    wait_until='domcontentloaded', timeout=90000)
                try:
                    page.wait_for_function('''()=>{const s=window.MuzikazHouseExplorer?.snapshot();
                        return s?.controlsReady&&s.serverReady&&s.serverPlayerInitialized;}''', timeout=120000)
                except Exception:
                    page.screenshot(path='/tmp/live-building-catalog-failure.png', full_page=True)
                    print({'errors': errors, 'snapshot': page.evaluate('window.MuzikazHouseExplorer?.snapshot()'),
                        'loading': page.locator('#house-game-load-status').inner_text()}, flush=True)
                    raise
                print('Live builder test room connected.', flush=True)

                def state():
                    response = context.request.get(base+'/api/rooms/'+WORLD+'/gameplay')
                    assert response.ok, response.text()
                    return response.json()['data']

                def open_builder():
                    page.locator('[data-house-tools]').evaluate('(button)=>button.click()')
                    target = page.locator('[data-rad-build-toggle]')
                    for _ in range(5):
                        if target.is_visible():
                            break
                        page.get_by_role('button', name='Next Quick tools page', exact=True).evaluate('(button)=>button.click()')
                    target.evaluate('(button)=>button.click()')
                    page.locator('[data-build-search]').wait_for(state='visible')

                def choose(name, source):
                    page.locator('[data-build-source]').select_option(source)
                    page.locator('[data-build-search]').fill(name)
                    page.wait_for_function('''name => document.querySelector('[data-build-inspector] h3')
                        ?.textContent === name''', arg=name)
                    return page.locator('[data-build-inspector] [data-place-build-asset]')

                def lock_item(item):
                    before = set(state()['actors'])
                    choose(item['name'], 'native' if item.get('buildAssetId') else 'glb').click()
                    page.locator('.owned-placement-edit').wait_for(state='visible')
                    assert not page.locator('.map-quest-prompts .map-quest-card').is_visible(), 'Placement must close the arrival quest popup.'
                    page.locator('.owned-placement-edit').click()
                    page.locator('[data-place-action=lock]').click()
                    spawned = wait_for(lambda: [actor for key, actor in state()['actors'].items()
                        if key not in before and actor.get('spawned')])
                    assert len(spawned) == 1, spawned
                    command = next(command for command in reversed(commands)
                        if command.get('action') == 'spawn')
                    assert command['sku'] == item['sku'], command
                    assert command['itemId'] == item['id'], command
                    return spawned[0]

                open_builder()
                assert '500' in page.locator('[data-build-results]').inner_text()
                summary = page.locator('.build-catalog-summary').text_content()
                assert '421 native' in summary, summary
                assert '55 GLB' in summary, summary
                print('Actual Tools menu lists 500 items: 421 native, 55 GLB and 24 tools.', flush=True)
                sofa = lock_item(native)
                assert sofa['asset']['buildAssetId'] == 'sofa', sofa
                assert sofa['definition']['gameplay']['behavior'] == 'seat', sofa
                assert sofa['definition']['gameplay']['seatOffset'] == [0, .65, 0], sofa
                print('Live native seat placement preserved canonical identity and behavior.', flush=True)

                open_builder()
                phone = lock_item(glb)
                assert phone['asset']['modelUrl'] == glb['modelUrl'], phone
                assert not phone['asset'].get('buildAssetId'), phone
                print('Live GLB placement reached the server with its own canonical SKU.', flush=True)

                open_builder()
                choose('Home Basketball Jersey', 'native').click()
                self_id = page.evaluate('MuzikazHouseExplorer.snapshot().serverSelfId')
                wait_for(lambda: state()['players'][self_id].get('basketballJersey') == 'home')
                print('Home jersey equipped through its existing owned wearable path.', flush=True)

                open_builder()
                tool = choose('Repair hammer', 'tool')
                assert tool.get_attribute('data-economy-sku') == 'tool:repair-tool'
                tool.click()
                page.wait_for_function('MuzikazHouseExplorer.snapshot().tool === "repair-tool"')
                assert not page.locator('#rad-build-menu').is_visible()
                assert not errors, errors
                browser.close()
                print('500-item actual Tools builder, native/GLB server placement and tool equip passed.')
        finally:
            server.terminate()
            server.wait(timeout=10)
