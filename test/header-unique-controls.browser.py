"""Header mounting and refits retain one live control per action."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
fixture='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#14251d;color:#f0ffef}.house-stage{position:relative;margin:8px;height:calc(100vh - 120px);min-height:250px;background:#193427}button{min-height:44px;padding:8px;border:1px solid #9bcba4;border-radius:8px;background:#15372a;color:#efffea}.game-dock-actions{display:flex;gap:8px}.mobile-move-pad{padding:8px}</style><div class="house-explorer-shell"><div class="house-stage"><button class="game-camera-toggle">Camera</button><button class="game-flashlight-toggle">Flashlight</button><div class="live-local-map"><header><button data-collapse>Map</button></header><div data-body hidden>Markers</div></div></div><div class="house-control-dock"><div class="game-dock-actions"><button id="world">World</button><button id="settings">Settings</button><button id="tools">Tools</button></div><div class="mobile-move-pad"><button id="move">Move</button></div></div></div>'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/__unique_header',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__unique_header')
   page.evaluate('''async()=>{
    const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
    window.stage=document.querySelector('.house-stage');window.clock=100000;window.env={id:'unique-header',spawn:{x:0,y:0,z:0}};window.sim={};window.player={id:'p',health:100,position:{x:30,y:0,z:30}};
    stepDoomsday(sim,env,clock,{players:[player],random:()=>0});window.world=document.querySelector('#world');window.worldCount=0;world.onclick=()=>worldCount++;
    window.mountFlow=()=>mountGameDisplayFlow(stage);window.mountUI=()=>mountDoomsdayUI({stage,getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>player.position,getPreferences:()=>({masterMuted:true,effectsMuted:true,announcementsMuted:true}),now:()=>clock});
    window.display=mountFlow();window.ui=mountUI();ui.tick(0);window.sameDisplay=mountFlow()===display;window.sameUI=mountUI()===ui;
    window.idsUnique=()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return new Set(ids).size===ids.length;};
    window.refit=()=>stage.dispatchEvent(new CustomEvent('muzikaz:action-bars-visibility'));
   }''')
   radio=page.get_by_role('button',name='Radio & sound',exact=True);radio.wait_for(state='visible')
   assert page.evaluate('sameDisplay&&sameUI'),'repeated mount manufactured another instance'
   assert page.locator('.game-display-flow-views').count()==1 and page.locator('.game-view-more').count()==1
   assert page.locator('.emergency-radio-toggle').count()==1 and page.locator('.emergency-nuclear-toggle').count()==1
   assert page.evaluate('idsUnique()')
   radio.focus();page.evaluate('''async()=>{for(let i=0;i<8;i++){refit();ui.tick(i/60);await new Promise(requestAnimationFrame);}}''')
   assert radio.evaluate('n=>document.activeElement===n'),'unchanged pinned refit dropped focus'
   page.evaluate('''()=>{window.presses=window.lostCapture=window.activations=0;const button=document.querySelector('.emergency-radio-toggle');button.addEventListener('pointerdown',event=>{presses++;button.setPointerCapture(event.pointerId);});button.addEventListener('lostpointercapture',()=>lostCapture++);button.addEventListener('click',()=>activations++);}''')
   box=radio.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down()
   page.evaluate('''async()=>{for(let i=0;i<5;i++){refit();await new Promise(requestAnimationFrame);}}''')
   assert page.evaluate('presses===1&&lostCapture===0'),'refit reparented an unchanged held button'
   page.mouse.up();assert page.evaluate('activations')==1
   assert page.locator('#emergency-sound-panel').is_visible(),'one click toggled twice through duplicate handlers'
   page.get_by_role('button',name='Close Radio & sound',exact=True).click()
   page.get_by_role('button',name='World',exact=True).click();assert page.evaluate('worldCount')==1
   page.evaluate('''async()=>{for(let i=0;i<12;i++){if(mountFlow()!==display||mountUI()!==ui)throw Error('duplicate remount');ui.tick(i/60);refit();await new Promise(requestAnimationFrame);}}''')
   assert page.locator('.game-view-more').count()==1 and page.locator('.emergency-radio-toggle,.emergency-nuclear-toggle').count()==2
   assert page.evaluate('idsUnique()')
   page.evaluate('ui.dispose();ui.dispose();display.dispose();display.dispose();display=mountFlow();ui=mountUI();ui.tick(0)')
   page.locator('.emergency-radio-toggle').wait_for(state='visible')
   assert page.locator('.game-display-flow-views').count()==1 and page.locator('.emergency-radio-toggle,.emergency-nuclear-toggle').count()==2
   assert page.evaluate('idsUnique() && document.querySelector("#world")===world')
   assert not errors,errors
   print(f'{width}x{height}: one header/control instance, original handlers, unique IDs and held focus/capture survive refits',flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
