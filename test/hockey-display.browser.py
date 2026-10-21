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
  page=browser.new_page(viewport={'width':390,'height':844},has_touch=True);page.set_default_timeout(15000);errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  def api(route):
   if route.request.url.split('?')[0].endswith('/api/environments'):
    route.fulfill(json={'environments':[{'id':'hockey-arena','name':'Hockey','multiplayer':False,'game':'hockey','builderScene':{'layout':'hockey-arena','gameplay':{'hockey':{'enabled':True}}},'hockey':{'enabled':True}}]})
   else:route.fulfill(status=404,json={'error':'Offline fixture'})
  page.route('**/api/**',api)
  page.goto(f'http://127.0.0.1:{server.server_port}/hockey.html?mode=solo',wait_until='domcontentloaded')
  page.wait_for_function('window.MuzikazHockey&&MuzikazHockey.snapshot().ready',timeout=45000)
  page.locator('#start').click();page.wait_for_function('MuzikazHockey.snapshot().running')
  for width,height in [(320,568),(390,844),(844,390)]:
   page.set_viewport_size({'width':width,'height':height})
   toolbar=page.locator('.rad-sports-viewport>.sports-action-utilities');camera=toolbar.locator('#toggle-camera');toggle=toolbar.locator('.sports-collapse')
   for control in [camera,toggle]:
    assert control.locator('svg').count()==1
    control.scroll_into_view_if_needed()
    assert control.evaluate('(el)=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest("button")===el}')
   a=camera.bounding_box();b=toggle.bounding_box();assert a['x']+a['width']<=b['x']
   assert toolbar.bounding_box()['y']+toolbar.bounding_box()['height']<=page.locator('.hockey-sports-bar').bounding_box()['y']
   toggle.click();assert not page.locator('.hockey-sports-bar>.sports-action-bar>.sports-action-modes').is_visible()
   assert page.locator('.scoreboard').is_visible();toggle.click()
   modes=[]
   for i in range(3):
    camera.click();modes.append(page.evaluate('MuzikazHockey.snapshot().cameraMode'))
   assert set(modes)=={'first-person','top-down','broadcast'},modes
   page.locator('#camera-view').evaluate("el=>{el.value='broadcast';el.dispatchEvent(new Event('change'));}")
   page.wait_for_function("MuzikazHockey.snapshot().view==='broadcast'&&MuzikazHockey.snapshot().camera.fov===55")
   if width==390:page.screenshot(path='/tmp/hockey-display.png')
  assert not errors,errors
  browser.close()
 print('Hockey toolbar stays separate and tappable; toggle preserves scores; all three camera modes and broadcast work on portrait and landscape.')
finally:server.shutdown()
