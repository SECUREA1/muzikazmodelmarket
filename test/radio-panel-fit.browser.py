from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
  page=browser.new_page(viewport={'width':390,'height':700},is_mobile=True,has_touch=True)
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.add_style_tag(url='/styles.css')
  page.add_style_tag(url='/public/assets/local-live-map.css')
  page.evaluate('''async()=>{const THREE=await import('/public/vendor/three/three.module.min.js');const {mountTransportActivity}=await import('/public/js/transport-activity.js');document.body.replaceChildren();const stage=document.createElement('main');stage.className='house-stage';const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');mountGameDisplayFlow(stage);stage.style.cssText='height:100dvh;position:relative';document.body.append(stage);window.ui=mountTransportActivity({stage,THREE,scene:new THREE.Scene(),command:async()=>({})});ui.update({serverTime:1000,players:{p:{position:{x:0,y:0,z:0}}},actors:{},transportRadio:Array.from({length:6},(_,i)=>({id:i+1,at:1000,speaker:'Harbor control',text:'Incoming traffic at the harbor. Maintain separation and proceed to the marked dock for your next assignment.'}))},'p',{id:'marina'});}''')
  toggle=page.get_by_role('button',name='Crew radio and vehicle quests',exact=True)
  panel=page.get_by_role('region',name='Crew radio dispatch panel')
  for width,height in [(390,700),(320,568),(844,390),(1100,780)]:
   page.set_viewport_size({'width':width,'height':height})
   assert page.locator('.game-display-flow-views .transport-radio-toggle').count()==1
   tb=toggle.bounding_box();icon=toggle.locator('svg').bounding_box()
   assert abs(tb['width']-44)<.01 and abs(tb['height']-44)<.01,tb
   assert abs(icon['x']+icon['width']/2-tb['x']-22)<1
   assert abs(icon['y']+icon['height']/2-tb['y']-22)<1
   toggle.click()
   box=panel.bounding_box()
   assert box['y']>=tb['y']+tb['height']+7,(box,tb)
   assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width and box['y']+box['height']<=height,box
   assert panel.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
   assert panel.locator('header').first.bounding_box()['height']<70
   panel.locator('section').last.scroll_into_view_if_needed()
   assert panel.evaluate('(el)=>el.scrollTop>0')
   close=page.get_by_role('button',name='Close crew radio',exact=True)
   cb=close.bounding_box()
   assert 0<=cb['y'] and cb['y']+cb['height']<=height,cb
   assert panel.locator('section').last.bounding_box()['y']<height
   if width==390: page.screenshot(path='/workspace/radio-mobile-fit.png')
   close.click()
   assert not panel.is_visible()
   assert toggle.get_attribute('aria-expanded')=='false'
  toggle.click()
  page.keyboard.press('Escape')
  assert not panel.is_visible()
  assert toggle.evaluate('(el)=>el===document.activeElement')
  page.evaluate('ui.dispose()')
  browser.close()
 print('Radio panel fits phone, narrow phone, landscape and desktop; lower actions scroll, Close stays visible, Escape returns focus.')
finally: server.shutdown()
