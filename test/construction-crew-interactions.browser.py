"""Construction worker conversations dispatch real server requests from the crew UI."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width, height in [(390, 844), (844, 390), (1280, 800)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/construction-dashboard.html')
            page.wait_for_selector('body[data-ready=true]')
            page.evaluate('''() => {
                state.players.me.vehicleId=null;refresh();
                window.releases=[];
                document.addEventListener('muzikaz:release-game-input',e=>releases.push(e.detail.reason));
            }''')
            page.get_by_role('button', name='Construction crew and jobs', exact=True).click()
            worker = page.locator('.construction-crew-dialog [data-worker-id=crew-noor]')
            for operation, label in [('demonstrate', 'Show me your work'), ('status', 'Ask for an update'), ('stop', 'Stop demonstration')]:
                worker.get_by_role('button', name=label, exact=True).click()
                page.wait_for_function('(operation)=>calls.some(call=>call.action==="construction-crew"&&call.operation===operation&&call.workerId==="crew-noor")', arg=operation)
            assert page.evaluate('releases.filter(reason=>reason==="crew-action").length') == 3
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            assert not errors, errors
            page.get_by_role('button', name='Close crew', exact=True).click()
            page.wait_for_function('document.activeElement===document.querySelector(".construction-crew-toggle")')
            page.close()
        browser.close()
    print('Construction crew demo/status/stop controls dispatch exact server actions, release held input and remain usable in mobile/desktop layouts.')
finally:
    server.shutdown()
