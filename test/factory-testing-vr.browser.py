"""Exercise native proving dashboards with production XR controls and emulated events."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1000, 'height': 800})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/factory-testing-immersive.html')
        page.wait_for_function('window.ready', timeout=15000)
        result = page.evaluate('runChecks()')
        assert not errors, errors
        assert result['commands'] == ['proving-setup', 'proving-deploy', 'proving-arm', 'proving-launch'], result
        assert result['weaponCalls'] == 0 and result['drawCount'] > 0, result
        browser.close()
        print('PASS: native CanvasTexture dashboard, both controller rays, configure/deploy/arm/launch, disabled/held protection, telemetry polling, tracked pose, lifecycle teardown')
finally:
    server.shutdown()
