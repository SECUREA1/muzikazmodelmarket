from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
from pathlib import Path
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [320,390,700,1024]:
  page=browser.new_page(viewport={'width':width,'height':844});page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
  page.evaluate('''async()=>{document.body.innerHTML='<link rel="stylesheet" href="/public/assets/game-menus.css"><dialog class="game-fullscreen-dialog" open style="width:100%;box-sizing:border-box;margin:0;padding:10px"><section class="game-fullscreen-content" data-brick-material-menu><h3>Building materials</h3><p>Choose an item.</p><button data-building-types-toggle>Item types</button><nav data-building-types hidden><button>Blocks</button></nav><label>Find an item<input data-building-search type="search"></label><p data-building-result-count>2 items shown</p><div class="building-design-layout"><div><div class="rad-brick-material-grid"><div class="building-item-row"><button data-brick-material="studs"><span class="building-item-copy"><strong>Studded brick</strong><small>Solid block</small></span></button><button class="building-row-use">Use</button></div><div class="building-item-row"><button data-brick-material="wood"><span class="building-item-copy"><strong>Wood</strong></span></button></div></div></div><aside class="building-design-controls"><h4>View your item</h4><canvas data-building-3d-preview></canvas><button data-building-equip>Select item</button></aside></div></section></dialog>';const {mountBuildingMaterialWorkspace}=await import('/public/js/building-material-workspace.js');mountBuildingMaterialWorkspace(document.querySelector('[data-brick-material-menu]'));}''')
  if width<=700:
   page.wait_for_function("getComputedStyle(document.querySelector('.building-material-menu')).display==='flex'")
   left=page.locator('.building-material-sidebar').bounding_box();right=page.locator('.building-design-controls').bounding_box();assert left['x']+left['width']<=right['x']
   assert right['x']+right['width']<=width
   toggle=page.get_by_role('button',name='Show or hide building items');toggle.click();assert not page.locator('.building-material-list').is_visible();assert toggle.get_attribute('aria-expanded')=='false'
   toggle.click();assert page.locator('[data-building-search]').is_visible();assert page.locator('[data-brick-material=wood]').is_visible()
  else:assert page.locator('.building-material-list').is_visible()
  page.close()
 browser.close()
server.shutdown();print('Building sidebar and selected-item workspace passed at 320, 390, 700 and 1024px.')
