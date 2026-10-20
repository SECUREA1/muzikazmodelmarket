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
  for width in [320,390,768,1280]:
   page=browser.new_page(viewport={'width':width,'height':680},has_touch=True);page.set_default_timeout(6000);errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
   page.wait_for_selector('body[data-ready=true]')
   item=page.locator('.builder-nearby-action:not(.builder-portal-action)');portal=page.locator('.builder-portal-action');fire=page.get_by_role('button',name='Fire',exact=True)
   boxes=[control.bounding_box() for control in [item,portal,fire]]
   for control,box in zip([item,portal,fire],boxes):
    assert box['x']>=0 and box['x']+box['width']<=width and box['height']>=44
    assert control.evaluate('(el)=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest("button")===el}')
   for i,a in enumerate(boxes):
    for b in boxes[i+1:]:assert a['x']+a['width']<=b['x'] or b['x']+b['width']<=a['x'] or a['y']+a['height']<=b['y'] or b['y']+b['height']<=a['y']
   item.tap();assert page.get_by_role('dialog',name='Interactive device',exact=True).is_visible()
   page.locator('[data-device-close]').click();portal.tap();assert page.evaluate('window.commands')==[{'entityId':'arcade'},{'entityId':'portal'}]
   page.evaluate('window.pair.renderPortal(null)');assert item.is_visible() and not portal.is_visible()
   assert not errors,errors
   if width==390:page.screenshot(path='/tmp/separate-nearby-actions.png')
   page.close()
  browser.close()
 print('Separate arcade and portal buttons passed at 320, 390, 768 and 1280px; taps target distinct objects without duplicates.')
finally:server.shutdown()
