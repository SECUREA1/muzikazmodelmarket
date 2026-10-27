"""Two map controls have separate roles and stay reachable in one toolbar row."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass


fixture = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:#142c29}.house-stage{position:relative;width:100vw;height:100dvh;overflow:hidden;background:linear-gradient(145deg,#264a39,#12282e)}
button{min-height:44px;min-width:44px;border:1px solid #8bb6a4;border-radius:9px;background:#14312fe8;color:#edfbe8;padding:8px}button svg{display:block;width:24px;height:24px}.sports-action-utilities{display:flex;gap:4px}canvas{display:block;width:100%;height:100%}
</style></head><body><main class="house-stage"><canvas tabindex="0" aria-label="Game world"></canvas></main><script type="module">
import {mountGameDisplayFlow} from '/public/js/game-display-flow.js';
import {mountDistrictMap} from '/public/js/district-map.js';
import {gameplayOverlayOpen} from '/public/js/game-menu-controls.js';
const stage=document.querySelector('main');
window.addControls=(count,prefix='Control')=>{const group=document.createElement('section');group.className='sports-action-utilities';for(let index=0;index<count;index++){const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',prefix+' '+index);button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor"/></svg>';group.append(button);}stage.append(group);return group;};
const camera=document.createElement('button');camera.type='button';camera.className='game-camera-toggle';camera.setAttribute('aria-label','Camera view');camera.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h12v12H3Zm12 5 6-4v10l-6-4Z" fill="none" stroke="currentColor"/></svg>';stage.append(camera);
window.flow=mountGameDisplayFlow(stage);addControls(3);
const factory=document.createElement('button');factory.type='button';factory.className='factory-toggle';factory.setAttribute('aria-label','Factory jobs');factory.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9l6 3V8l6 3V3h5v18ZM7 16v2m5-2v2m5-2v2" fill="none" stroke="currentColor"/></svg>';stage.append(factory);
window.world={id:'regression-world',name:'Complete Harbor',playableSize:256,spawn:{x:0,y:0,z:0},streets:[{id:'east-west',name:'Quay Road',from:{x:-128,z:30},to:{x:128,z:30},width:4}],builderScene:{mapSize:256,objects:[],layoutMeta:{locations:[{id:'cargo',name:'Cargo dock',x:-25,z:15,width:8,depth:8,description:'Cargo and freight'},{id:'registry',name:'Harbor registry',x:24,z:-22,width:9,depth:9}]}}};
window.live={serverTime:1000,players:{me:{id:'me',username:'Captain',position:{x:0,y:0,z:0}},friend:{id:'friend',username:'Harbor visitor',position:{x:35,y:0,z:26}}},actors:{}};
window.map=mountDistrictMap({stage,fetchAtlas:async()=>({locations:[]})});map.update(world);map.updateLive(live,'me');map.setReady(true);window.blocked=()=>gameplayOverlayOpen();
document.body.dataset.ready='true';
</script></body></html>'''

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
  for width, height in [(320, 568), (390, 844), (844, 390), (1280, 800)]:
   page = browser.new_page(viewport={'width':width, 'height':height}, has_touch=True)
   page.set_default_timeout(7000)
   errors = []
   page.on('pageerror', lambda error: errors.append(str(error)))
   page.route('**/__map_controls', lambda route: route.fulfill(body=fixture, content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__map_controls')
   page.wait_for_selector('body[data-ready=true]')
   primary = page.locator('.district-map-toggle')
   mini = page.locator('.live-local-map')
   secondary = mini.locator('[data-collapse]')
   primary.wait_for(state='visible')
   secondary.wait_for(state='visible')
   page.wait_for_timeout(120)

   def check_toolbar():
    geometry = page.locator('.game-display-flow-views').evaluate('''row=>{const rect=row.getBoundingClientRect(),mini=row.querySelector('.live-local-map [data-collapse]'),primary=row.querySelector('.district-map-toggle'),camera=row.querySelector('.game-camera-toggle'),box=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};},buttons=[...row.querySelectorAll('button')].filter(button=>!button.closest('.game-view-overflow,.live-local-map [data-body]')&&button.getClientRects().length);return {row:box(row),mini:box(mini),primary:box(primary),camera:box(camera),inside:buttons.every(button=>{const r=button.getBoundingClientRect();return r.left>=rect.left-.5&&r.right<=rect.right+.5&&Math.abs(r.top-rect.top)<1;}),rightmost:buttons.every(button=>button===mini||button.getBoundingClientRect().right<=mini.getBoundingClientRect().left+1),pinned:mini.closest('.live-local-map').parentElement===row};}''')
    assert geometry['row']['height'] == 44, geometry
    assert geometry['pinned'] and geometry['rightmost'] and geometry['inside'], geometry
    assert abs(geometry['mini']['right'] - geometry['row']['right']) <= 1, geometry
    assert geometry['mini']['width'] >= 44 and geometry['primary']['width'] >= 44, geometry
    assert geometry['primary']['left'] >= geometry['camera']['right'], geometry
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), geometry

   check_toolbar()
   assert page.locator('.game-display-flow-views > .factory-toggle').is_visible()
   assert primary.locator('svg').inner_html() != secondary.locator('svg').inner_html()
   page.evaluate("addControls(30,'Dynamic')")
   page.wait_for_timeout(120)
   check_toolbar()
   assert page.get_by_role('button', name='More view controls', exact=True).is_visible()

   def complete_map():
    # Section choices switch content; select Map and then its 2D plan.
    dialog.get_by_role('button', name='Map', exact=True).click()
    assert dialog.get_attribute('data-map-section') == 'map'
    assert dialog.locator('[data-map-directory]').is_hidden()
    nav = dialog.get_by_role('navigation', name='Browse map sections', exact=True)
    if height <= 500 and width <= 1024:
     # Short mobile screens share one fixed row between the tabs and Close.
     assert nav.evaluate('node=>{const r=node.getBoundingClientRect(),header=node.closest("header"),h=header.getBoundingClientRect(),close=header.querySelector(":scope>button").getBoundingClientRect();return Math.abs(r.left-h.left)<=1&&r.right<=close.left&&Math.abs(close.right-h.right)<=1&&Math.abs(r.top+r.height/2-close.top-close.height/2)<=1;}')
    else:
     assert nav.evaluate('node=>{const r=node.getBoundingClientRect(),h=node.closest("header").getBoundingClientRect();return r.width<=Math.min(420,h.width)+1&&Math.abs(r.right-h.right)<=1;}')
    dialog.get_by_role('button', name='2D plan', exact=True).click()
    page.wait_for_function(r'''()=>{const svg=document.querySelector('.district-map-dialog [data-local-map-plan]>svg');if(!svg)return false;const [x,z,w,h]=svg.getAttribute('viewBox').split(/\s+/).map(Number);return x<=-128&&z<=-128&&x+w>=128&&z+h>=128;}''')
    assert page.locator('[data-local-map-plan]').is_visible()
    assert page.evaluate('blocked()') == (width <= 1024), 'Mobile full-screen maps block gameplay; desktop companion maps retain it'

   primary.click()
   dialog = page.locator('.district-map-dialog')
   dialog.wait_for(state='visible')
   complete_map()
   assert dialog.locator('[data-local-map-plan]>svg').get_attribute('aria-label') == 'Complete Harbor locations, roads and portal buildings'
   dialog.get_by_role('button', name='Zoom 2D map in', exact=True).click()
   dialog.get_by_role('button', name='Close', exact=True).click()
   primary.click()
   complete_map()
   dialog.get_by_role('button', name='Close', exact=True).click()

   secondary.click()
   popup = mini.locator('[data-body]')
   popup.wait_for(state='visible')
   assert not dialog.is_visible(), 'Secondary map should open only its marker popup'
   assert secondary.get_attribute('aria-expanded') == 'true'
   assert popup.locator('svg[aria-label="Live flat local map"]').is_visible()
   assert mini.locator('g[aria-label="You"]').count() == 1
   assert mini.locator('g[aria-label="Harbor visitor"]').count() == 1
   marker = mini.locator('g[aria-label="Cargo dock"]')
   marker.click()
   assert popup.is_visible() and not dialog.is_visible(), 'Choosing a popup marker must not open the full map'
   assert 'Cargo dock' in mini.locator('[data-selected]').text_content()
   popup_rect = popup.bounding_box()
   assert popup_rect['x'] >= 0 and popup_rect['x'] + popup_rect['width'] <= width + 1, popup_rect
   assert popup_rect['y'] + popup_rect['height'] <= height + 1, popup_rect
   page.screenshot(path=f'/tmp/map-marker-popup-{width}.png')
   mini.locator('[data-expand]').click()
   dialog.wait_for(state='visible')
   assert not popup.is_visible() and secondary.get_attribute('aria-expanded') == 'false'
   complete_map()
   assert dialog.get_by_role('heading', name='⚓ Cargo dock', exact=True).is_visible()
   page.screenshot(path=f'/tmp/complete-map-{width}.png')
   dialog.get_by_role('button', name='Close', exact=True).click()
   secondary.click()
   mini.locator('[data-popup-close]').click()
   assert not popup.is_visible()
   check_toolbar()
   assert not errors, errors
   page.close()
  browser.close()
 print('Primary complete map, pinned distinct marker button, popup-only marker selection and full-map expansion pass at 320, 390, 844 and 1280px.')
finally:
 server.shutdown()
