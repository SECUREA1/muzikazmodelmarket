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
   page.evaluate("""async()=>{const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');window.flow=mountGameDisplayFlow(document.querySelector('.house-stage'));const panel=document.createElement('section');panel.className='basketball-hud';panel.style.cssText='position:absolute;bottom:8px;height:100px;left:8px;right:8px;background:#123';panel.textContent='HOME 0 · AWAY 0';document.querySelector('.house-stage').append(panel);}""")
   page.wait_for_selector('.game-display-flow > .basketball-hud')
   page.wait_for_function("getComputedStyle(document.querySelector('.game-display-flow-actions')).display==='flex'")
   item=page.locator('.builder-nearby-action:not(.builder-portal-action)');portal=page.locator('.builder-portal-action');fire=page.get_by_role('button',name='Fire',exact=True)
   boxes=[control.bounding_box() for control in [item,portal,fire]]
   panel=page.locator(".basketball-hud").bounding_box()
   assert all(box["y"]+box["height"]<=panel["y"] for box in boxes), "nearby and fire controls stay above the sports panel"
   for control,box in zip([item,portal,fire],boxes):
    assert box['x']>=0 and box['x']+box['width']<=width and box['height']>=44
    assert control.evaluate('(el)=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest("button")===el}')
   for i,a in enumerate(boxes):
    for b in boxes[i+1:]:assert a['x']+a['width']<=b['x'] or b['x']+b['width']<=a['x'] or a['y']+a['height']<=b['y'] or b['y']+b['height']<=a['y']
   item.tap();assert page.get_by_role('dialog',name='Interactive device',exact=True).is_visible()
   page.locator('[data-device-close]').click();portal.tap();assert page.evaluate('window.commands')==[{'entityId':'arcade'},{'entityId':'portal'}]
   page.evaluate('window.pair.renderPortal(null)');assert item.is_visible() and not portal.is_visible()
   page.evaluate('''()=>{const stage=document.querySelector('.house-stage');for(const name of ['game-camera-toggle','broadcast-controls']){const el=document.createElement(name==='game-camera-toggle'?'button':'div');el.className=name;if(name==='game-camera-toggle'){el.textContent='View';el.onclick=()=>window.viewClicks=(window.viewClicks||0)+1;}else for(let i=0;i<5;i++){const b=document.createElement('button');b.textContent='Camera '+i;el.append(b);}stage.append(el);}}''')
   page.wait_for_selector('.game-display-flow-views .game-camera-toggle')
   views=page.locator('.game-display-flow-views').bounding_box()
   panel=page.locator('.basketball-hud').bounding_box()
   assert views['y']+views['height']<=panel['y']
   assert page.locator('.game-display-flow-views').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
   more=page.get_by_role('button',name='More view controls',exact=True)
   more.click()
   assert page.locator('.game-camera-toggle').evaluate("n=>!!n.closest('.game-view-overflow')")
   page.locator('.game-camera-toggle').tap()
   assert page.evaluate('window.viewClicks')==1
   page.evaluate("const xr=document.createElement('button');xr.className='xr-enter-button';xr.hidden=true;xr.disabled=true;xr.textContent='VR headset unavailable';xr.style.cssText='display:block;position:fixed;top:8px;left:0;width:100%;z-index:80';document.querySelector('.house-stage').append(xr);")
   page.wait_for_selector('.game-view-overflow > .xr-enter-button',state='attached')
   assert not page.locator('.xr-enter-button').is_visible(), 'Unsupported VR cannot block game controls'
   assert page.locator('.game-hud-toggle').count()==0, 'Maps and controls must not have a global lock/restore button'
   page.evaluate("for(const name of ['rad-tox-hud','basketball-controls','range-ops-button','live-local-map']){const control=document.createElement('button');control.className=name;control.textContent=name;document.querySelector('.house-stage').append(control);}")
   stage_box=page.locator('.house-stage').bounding_box()
   page.evaluate("window.hudEvents=[];window.blurCount=0;document.addEventListener('muzikaz:game-hud-visibility',event=>hudEvents.push(event.detail.hidden));window.addEventListener('blur',()=>blurCount++);")
   # An old hidden-state attribute cannot hide maps, incoming dashboards or
   # the touch dock after the global hide behavior has been removed.
   page.evaluate("document.querySelector('.house-stage').dataset.hudHidden='true';const shell=document.createElement('section');shell.className='house-explorer-shell';shell.dataset.hudHidden='true';shell.innerHTML='<div class=house-control-dock><button aria-label=Controller>Move</button></div>';document.body.append(shell);")
   page.evaluate("""async()=>{const stage=document.querySelector('.house-stage'),{mountRoadVehicleUI}=await import('/public/js/road-vehicle-ui.js'),{ROAD_VEHICLES}=await import('/public/js/road-vehicles.js');const modelId=Object.keys(ROAD_VEHICLES).find(id=>!ROAD_VEHICLES[id].siteOnly);window.roadState={serverTime:1000,players:{me:{vehicleId:'car'}},actors:{car:{id:'car',modelId,active:true,position:{x:0,y:0,z:0},driving:{speed:0}}}};window.road=mountRoadVehicleUI(stage,async()=>({result:{message:'Confirmed'}}));road.update(roadState,'me');road.update(roadState,'me');}""")
   page.wait_for_function("document.querySelector('.game-display-flow > .road-vehicle-controls')!==null")
   assert page.locator('.road-vehicle-controls').is_visible()
   assert page.locator('.game-display-flow-views .sports-action-utilities').is_visible()
   assert page.locator('.house-control-dock').is_visible()
   assert page.locator('.game-camera-toggle').is_visible()
   for name in ['rad-tox-hud','basketball-controls','range-ops-button','live-local-map']:assert page.locator('.'+name).is_visible()
   assert page.locator('.house-stage').bounding_box()==stage_box
   assert page.evaluate('hudEvents')==[]
   assert page.evaluate('blurCount')==0, 'Layout updates must not reset held movement'
   # Vehicle dashboard utilities share More without changing the driving panel.
   page.get_by_role('button',name='Show or hide road vehicle dashboard',exact=True).click()
   assert not page.locator('.road-vehicle-details').is_visible()
   page.evaluate("road.update(roadState,'me')")
   assert not page.locator('.road-vehicle-details').is_visible()
   assert page.locator('.live-local-map').is_visible()
   assert page.locator('.house-control-dock').is_visible()
   page.evaluate("document.querySelector('.house-stage').removeAttribute('data-hud-hidden')")
   page.evaluate('road.dispose();flow.dispose()')
   assert page.locator('.house-stage').get_attribute('data-hud-hidden') is None
   assert page.locator('.game-hud-toggle').count()==0
   assert not errors,errors
   if width==390:page.screenshot(path='/tmp/separate-nearby-actions.png')
   page.close()
  browser.close()
 print('Sports/nearby actions, header map/menu access and persistent controller visibility, incoming road dashboards and local collapse passed at 320, 390, 768 and 1280px.')
finally:server.shutdown()
