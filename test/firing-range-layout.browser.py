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
  for width,height,stage_height in [(320,568,360),(390,844,500),(667,375,250),(1280,800,600)]:
   page=browser.new_page(viewport={'width':width,'height':height});page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
   page.evaluate('''async height=>{document.body.innerHTML='<style>body{margin:0;background:#122219}.house-stage{position:relative;width:100%}.target{position:absolute;left:calc(50% - 20px);top:calc(50% - 20px);width:40px;height:40px;background:white}</style><div class="house-stage"><div class="target"></div><button class="rad-tox-fire-trigger">Extra fire</button></div>';const stage=document.querySelector('.house-stage');stage.style.height=height+'px';const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');mountGameDisplayFlow(stage);const {mountFiringRangeHud}=await import('/public/js/firing-range-hud.js');const {FIRING_RANGE_DEFAULTS}=await import('/public/js/firing-range.js');window.hud=mountFiringRangeHud({stage,onAction:async()=>{}});window.game={state:'live',hostId:'self',settings:{...FIRING_RANGE_DEFAULTS,mode:'freeplay'},participants:{self:{id:'self',name:'Player',role:'player',lane:0,score:120,shots:5,hits:4}},locations:[]};hud.render(game,'self',true);}''',stage_height)
   page.wait_for_selector('.game-display-flow > .firing-range-hud')
   visible=page.locator('.firing-range-actions button:visible');assert visible.count()==3
   header=page.locator('.firing-range-telemetry').bounding_box();controls=page.locator('.firing-range-hud').bounding_box();target=page.locator('.target').bounding_box()
   assert header['y']+header['height']<=target['y'];assert controls['y']>=target['y']+target['height'];assert controls['x']>=0 and controls['x']+controls['width']<=width
   assert not page.locator('.rad-tox-fire-trigger').is_visible();assert page.locator('[data-self-score]').inner_text()=='120 pts'
   page.locator('[data-range-aim]').click();lens=page.locator('.firing-range-scope-lens').bounding_box();assert lens['width']<=width and lens['height']<=stage_height
   page.locator('[data-range-open]').click();assert page.locator('.firing-range-panel').is_visible();page.locator('.firing-range-panel [data-range-close]').first.click();assert page.locator('[data-self-score]').is_visible()
   for phase in ['ready','countdown','finished']:
    page.evaluate('(phase)=>{game.state=phase;hud.render(game,"self",true);}',phase);assert page.locator('.firing-range-actions button:visible').count()<=3
   page.evaluate('hud.render(null,"self",false)');assert not page.locator('.firing-range-telemetry').is_visible();page.close()
  browser.close()
 print('Range HUD separation, clear center view, scope sizing and operation panels passed on portrait, landscape and desktop screens.')
finally:server.shutdown()
