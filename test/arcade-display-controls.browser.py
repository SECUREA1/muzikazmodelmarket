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
  for width,height in [(320,568),(390,844),(667,375),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height});page.route('**/public/js/arcade-game.js',lambda route:route.fulfill(body='',content_type='text/javascript'))
   page.goto(f'http://127.0.0.1:{server.server_port}/arcade.html')
   page.evaluate('''async()=>{const lobby=document.createElement('details');lobby.id='game-lobby';lobby.innerHTML='<summary>Game lobby</summary><div class="lobby-body"><button id="start-round">Start game</button></div>';document.querySelector('#game').append(lobby);window.lobby=lobby;document.querySelector('#attractions').innerHTML='<button>Basketball</button>';const {mountRadToxController}=await import('/public/js/rad-tox-controller.js');mountRadToxController({enabled:()=>true});const {mountArcadeDisplayControls}=await import('/public/js/arcade-display-controls.js');mountArcadeDisplayControls({lobby});document.querySelector('#start-round').onclick=()=>{lobby.open=false;};}''')
   menu=page.get_by_role('button',name='Arcade menu and match lobby',exact=True);menu.click();park=page.get_by_role('dialog',name='Explore the arcade',exact=True);assert park.is_visible();park.locator('#attractions button').click();assert not park.is_visible()
   page.evaluate("document.body.classList.add('playing');document.querySelector('#game').show();document.querySelector('#gametitle').textContent='Basketball';lobby.open=true;")
   match=page.get_by_role('dialog',name='Match lobby',exact=True);match.wait_for();match.locator('#start-round').click();assert not match.is_visible()
   assert not page.locator('#game-lobby').is_visible();assert not page.locator('#instructions').is_visible();assert page.locator('.scorebar').is_visible()
   info=page.get_by_role('button',name='Game controls and information',exact=True);info.click();assert page.get_by_role('dialog',name='Game controls and information').is_visible();page.keyboard.press('Escape');assert not page.get_by_role('dialog',name='Game controls and information').is_visible();assert page.locator('#game').is_visible()
   controls=page.locator('.arcade-display-toolbar button');boxes=[controls.nth(i).bounding_box() for i in range(controls.count())]
   for box in boxes:assert box['x']>=0 and box['x']+box['width']<=width and box['height']>=44
   score=page.locator('.scorebar').bounding_box();assert score['y']+score['height']<height/2
   page.wait_for_function('parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--arcade-footer-height"))>0')
   header=page.locator('.arcade-dashboard-header').bounding_box();footer=page.locator('.arcade-dashboard-footer').bounding_box();world=page.locator('#world').bounding_box()
   assert header['y']==0 and footer['y']+footer['height']<=height+1
   assert world['y']>=header['y']+header['height']-1 and world['y']+world['height']<=footer['y']+1
   assert all(box['y']>=footer['y'] and box['y']+box['height']<=height for box in boxes)
   for stick in page.locator('.arcade-dashboard-footer .thumbstick-base:visible').all():
    box=stick.bounding_box();assert box['y']>=footer['y'] and box['y']+box['height']<=height
   menu.click();assert match.is_visible();menu.evaluate('el=>el.click()');assert not match.is_visible()
   page.close()
  browser.close()
 print('Arcade SVG toggles, lobby/info popups, visible scores and clear center view passed on mobile portrait, landscape and desktop.')
finally:server.shutdown()
