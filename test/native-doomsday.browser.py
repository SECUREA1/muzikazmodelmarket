from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()

def walk_to(page, kind, getter, point):
 import math
 for _ in range(100):
  snapshot=page.evaluate(getter);player=snapshot['player'] if kind=='hockey' else snapshot['walking']
  dx=point['x']-player['x'];dz=point['z']-player['z']
  if math.hypot(dx,dz)<3: return
  if kind=='hockey':
   heading=snapshot['heading'];right=-math.cos(heading)*dx+math.sin(heading)*dz;forward=math.sin(heading)*dx+math.cos(heading)*dz
  else:right=dx;forward=-dz
  key=('w' if forward>0 else 's') if abs(forward)>=abs(right) else ('d' if right>0 else 'a')
  page.keyboard.down(key);page.wait_for_timeout(160);page.keyboard.up(key)
 raise AssertionError((kind,'unable to walk to response point',point,player))

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for kind in os.environ.get('NATIVE_MAPS','hockey,arcade').split(','):
   page=browser.new_page(viewport={'width':390,'height':844},has_touch=True);page.set_default_timeout(20000);errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   def api(route):
    path=route.request.url.split('?')[0]
    if path.endswith('/api/player/settings'):route.fulfill(json={'settings':{'masterMuted':True}})
    elif path.endswith('/api/environments') and kind=='hockey':route.fulfill(json=[{'id':'hockey-arena','name':'Hockey','multiplayer':False,'game':'hockey','builderScene':{'layout':'hockey-arena','gameplay':{'hockey':{'enabled':True}}},'hockey':{'enabled':True}}])
    else:route.fulfill(status=404,json={'error':'Offline fixture'})
   page.route('**/api/**',api)
   page.goto(f'http://127.0.0.1:{server.server_port}/{kind}.html?mode=solo',wait_until='domcontentloaded')
   getter='MuzikazHockey.snapshot()' if kind=='hockey' else 'NeonJunction.snapshot()'
   if kind=='hockey':
    page.wait_for_function('window.MuzikazHockey&&MuzikazHockey.snapshot().ready',timeout=60000)
    page.locator('#start').click();page.wait_for_function('MuzikazHockey.snapshot().running')
    page.locator('#camera-view').evaluate("el=>{el.value='top-down';el.dispatchEvent(new Event('change'));}")
   else:
    page.wait_for_function('window.NeonJunction&&document.body.classList.contains("arcade-dashboard")',timeout=60000)
    page.locator('#camera-toggle').click()
   page.wait_for_function(f'{getter}.doomsday?.phase==="idle"')
   toggle=page.get_by_role('button',name='Doomsday response exercise',exact=True)
   toggle.click();panel=page.locator('#doomsday-panel');assert panel.is_visible()
   assert 'local' in panel.locator('.doomsday-context').inner_text()
   panel.locator('[data-operation="start"]').click()
   page.wait_for_function(f'{getter}.doomsday.phase==="warning"')
   # Opening the response companion keeps the existing skate/walk input active.
   before=page.evaluate(f'{getter}.player' if kind=='hockey' else f'{getter}.walking')
   page.keyboard.down('w');page.wait_for_timeout(250);page.keyboard.up('w')
   after=page.evaluate(f'{getter}.player' if kind=='hockey' else f'{getter}.walking')
   assert abs(after['x']-before['x'])+abs(after['z']-before['z'])>.01,(kind,before,after)
   for phase in ['warning','fallout','recovery']:
    state=page.evaluate(f'{getter}.doomsday');objective=next(o for o in state['objectives'] if o['phase']==phase)
    panel.locator('[data-close]').click()
    page.locator('#rink' if kind=='hockey' else '#world canvas').focus()
    walk_to(page,kind,getter,objective['position'])
    toggle.click();panel.locator(f'[data-objective="{objective["id"]}"]').click()
    print(kind,phase,panel.locator('[data-feedback]').inner_text(),flush=True)
    page.wait_for_function(f'{getter}.doomsday.canAdvance')
    panel.locator('[data-operation="advance"]').click()
   page.wait_for_function(f'{getter}.doomsday.phase==="all-clear"')
   assert not page.locator('.doomsday-banner').is_visible()
   panel.locator('[data-operation="start"]').click();page.wait_for_function(f'{getter}.doomsday.phase==="warning"')
   panel.locator('[data-operation="stop"]').click();page.wait_for_function(f'{getter}.doomsday.phase==="idle"')
   assert not errors,(kind,errors)
   page.screenshot(path=f'/tmp/native-doomsday-{kind}.png');page.close()
  browser.close()
 print('Hockey and arcade response exercises complete all phases with native walking and skating, preserve movement with menus open, replay and end cleanly.')
finally:server.shutdown()
