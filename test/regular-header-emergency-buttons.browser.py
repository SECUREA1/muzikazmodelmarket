"""Keep SVG header controls with More, and one combined emergency popup."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
fixture='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#152722;color:#efffe9;font:14px system-ui}.house-explorer-shell{margin:8px;position:relative}.house-stage{height:calc(100vh - 110px);min-height:240px;position:relative;background:#17392b}button{padding:8px;border:1px solid #a4c8a0;border-radius:8px;background:#244234;color:#efffe9;min-height:44px}#fire{position:absolute;bottom:8px;right:8px}.game-dock-actions{display:flex;gap:6px}.mobile-move-pad{padding:8px}
</style><div class="house-explorer-shell"><div class="house-stage"><button class="game-camera-toggle">Camera view</button><button class="game-flashlight-toggle">Flashlight</button><div class="live-local-map"><header><button data-collapse>Map</button></header><div data-body hidden>Map markers</div></div><button id="fire">Fire</button></div><div class="house-control-dock"><div class="house-bottom-controls"><div class="game-dock-actions"><button id="world">World</button><button id="settings">Settings</button><button id="build">Build</button></div></div><div class="mobile-move-pad"><button id="move">Move player</button></div></div></div>'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/__regular_header',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__regular_header')
   page.evaluate('''async()=>{
    const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
    const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
    const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
    window.clock=100000;window.env={id:'regular-header-airport',spawn:{x:0,y:0,z:0}};window.sim={};window.player={id:'pilot',health:100,position:{x:30,y:0,z:30}};
    stepDoomsday(sim,env,clock,{players:[player],random:()=>0});
    window.clicks={};for(const id of ['world','settings','build','fire','move'])document.getElementById(id).onclick=()=>clicks[id]=(clicks[id]||0)+1;
    window.dock=document.querySelector('.game-dock-actions');window.dockParent=dock.parentElement;
    window.display=mountGameDisplayFlow(document.querySelector('.house-stage'));
    window.ui=mountDoomsdayUI({stage:document.querySelector('.house-stage'),getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>player.position,getPreferences:()=>({masterMuted:true,effectsMuted:true,announcementsMuted:true}),now:()=>clock});
    window.advance=at=>{clock=at;stepDoomsday(sim,env,clock,{players:[player],random:()=>0});ui.tick(clock/1000);};ui.tick(0);
   }''')
   radio=page.get_by_role('button',name='Emergency radio',exact=True);more=page.get_by_role('button',name='More view controls',exact=True);nuclear=page.get_by_role('button',name='Nuclear event',exact=True,include_hidden=True)
   radio.wait_for(state='visible');more.wait_for(state='visible')
   popup=page.locator('#emergency-radio-popup')
   assert page.evaluate('dock.parentElement===dockParent && !dock.closest(".game-view-overflow")')
   for control in [radio,nuclear,more]:
    assert control.evaluate("n=>n.parentElement.classList.contains('game-display-flow-views')")
    box=control.bounding_box();assert box['width']>=44 and box['height']>=44 and box['x']>=0 and box['x']+box['width']<=width+1,(width,box)
    assert control.evaluate("n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}")
   assert page.locator('.game-display-flow-views > button').count()==3
   for selector in ['.game-camera-toggle','.game-flashlight-toggle','.live-local-map']:
    assert page.locator(selector).evaluate("n=>!!n.closest('.game-view-overflow')")
   more.click();assert nuclear.is_visible() and nuclear.is_disabled();more.click()
   for label in ['World','Settings','Build']:page.get_by_role('button',name=label,exact=True).click()
   assert page.evaluate('clicks.world===1&&clicks.settings===1&&clicks.build===1')
   radio.click();assert popup.is_visible() and more.get_attribute('aria-expanded')=='false'
   popup.get_by_text('Radio & sound settings',exact=True).click()
   assert page.locator('#emergency-sound-panel').is_visible()
   assert popup.get_by_role('button',name='Enable sounds',exact=True).is_visible()
   radio.click();assert popup.is_hidden()
   radio.click();page.get_by_role('button',name='Close emergency radio',exact=True).click();assert popup.is_hidden()
   page.evaluate('ui.close();advance(sim.doomsday.nextEventAt)')
   popup.wait_for(state='visible')
   assert more.get_attribute('aria-expanded')=='false'
   assert page.locator('#emergency-nuclear-panel').evaluate("n=>n.parentElement.id==='emergency-radio-popup'")
   assert page.locator('#emergency-nuclear-panel').is_visible() and nuclear.is_enabled()
   assert 'Detonations in' in popup.locator('[data-countdown]').text_content()
   page.get_by_role('button',name='Close emergency radio',exact=True).click();assert popup.is_hidden()
   more.click();nuclear.click();assert popup.is_visible() and more.get_attribute('aria-expanded')=='false'
   page.get_by_role('button',name='Close emergency radio',exact=True).click()
   page.evaluate('advance(sim.doomsday.detonationAt)');assert page.locator('.game-view-overflow').is_hidden()
   assert page.locator('#emergency-radio-popup').count()==1
   page.get_by_role('button',name='Fire',exact=True).click();page.get_by_role('button',name='Move player',exact=True).click()
   assert page.evaluate('clicks.fire===1&&clicks.move===1')
   assert page.locator('.mobile-move-pad').is_visible()
   assert page.evaluate('dock.parentElement===dockParent')
   assert not errors,errors
   print(f'{width}x{height}: SVG header actions + More, one live countdown/radio popup, original dock and movement passed',flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
