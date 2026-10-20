from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':820});page.set_default_timeout(6000);errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/sports-room-building.html')
  page.wait_for_selector('body[data-ready=true]')
  page.get_by_role('button',name='Build',exact=True).click()
  page.get_by_role('button',name='Place item',exact=True).click()
  page.wait_for_function('window.building.active')
  page.locator('canvas').click(position={'x':195,'y':200})
  page.wait_for_function("window.scene.getObjectByName('ROOM_BUILDING_PIECES').children.length===1")
  page.locator('canvas').click(position={'x':195,'y':200})
  page.wait_for_function("window.scene.getObjectByName('ROOM_BUILDING_PIECES').children.length===2")
  assert page.evaluate("(()=>{const items=window.scene.getObjectByName('ROOM_BUILDING_PIECES').children;return items[1].position.y>items[0].position.y})()")
  page.get_by_role('button',name='Build',exact=True).click()
  page.get_by_role('checkbox',name='Allow building').uncheck()
  page.wait_for_function('!window.building.active')
  assert page.get_by_role('button',name='Place item',exact=True).is_disabled()
  page.get_by_role('checkbox',name='Allow building').check()
  assert page.get_by_role('button',name='Place item',exact=True).is_enabled()
  assert not errors,errors
  browser.close()
 print('Sports-room brick placement, stacking and local host restriction toggle passed.')
finally:server.shutdown()
