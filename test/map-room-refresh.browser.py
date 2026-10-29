"""Map selections launch a new document and confirm a new live room join."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
READY = """id => {
    const state=window.MuzikazHouseExplorer?.snapshot();
    return state?.roomId===id && state.serverHostedRoom && state.serverReady &&
        state.gameplayStarted && state.controlsReady &&
        document.querySelector('.house-stage').getAttribute('aria-busy')==='false';
}"""


def main():
    os.chdir(ROOT)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='fresh-map-launch-') as directory:
        with open(Path(directory, 'server.log'), 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={
                **os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory,
                'MUZIKAZ_STATIC_SOURCE': 'repository',
            }, stdout=log, stderr=log)
            try:
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(
                        executable_path='/usr/bin/chromium', headless=True,
                        args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = browser.new_context(
                        viewport={'width': 390, 'height': 844}, device_scale_factor=.5,
                        is_mobile=True, has_touch=True,
                        service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(60):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.2)
                    else:
                        raise AssertionError('Test server did not start.')
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    page = context.new_page()
                    page.set_default_timeout(60000)
                    page.add_init_script("localStorage.setItem('muzikazGameCameraMode','top-down')")
                    errors, joins = [], []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('request', lambda request: joins.append(request.url)
                            if request.method == 'POST' and '/gameplay' in request.url
                            and request.post_data_json.get('action') == 'join' else None)
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/model-explorer.html?environment=public-commons&house=public-commons&autoplay=1&mode=multiplayer',
                              wait_until='domcontentloaded', timeout=60000)
                    page.wait_for_function(READY, arg='public-commons', timeout=120000)
                    print('Initial Commons server joined.', flush=True)
                    # The first selection reopens the current URL with a fragment:
                    # this must reload, rather than perform a same-document trip.
                    for destination in ['public-commons', 'muzikaz-main', 'public-commons']:
                        before = len(joins)
                        page.evaluate("window.__previousMapDocument=true;history.replaceState(null,'',location.href.split('#')[0]+'#house-explorer-canvas')")
                        page.locator('#house-world-button').click()
                        page.locator('[data-world-search]').fill(destination)
                        page.locator('[data-world-id="' + destination + '"]').click()
                        with page.expect_navigation(wait_until='domcontentloaded', timeout=60000):
                            page.locator('[data-world-join]').click()
                        page.wait_for_function(READY, arg=destination, timeout=120000)
                        assert page.evaluate('window.__previousMapDocument === undefined')
                        assert len(joins) > before and '/api/rooms/' + destination + '/gameplay' in joins[-1]
                        assert page.evaluate("new URL(location.href).searchParams.get('autoplay')") == '1'
                        print('Fresh document and live join:', destination, flush=True)
                    screenshot = ROOT / 'work' / 'fresh-map-launch.png'
                    screenshot.parent.mkdir(exist_ok=True)
                    close_quests = page.get_by_role('button', name='Close local quests', exact=True)
                    if close_quests.is_visible():
                        close_quests.click()
                    page.locator('.house-stage').screenshot(path=str(screenshot), scale='css')
                    assert not errors, errors
                    browser.close()
                    print('Fresh map launch, same-map reopen, and return visit passed.', flush=True)
            finally:
                server.terminate()
                server.wait(timeout=15)


if __name__ == '__main__':
    main()
