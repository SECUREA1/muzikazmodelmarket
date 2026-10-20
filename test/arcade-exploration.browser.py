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
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':390,'height':844},has_touch=True);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.route('**/api/**',lambda route:route.fulfill(status=404,json={'error':'Offline fixture'}))
  page.goto(f'http://127.0.0.1:{server.server_port}/arcade.html?environment=neon-junction&attraction=billiards&mode=solo')
  page.wait_for_function('window.NeonJunction&&document.body.classList.contains("arcade-dashboard")',timeout=45000)
  assert page.evaluate('NeonJunction.snapshot().game') is None;assert page.locator('.arcade-display-popup[open]').count()==0
  page.locator('.thumbstick-base').first.tap();assert page.evaluate('NeonJunction.snapshot().game') is None
  menu=page.get_by_role('button',name='Arcade menu and match lobby',exact=True);menu.click();page.locator('[data-attraction="billiards"]').click()
  page.wait_for_function('NeonJunction.snapshot().game===4&&NeonJunction.snapshot().gameStarted',timeout=15000);assert page.locator('.arcade-display-popup[open]').count()==0
  page.locator('#closegame').click();page.wait_for_function('NeonJunction.snapshot().game===null')
  menu.click();page.locator('[data-attraction="train"]').click();page.wait_for_function('NeonJunction.snapshot().ride!==null');assert page.locator('#closegame').is_visible()
  page.locator('#closegame').click();page.wait_for_function('NeonJunction.snapshot().ride===null&&NeonJunction.snapshot().game===null')
  assert not errors,errors;browser.close()
 print('Neon Junction arrives in exploration, walking does not enter games, explicit billiards starts free play, and game/ride SVG exits return to the park.')
finally:server.shutdown()
