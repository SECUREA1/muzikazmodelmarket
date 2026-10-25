"""Exercise the complete server-backed builder catalog at phone and desktop widths."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json
import os
import subprocess

os.chdir(Path(__file__).resolve().parents[1])
catalog = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', """
import {GAME_ECONOMY} from './game-economy.mjs';
import {createBuildingCatalog} from './public/js/in-game-building-catalog.js';
const economy=GAME_ECONOMY.map(item=>({...item,owned:item.basic===true||item.buildAssetId==='sofa'||item.buildAssetId==='basketball-jersey-home'}));
console.log(JSON.stringify({economy,assets:createBuildingCatalog(economy)}));
"""], text=True))
assert len(catalog['assets']) == 500
fixture = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:#09110b;color:#eff8e9;font:14px system-ui}button,input,select{font:inherit}button{min-height:44px;cursor:pointer}button:disabled{cursor:default}[hidden]{display:none!important}main{max-width:1140px;padding:12px;margin:auto}
</style></head><body><main><section data-build-browser></section></main><script type="module">
import {mountBuildAssetBrowser} from '/public/js/build-asset-browser.js';
import {GameEconomy} from '/public/js/game-economy-client.js';
const {assets,economy:records}=await fetch('/__builder_catalog').then(response=>response.json());window.assets=assets;
const root=document.querySelector('[data-build-browser]');window.actions=[];window.blocked=[];window.tray=[];
window.economy=new GameEconomy({inventory:{},announce:()=>{},shop:sku=>blocked.push(sku)});economy.items=records;economy.install(root);
root.addEventListener('click',event=>{const inventory=event.target.closest('[data-build-asset]'),place=event.target.closest('[data-place-build-asset]');if(inventory)actions.push({action:'inventory',id:inventory.dataset.buildAsset});if(place)actions.push({action:'place',id:place.dataset.placeBuildAsset});});
window.remount=()=>{const previous=window.browser?.state()||{};window.browser?.dispose();window.browser=mountBuildAssetBrowser(root,{assets,tray,previous});economy.decorate();};remount();document.body.dataset.ready='true';
</script></body></html>'''

class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
  for width, height in [(320,740),(390,844),(768,900),(1280,900)]:
   page = browser.new_page(viewport={'width':width, 'height':height})
   page.set_default_timeout(10000)
   errors = []
   page.on('pageerror', lambda error: errors.append(str(error)))
   page.route('**/__building_browser', lambda route: route.fulfill(body=fixture, content_type='text/html'))
   page.route('**/__builder_catalog', lambda route: route.fulfill(body=json.dumps(catalog), content_type='application/json'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__building_browser')
   page.wait_for_selector('body[data-ready=true]', state='attached')
   assert page.locator('[data-build-card]').count() == 12
   assert page.locator('[data-build-results]').inner_text() == '500 of 500 building items'
   assert page.locator('canvas').count() <= 1, 'Catalog browsing should not create hundreds of 3D canvases.'
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   first = page.locator('[data-build-inspector] [data-build-row]').get_attribute('data-build-id')
   page.locator('[data-build-next]').click()
   assert 'Page 2' in page.locator('[data-build-page]').inner_text()
   assert page.locator('[data-build-inspector] [data-build-row]').get_attribute('data-build-id') != first
   state = page.evaluate('window.browser.state()')
   page.evaluate('remount()')
   assert page.evaluate('window.browser.state()') == state

   page.locator('[data-build-search]').fill('cloud sofa')
   selected = page.locator('[data-build-inspector] [data-build-row]')
   assert selected.get_attribute('data-build-id') == 'sofa'
   assert 'seat' in selected.inner_text().lower()
   assert selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == page.evaluate("economy.skuForAsset(assets.find(item=>item.id==='sofa'))")
   selected.locator('[data-build-asset]').click()
   selected.locator('[data-place-build-asset]').click()
   assert page.evaluate('actions') == [{'action':'inventory','id':'sofa'},{'action':'place','id':'sofa'}]
   # The capture guard checks current ownership again even if the preview still
   # displays an enabled action from an earlier inventory snapshot.
   page.evaluate("window.sofaSku=economy.skuForAsset(assets.find(item=>item.id==='sofa'));economy.get(sofaSku).owned=false")
   selected.locator('[data-place-build-asset]').click()
   assert page.evaluate('blocked') == [page.evaluate('sofaSku')]
   assert len(page.evaluate('actions')) == 2
   page.evaluate("economy.get(sofaSku).owned=true;blocked=[]")
   page.locator('[data-build-function]').select_option('seat')
   page.locator('[data-build-ownership]').select_option('owned')
   state = page.evaluate('window.browser.state()')
   page.evaluate('remount()')
   assert page.evaluate('window.browser.state()') == state
   assert page.locator('[data-build-results]').inner_text() == '1 of 500 building items'

   page.locator('[data-build-reset]').first.click()
   page.locator('[data-build-source]').select_option('glb')
   assert page.locator('[data-build-results]').inner_text() == '55 of 500 building items'
   glb_id = selected.get_attribute('data-build-id')
   assert glb_id.startswith('glb:')
   assert selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == page.evaluate('id=>assets.find(item=>item.id===id).economySku',glb_id)
   page.locator('[data-build-source]').select_option('tool')
   assert page.locator('[data-build-results]').inner_text() == '24 of 500 building items'
   page.locator('[data-build-search]').fill('laser')
   assert selected.get_attribute('data-build-id') == 'tool:laser'
   assert selected.locator('[data-place-build-asset]').inner_text().startswith('Equip tool')
   assert selected.locator('[data-build-asset]').count() == 0
   assert selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == 'tool:laser'
   page.locator('[data-build-source]').select_option('all')
   page.locator('[data-build-search]').fill('home basketball jersey')
   assert selected.locator('[data-place-build-asset]').inner_text().startswith('Equip jersey')
   assert selected.locator('[data-build-asset]').count() == 1
   page.locator('[data-build-search]').fill('nothing-in-this-catalogue')
   assert page.locator('[data-build-empty]').is_visible()
   assert page.locator('[data-build-layout]').is_hidden()
   page.locator('[data-build-empty] [data-build-reset]').click()
   page.locator('[data-build-category]').select_option('materials')
   page.locator('[data-build-search]').fill('Cement')
   assert selected.get_attribute('data-build-id') == 'material:cement'
   assert selected.locator('[data-place-build-asset]').get_attribute('data-economy-sku') == 'material:cement'
   assert selected.locator('[data-place-build-asset]').is_enabled()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=f'/tmp/in-game-building-browser-{width}.png', full_page=True)
   assert not errors, errors
   page.close()
  browser.close()
 print('All 500 builder entries: filters, paging, selection, exact SKU guards, tool equipment, state and 320/390/768/1280px layout passed.')
finally:
 server.shutdown()
