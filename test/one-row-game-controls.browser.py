"""Companion panels never freeze controls; the top toolbar stays one row."""
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
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/construction-controls.html');page.wait_for_selector('body[data-ready=true]')
   page.evaluate('''async()=>{
    const stage=document.querySelector('main');window.selectMachine('site-excavator','excavator');
    const THREE=await import('/public/vendor/three/three.module.min.js');
    const {mountWorldResidentUI}=await import('/public/js/world-resident-ui.js'),{mountTransportActivity}=await import('/public/js/transport-activity.js'),{mountDistrictMap}=await import('/public/js/district-map.js');
    const camera=document.createElement('button');camera.className='game-camera-toggle';camera.innerHTML='<svg width="24" height="24"><circle cx="12" cy="12" r="8"/></svg>';camera.setAttribute('aria-label','Camera view');stage.append(camera);
    window.world={id:'skyscraper-construction',name:'Construction',builderScene:{mapSize:128,objects:[],layoutMeta:{locations:[{id:'yard',name:'Yard',x:0,z:0}]}}};
    window.live={serverTime:1000,transportRadio:[{id:'call',at:1000,speaker:'Maya',text:'Site crew ready'}],players:{me:{position:{x:0,y:0,z:0},health:100}},actors:{guide:{id:'guide',resident:{name:'Maya Chen',role:'Guide'},position:{x:0,y:0,z:0}}}};
    const residents=mountWorldResidentUI(stage,async()=>({}));residents.update(live,'me',world);
    const radio=mountTransportActivity({stage,command:async()=>({}),THREE,scene:new THREE.Scene(),airportRadio:{trafficAudio(){},receiveTraffic(){}}});radio.update(live,'me',world);
    window.map=mountDistrictMap({stage,command:async()=>({}),fetchAtlas:async()=>({locations:[]})});map.update(world);map.updateLive(live,'me');map.setReady(true);
    state.construction={crew:{workers:[],jobs:[]}};dashboard.update(state,'me');
    window.keys=[];window.blocked=()=>import('/public/js/game-menu-controls.js').then(m=>m.gameplayOverlayOpen());
    window.addEventListener('keydown',event=>{keys.push(event.key);if(['w',' '].includes(event.key))event.preventDefault();});
   }''')
   page.locator('.district-map-toggle').wait_for(state='visible');page.wait_for_timeout(200)
   assert page.locator('.game-viewport-toggle,#house-fullscreen').count()==0
   geometry=page.locator('.game-display-flow-views').evaluate('''row=>{const r=row.getBoundingClientRect(),buttons=[...row.querySelectorAll('button')].filter(b=>!b.closest('.game-view-overflow,.world-resident-panel,.transport-radio-panel,.live-local-map [data-body]')&&b.getClientRects().length);return {height:r.height,items:buttons.map(b=>{const a=b.getBoundingClientRect(),hit=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);return {name:b.getAttribute('aria-label'),top:a.top-r.top,width:a.width,inside:a.left>=r.left-.5&&a.right<=r.right+.5,hit:hit===b||b.contains(hit)}})};}''')
   assert geometry['height']==44,geometry
   assert all(abs(b['top'])<1 and b['inside'] and b['hit'] and b['width']>=43.5 for b in geometry['items']),geometry
   more=page.get_by_role('button',name='More view controls',exact=True)
   if more.is_visible():
    more.click();assert page.locator('.game-view-overflow').is_visible()
    page.get_by_role('button',name='Construction crew and jobs',exact=True).click();assert page.locator('.construction-crew-dialog').is_visible()
    page.get_by_role('button',name='Close crew',exact=True).click()
   residents=page.get_by_role('button',name='Residents, conversations and daily objectives',exact=True);residents.click()
   assert not page.evaluate('blocked()'),'People panel paused the entire game'
   page.keyboard.press('w');assert page.evaluate('keys.splice(0)')==['w']
   page.locator('.world-resident-panel').evaluate('panel=>{const input=document.createElement("input");input.setAttribute("aria-label","Conversation message");panel.append(input);}')
   message=page.get_by_role('textbox',name='Conversation message');message.focus();page.keyboard.press('w');page.keyboard.press('Space');assert message.input_value()=='w ';assert page.evaluate('keys.splice(0)')==[]
   page.locator('.district-map-toggle').click();assert page.locator('.district-map-dialog').is_visible()
   assert not page.evaluate('blocked()'),'Companion maps and people must share gameplay'
   page.locator('.district-map-dialog').get_by_role('button',name='Close',exact=True).click()
   page.get_by_role('button',name='Close resident conversations',exact=True).click()
   page.get_by_role('button',name='Crew radio and vehicle quests',exact=True).click();page.keyboard.press('w');assert page.evaluate('keys.splice(0)')==['w']
   page.get_by_role('button',name='Close crew radio',exact=True).click()
   if width==390:page.screenshot(path='/tmp/one-row-controls-preview.png')
   assert not errors,errors;page.close()
  browser.close()
 print('One-row, 44px controls and nonblocking people/radio/maps passed at 320, 390, 844 and 1280px.')
finally:server.shutdown()
