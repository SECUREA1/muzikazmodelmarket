"""Publish and play Builder maps with external network requests blocked."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from playwright.sync_api import sync_playwright

os.chdir(Path(__file__).resolve().parents[1])
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='builder-launch-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                context = browser.new_context(service_workers='block', viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
                base = f'http://127.0.0.1:{port}'
                for attempt in range(40):
                    try:
                        if context.request.get(base + '/api/health', timeout=1000).ok:
                            break
                    except Exception:
                        time.sleep(.25)
                assert context.request.post(base + '/api/access/guest', data={}).status == 201
                for mode in ['solo', 'multiplayer']:
                    session = context.request.get(base + '/api/market/session').json()['data']
                    scene = {'id': 'builder-' + mode, 'name': 'Builder startup check', 'layout': 'grand-floor', 'mapSize': 40, 'objects': [], 'gameplay': {'multiplayer': mode == 'multiplayer'}}
                    response = context.request.post(base + '/api/custom-maps', headers={'X-CSRF-Token': session['csrfToken']}, data={'scene': scene})
                    assert response.status == 201, response.text()
                    url = response.json()['data']['playUrl']
                    assert 'mode=' + mode in url
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.add_init_script("document.addEventListener('muzikaz:rad-tox-native-error',event=>console.error('STARTUP ERROR',event.detail?.message))")
                    page.on('console',lambda message:print(message.text,flush=True) if message.type=='error' and message.text.startswith('STARTUP ERROR') else None)
                    page.on('response', lambda response: print('gameplay failure', response.status, response.text()[:500], flush=True) if '/gameplay' in response.url and response.status != 200 else None)
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/' + url, wait_until='domcontentloaded',timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted', timeout=90000)
                    state = page.evaluate('window.MuzikazHouseExplorer.snapshot()')
                    assert state['roomId'] == scene['id'], state
                    assert state['serverHostedRoom'] == (mode == 'multiplayer'), state
                    if mode == 'multiplayer':
                        assert state['serverReady'] and state['serverPlayerInitialized'], state
                    page.locator('#house-explorer-canvas').scroll_into_view_if_needed()
                    page.locator('#house-explorer-canvas').focus()
                    before = state['player']['position']
                    page.keyboard.down('w')
                    try:
                        page.wait_for_function('(z)=>window.MuzikazHouseExplorer.snapshot().player.position[2] < z - .1', arg=before[2], timeout=15000)
                    except Exception:
                        print('movement diagnostic', page.evaluate('({state:window.MuzikazHouseExplorer.snapshot(),dialogs:[...document.querySelectorAll("dialog[open]")].map(node=>node.textContent),hidden:document.hidden,status:document.querySelector("#house-status")?.textContent})'), flush=True)
                        print('server diagnostic', context.request.get(base + '/api/rooms/' + scene['id'] + '/gameplay').text()[:3000], flush=True)
                        raise
                    finally:
                        page.keyboard.up('w')
                    assert not errors, errors
                    print(mode, 'publish, load, start and walk passed', flush=True)
                    page.close()
                browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
