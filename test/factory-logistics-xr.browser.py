"""Exercise real logistics callbacks through native XR menu controller rays."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':1000,'height':800})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/factory-logistics-immersive.html')
        page.wait_for_function('window.ready',timeout=15000)
        result=page.evaluate('runChecks()')
        assert not errors,errors
        assert result['commands']==['logistics-certify','logistics-book','logistics-deliver','logistics-book','logistics-stage','logistics-cancel'],result
        assert result['listings']==[True,False] and result['weaponCalls']==0 and result['shippingCalls']==1,result
        browser.close()
        print('PASS: native XR menu rays certify, list/unlist through protected market API, book/deliver/stage/cancel, navigate shipping, consume disabled actions, preserve tracked pose and reset on travel')
finally:
    server.shutdown()
