from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/house-explorer-glb.js*',lambda route:route.fulfill(content_type='text/javascript',body="throw new Error('Startup regression test');"))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{document.body.innerHTML='<section id="house-game-start"><button data-house-start>Begin</button><p id="house-game-load-status"></p></section>';await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/public/js/rad-tox-launcher.js';script.onload=resolve;script.onerror=reject;document.body.append(script);});}''')
  page.locator('[data-house-start]').click();page.wait_for_function("document.querySelector('[data-house-start]').textContent==='Try again'")
  assert 'Startup regression test' in page.locator('#house-game-load-status').inner_text()
  assert not page.locator('[data-house-start]').is_disabled()
  assert not errors,errors;browser.close()
 print('Engine evaluation failures show the real error and restore Try again instead of hanging on the connection warning.')
finally:server.shutdown()
